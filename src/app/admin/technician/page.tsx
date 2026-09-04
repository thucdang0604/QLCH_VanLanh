'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Wrench, Smartphone, Eye,
    CheckCircle2, Loader2, X,
    User as UserIcon, ArrowRightLeft, ShieldAlert, Truck
} from 'lucide-react';
import { collection, query, doc, where, orderBy, limit, startAfter, type DocumentSnapshot, type QueryConstraint, type QuerySnapshot } from 'firebase/firestore';
import { onSnapshot, getDoc, getDocs } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { appConfirm } from '@/lib/appDialog';
import { isChecklistComplete, areAllPartsReady } from '@/lib/workflowFeatures';
import type { RepairIssue, RepairTicket, Product, WorkflowNode } from '@/lib/types';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { PART_CATEGORY_LABEL, isPartCategory } from '@/lib/constants';
import { REPAIR_PART_STATUS, isPendingRepairPart, isRepairPartStatus } from '@/lib/repairStatus';
import { isRepairManager } from '@/lib/repairAccess';
import { getAllowedNextWorkflowNodes, getFirstNonTerminalWorkflowTransition, getWorkflowNormalizationOptions, normalizeRepairWorkflow, normalizeWarrantyWorkflow } from '@/lib/repairWorkflowConfig';
import { isSelectedRepairPart } from '@/lib/repairStatus';
import { getInboundTechnicianHoldMessage } from '@/lib/repairInboundIntake';
import {
    TechnicianWorkflowModals,
    type TechnicianNoteModal,
    type TechnicianPartVerificationSelection,
    type TechnicianPartsVerificationModal,
    type TechnicianStatusModal,
    type TechnicianTransferModal,
} from '@/features/technician/TechnicianWorkflowModals';
import { TechnicianPageHeader } from '@/features/technician/TechnicianPageHeader';
import { TechnicianTicketDetailModal } from '@/features/technician/TechnicianTicketDetailModal';
import {
    filterAvailableCategoryRecommendations,
    getRecommendedPartCategoryIds,
    getRepairServiceCategoryIds,
    getRepairServiceIds,
    type ServiceBusinessLink,
} from '@/lib/serviceRecommendations';
import {
    getRepairPartSearchLookupTokens,
    getScopedRepairPartSearchValues,
    normalizeRepairPartSearch,
    productMatchesRepairDeviceModel,
    productMatchesRepairPartQuality,
    productMatchesRepairPartSearch,
    queryTargetsRepairDeviceModel,
    rankRepairPartSearchResults,
} from '@/lib/repairPartSearch';


const checklistLabels: Record<string, string> = {
    body: 'Vỏ máy', screen: 'Màn hình', touch: 'Cảm ứng', camera: 'Camera',
    speaker: 'Loa/Mic', connectivity: 'Kết nối', battery: 'Pin', biometric: 'FaceID/Vân tay',
};
const CHECKLIST_VALUES = ['OK', 'Trầy', 'Nứt', 'Móp', 'Lỗi', 'Không có'];

const TECHNICIAN_LIVE_PAGE_SIZE = 20;
const TECHNICIAN_PART_RESULT_LIMIT = 40;

type RepairTimelineEntry = NonNullable<RepairTicket['statusTimeline']>[number];

function getTimelineTimestamp(entry: RepairTimelineEntry): Date {
    const value = entry.timestamp ?? entry.at;
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        return value.toDate();
    }
    return value ? new Date(value as string | number | Date) : new Date(0);
}

function getTimelineTitle(entry: RepairTimelineEntry, workflow: WorkflowNode[]): string {
    const partName = entry.partName || 'linh kiện';

    switch (entry.eventType) {
        case 'technician_assigned':
            return `Đã gán cho ${entry.toTechnicianName || 'KTV'}`;
        case 'transfer_requested':
            return `Đề nghị chuyển ${entry.fromTechnicianName || 'KTV hiện tại'} → ${entry.toTechnicianName || 'KTV mới'}`;
        case 'transfer_accepted':
            return `${entry.toTechnicianName || 'KTV mới'} đã nhận phiếu`;
        case 'transfer_rejected':
            return `${entry.toTechnicianName || 'KTV mới'} đã từ chối`;
        case 'transfer_cancelled':
            return 'Đã hủy yêu cầu chuyển KTV';
        case 'manager_override':
            return `Quản lý chuyển ${entry.fromStatus || 'trạng thái'} → ${entry.toStatus || entry.status}`;
        case 'diagnosis_updated':
            return 'KTV đã cập nhật chẩn đoán và giá dự kiến';
        case 'part_selected':
            return `KTV đã chọn ${partName} cho phiếu sửa chữa`;
        case 'part_requested':
            return `KTV đã yêu cầu ${partName}`;
        case 'part_handed_over_to_technician':
            return `Tiếp nhận đã bàn giao ${partName} cho KTV`;
        case 'part_received_by_technician':
            return `KTV đã nhận ${partName}`;
        case 'part_handover_declined':
            return `KTV báo chưa nhận ${partName}`;
        case 'part_selection_cancelled':
            return `Đã bỏ chọn ${partName}`;
        case 'part_request_rejected':
            return `Đã hủy yêu cầu ${partName}`;
        case 'part_return_received':
            return `Tiếp nhận đã nhận lại ${partName}`;
        default:
            return workflow.find(status => status.id === entry.status)?.label || entry.status;
    }
}

function isTechnicianHandoffStatus(status: WorkflowNode | undefined): boolean {
    return status?.allowedFeatures?.includes('requirePaymentGate') === true;
}

function isTicketWaitingForCustomerHandoff(ticket: RepairTicket, workflow: WorkflowNode[]): boolean {
    const status = workflow.find(item => item.id === ticket.status);
    return isTechnicianHandoffStatus(status);
}

function getTechnicianQueryableStatusIds(repairStatuses: WorkflowNode[], warrantyStatuses: WorkflowNode[]): string[] {
    return Array.from(new Set([...repairStatuses, ...warrantyStatuses]
        .filter(status => !status.isTerminal && !isTechnicianHandoffStatus(status))
        .map(status => status.id)
        .filter(Boolean)));
}

function isAssignedTechnicianAtWorkflowEntry(ticket: RepairTicket, workflow: WorkflowNode[], userId: string | undefined): boolean {
    return Boolean(userId)
        && ticket.staff?.assignedTechnician === userId
        && workflow[0]?.id === ticket.status;
}

function getTechnicianAllowedNextStatuses(ticket: RepairTicket, workflow: WorkflowNode[], userId: string | undefined, isManager: boolean): WorkflowNode[] {
    const currentNode = workflow.find(node => node.id === ticket.status);
    if (getInboundTechnicianHoldMessage(ticket, currentNode)) return [];

    // The technician assignment is more specific than a broad permission.
    // Some KTV accounts also have management-related permissions.
    const isAssignedTechnician = ticket.staff?.assignedTechnician === userId;
    const actor = isAssignedTechnician ? 'technician' : isManager ? 'manager' : 'technician';
    const allowedNext = getAllowedNextWorkflowNodes(workflow, ticket.status).filter(nextNode => {
        const allowedActors = currentNode?.transitionActors?.[nextNode.id];
        return !allowedActors || allowedActors.includes(actor);
    });
    const customerDecision = ticket.customerApproval?.decision
        || (ticket.customerApproval?.approvedAt ? 'approved' : undefined);

    // At the quotation node, KTV must wait for reception to record the
    // customer's answer. A declined quote can only move to the configured
    // handover exit; approved work keeps the normal configured branches.
    if (currentNode?.allowedFeatures?.includes('confirmCustomerResponse')) {
        if (!customerDecision) return [];
        if (customerDecision === 'declined') {
            return allowedNext.filter(node => node.terminalAction === 'handover');
        }
    }

    // The first node is the dynamic intake node. An assigned KTV gets one
    // action here: begin the first non-terminal technical step.
    if (isAssignedTechnicianAtWorkflowEntry(ticket, workflow, userId)) {
        const startNode = getFirstNonTerminalWorkflowTransition(workflow, ticket.status);
        return startNode && allowedNext.some(node => node.id === startNode.id) ? [startNode] : [];
    }

    return allowedNext;
}

function getTicketCreatedAtMillis(ticket: RepairTicket): number {
    const createdAt = ticket.createdAt as unknown as { toMillis?: () => number } | number | undefined;
    return typeof createdAt === 'number' ? createdAt : createdAt?.toMillis?.() || 0;
}

function sortTicketsByCreatedAtDesc(ticketsToSort: RepairTicket[]): RepairTicket[] {
    return [...ticketsToSort].sort((a, b) => getTicketCreatedAtMillis(b) - getTicketCreatedAtMillis(a));
}

type TechnicianTicketQueryScope = 'manager' | 'assigned' | 'incoming';

function buildTechnicianTicketConstraints({
    scope,
    technicianId,
    statusIds,
    cursor,
}: {
    scope: TechnicianTicketQueryScope;
    technicianId?: string;
    statusIds: string[];
    cursor?: DocumentSnapshot | null;
}): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];

    if (scope === 'assigned' && technicianId) {
        constraints.push(where('staff.assignedTechnician', '==', technicianId));
    }
    if (scope === 'incoming' && technicianId) {
        constraints.push(where('pendingTechnicianTransfer.toTechnicianId', '==', technicianId));
        constraints.push(where('pendingTechnicianTransfer.status', '==', 'pending'));
    }

    // Firestore supports at most 30 values in an `in` query. The fallback
    // keeps the page readable for unusually large, dynamic workflows.
    if (statusIds.length > 0 && statusIds.length <= 30) {
        constraints.push(where('status', 'in', statusIds));
    }
    constraints.push(orderBy('createdAt', 'desc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(TECHNICIAN_LIVE_PAGE_SIZE));
    return constraints;
}

export default function TechnicianPage() {
    const { user } = useAuth();
    // Only the first page stays live. Older jobs are loaded on demand and are
    // deliberately kept outside the listener so opening this screen has a
    // predictable Firestore read cost.
    const [liveTickets, setLiveTickets] = useState<RepairTicket[]>([]);
    const [olderTickets, setOlderTickets] = useState<RepairTicket[]>([]);
    const [managerCursor, setManagerCursor] = useState<DocumentSnapshot | null>(null);
    const [assignedCursor, setAssignedCursor] = useState<DocumentSnapshot | null>(null);
    const [incomingCursor, setIncomingCursor] = useState<DocumentSnapshot | null>(null);
    const [managerHasMore, setManagerHasMore] = useState(false);
    const [assignedHasMore, setAssignedHasMore] = useState(false);
    const [incomingHasMore, setIncomingHasMore] = useState(false);
    const [isLoadingMoreTickets, setIsLoadingMoreTickets] = useState(false);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
    const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [statusConfirmModal, setStatusConfirmModal] = useState<TechnicianStatusModal | null>(null);
    const statusTransitionLocksRef = useRef(new Set<string>());
    const [pendingStatusTicketIds, setPendingStatusTicketIds] = useState<string[]>([]);
    const isStatusChanging = pendingStatusTicketIds.length > 0;

    const [noteModalPayload, setNoteModalPayload] = useState<TechnicianNoteModal | null>(null);
    const [techNoteText, setTechNoteText] = useState('');

    const [partsVerificationModalPayload, setPartsVerificationModalPayload] = useState<TechnicianPartsVerificationModal | null>(null);
    const [partsVerificationSelections, setPartsVerificationSelections] = useState<Record<string, TechnicianPartVerificationSelection>>({});
    const [isPartsVerifying, setIsPartsVerifying] = useState(false);

    const [partSearchQuery, setPartSearchQuery] = useState('');
    const [partSearchResults, setPartSearchResults] = useState<Product[]>([]);
    const [isSearchingParts, setIsSearchingParts] = useState(false);
    const [serviceSuggestedParts, setServiceSuggestedParts] = useState<Product[]>([]);
    const [serviceSuggestedCategoryIds, setServiceSuggestedCategoryIds] = useState<string[]>([]);
    const [serviceSuggestionHint, setServiceSuggestionHint] = useState('');
    const serviceSuggestionCacheRef = useRef(new Map<string, {
        products: Product[];
        categoryIds: string[];
        hint: string;
    }>());
    const [isLoadingServiceSuggestions, setIsLoadingServiceSuggestions] = useState(false);
    const [selectedPartQuality, setSelectedPartQuality] = useState('Zin');
    const [customPartName, setCustomPartName] = useState('');

    // Once a suggested component group already has a selected/requested part,
    // promote the remaining groups (e.g. show Pin after Screen). All of this
    // stays local; selecting a component or switching quality causes no new
    // Firestore reads.
    const selectedSuggestedPartLeafCategoryIds = useMemo(() => {
        const selectedProductIds = new Set(
            (selectedTicket?.parts || [])
                .map(part => part.productId)
                .filter((productId): productId is string => Boolean(productId)),
        );
        return new Set(
            serviceSuggestedParts
                .filter(product => selectedProductIds.has(product.id))
                .map(product => product.categoryIds?.at(-1) || '')
                .filter(Boolean),
        );
    }, [selectedTicket?.parts, serviceSuggestedParts]);

    // Suggestions and manual search must use the same quality decision.
    const qualityFilteredServiceSuggestedParts = useMemo(
        () => serviceSuggestedParts
            .filter(product => productMatchesRepairPartQuality(product, selectedPartQuality))
            .filter(product => !selectedSuggestedPartLeafCategoryIds.has(product.categoryIds?.at(-1) || ''))
            .slice(0, 10),
        [selectedPartQuality, selectedSuggestedPartLeafCategoryIds, serviceSuggestedParts],
    );

    const tickets = useMemo(() => {
        const uniqueTickets = new Map<string, RepairTicket>();
        [...olderTickets, ...liveTickets].forEach(ticket => uniqueTickets.set(ticket.id, ticket));
        return sortTicketsByCreatedAtDesc([...uniqueTickets.values()]);
    }, [liveTickets, olderTickets]);
    const isManager = isRepairManager(user);
    const hasMoreTickets = isManager ? managerHasMore : assignedHasMore || incomingHasMore;

    const selectedTicketServiceIds = getRepairServiceIds(selectedTicket || {});
    const selectedTicketServiceCategoryIds = getRepairServiceCategoryIds(selectedTicket || {});
    const selectedTicketDeviceModel = selectedTicket?.deviceInfo?.model || '';
    const selectedTicketServiceKey = [
        ...selectedTicketServiceCategoryIds,
        ...selectedTicketServiceIds,
        normalizeRepairPartSearch(selectedTicketDeviceModel),
    ].join('|');

    useEffect(() => {
        let disposed = false;
        const serviceIds = getRepairServiceIds(selectedTicket || {});
        const serviceCategoryIds = getRepairServiceCategoryIds(selectedTicket || {});
        const clearSuggestions = (hint = '') => {
            setServiceSuggestedParts([]);
            setServiceSuggestedCategoryIds([]);
            setServiceSuggestionHint(hint);
            setIsLoadingServiceSuggestions(false);
        };
        if (!selectedTicket) {
            clearSuggestions();
            return;
        }
        if (serviceCategoryIds.length === 0 && serviceIds.length === 0) {
            clearSuggestions('Phiếu chưa gán danh mục dịch vụ cho lỗi nên không thể gợi ý linh kiện.');
            return;
        }
        if (!selectedTicketDeviceModel.trim()) {
            clearSuggestions('Phiếu chưa có model thiết bị để lọc linh kiện tương thích.');
            return;
        }

        const cachedSuggestions = serviceSuggestionCacheRef.current.get(selectedTicketServiceKey);
        if (cachedSuggestions) {
            setServiceSuggestedParts(cachedSuggestions.products);
            setServiceSuggestedCategoryIds(cachedSuggestions.categoryIds);
            setServiceSuggestionHint(cachedSuggestions.hint);
            setIsLoadingServiceSuggestions(false);
            return;
        }

        const loadSuggestions = async () => {
            setIsLoadingServiceSuggestions(true);
            try {
                const [directServiceSnaps, taxonomyServiceSnaps] = await Promise.all([
                    Promise.all(serviceIds.map(serviceId => getDoc(doc(db, 'services', serviceId)))),
                    Promise.all(serviceCategoryIds.slice(0, 10).map(categoryId => getDocs(query(
                        collection(db, 'services'),
                        where('categoryIds', 'array-contains', categoryId),
                        limit(20),
                    )))),
                ]);
                const serviceMap = new Map<string, ServiceBusinessLink & { device_model?: unknown; isActive?: unknown }>();
                directServiceSnaps
                    .filter(snapshot => snapshot.exists())
                    .forEach(snapshot => serviceMap.set(snapshot.id, { id: snapshot.id, ...snapshot.data() } as ServiceBusinessLink & { device_model?: unknown; isActive?: unknown }));
                taxonomyServiceSnaps.forEach(snapshot => snapshot.docs.forEach(serviceDoc => {
                    const service = { id: serviceDoc.id, ...serviceDoc.data() } as ServiceBusinessLink & { device_model?: unknown; isActive?: unknown };
                    if (service.isActive !== false) serviceMap.set(service.id, service);
                }));
                const services = Array.from(serviceMap.values()).filter(service => service.isActive !== false);
                // A repair ticket is classified by its taxonomy. The service
                // catalog supplies the part-category links for that taxonomy;
                // model matching happens only after part candidates are read.
                const categoryIds = getRecommendedPartCategoryIds(services);
                if (categoryIds.length === 0) {
                    if (!disposed) {
                        const hint = `Chưa có cấu hình liên kết linh kiện cho danh mục sửa chữa và model ${selectedTicketDeviceModel}.`;
                        serviceSuggestionCacheRef.current.set(selectedTicketServiceKey, { products: [], categoryIds: [], hint });
                        setServiceSuggestedParts([]);
                        setServiceSuggestedCategoryIds([]);
                        setServiceSuggestionHint(hint);
                    }
                    return;
                }
                const scopedSearchValues = getScopedRepairPartSearchValues(categoryIds, selectedTicketDeviceModel);
                if (scopedSearchValues.length === 0) {
                    if (!disposed) {
                        const hint = 'Không xác định được mã model để tìm linh kiện tương thích.';
                        serviceSuggestionCacheRef.current.set(selectedTicketServiceKey, { products: [], categoryIds, hint });
                        setServiceSuggestedParts([]);
                        setServiceSuggestedCategoryIds(categoryIds);
                        setServiceSuggestionHint(hint);
                    }
                    return;
                }
                const productSnap = await getDocs(query(
                    collection(db, 'products'),
                    where('status', '==', 'active'),
                    where('searchCategoryKeywords', 'array-contains-any', scopedSearchValues),
                    limit(TECHNICIAN_PART_RESULT_LIMIT),
                ));
                const filterSuggestedProducts = (products: Product[]) => filterAvailableCategoryRecommendations(
                    products
                        .filter(product => isPartCategory(product.category, product.categoryIds))
                        .filter(product => productMatchesRepairDeviceModel(product, selectedTicketDeviceModel)),
                    categoryIds,
                );
                let suggestedProducts = filterSuggestedProducts(
                    productSnap.docs.map(productDoc => ({ id: productDoc.id, ...productDoc.data() } as Product)),
                );
                // Older catalog records may not yet have the combined category
                // index. Fall back to the regular indexed model lookup and
                // retain the linked category filter locally; never scan stock.
                if (suggestedProducts.length === 0) {
                    const modelTokens = getRepairPartSearchLookupTokens(selectedTicketDeviceModel);
                    if (modelTokens.length > 0) {
                        const legacyIndexSnap = await getDocs(query(
                            collection(db, 'products'),
                            where('status', '==', 'active'),
                            where('searchKeywords', 'array-contains-any', modelTokens),
                            limit(TECHNICIAN_PART_RESULT_LIMIT),
                        ));
                        suggestedProducts = filterSuggestedProducts(
                            legacyIndexSnap.docs.map(productDoc => ({ id: productDoc.id, ...productDoc.data() } as Product)),
                        );
                    }
                }
                const suggestions = rankRepairPartSearchResults(
                    suggestedProducts,
                    selectedTicketDeviceModel,
                    selectedTicketDeviceModel,
                );
                const hint = suggestions.length === 0
                    ? `Chưa có linh kiện ${selectedTicketDeviceModel} trong nhóm đã liên kết với dịch vụ.`
                    : '';
                serviceSuggestionCacheRef.current.set(selectedTicketServiceKey, { products: suggestions, categoryIds, hint });
                if (!disposed) {
                    setServiceSuggestedParts(suggestions);
                    setServiceSuggestedCategoryIds(categoryIds);
                    setServiceSuggestionHint(hint);
                }
            } catch (error) {
                console.error('Failed to load service-linked part suggestions', error);
                if (!disposed) {
                    setServiceSuggestedParts([]);
                    setServiceSuggestedCategoryIds([]);
                    setServiceSuggestionHint('Không thể tải gợi ý linh kiện. Vui lòng thử lại.');
                }
            } finally {
                if (!disposed) setIsLoadingServiceSuggestions(false);
            }
        };
        void loadSuggestions();
        return () => { disposed = true; };
    }, [selectedTicket, selectedTicketDeviceModel, selectedTicketServiceKey]);

    const [dynamicStatuses, setDynamicStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);
    const [statusConfigLoaded, setStatusConfigLoaded] = useState(false);
    const [technicians, setTechnicians] = useState<{ uid: string; displayName: string }[]>([]);
    // userNamesMap removed
    const [transferModal, setTransferModal] = useState<TechnicianTransferModal | null>(null);
    const [transferTechnicianId, setTransferTechnicianId] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [isTransferSubmitting, setIsTransferSubmitting] = useState(false);

    const getWorkflowForTicket = (ticket: RepairTicket): WorkflowNode[] => {
        return ticket.ticketType === 'warranty' ? warrantyStatuses : dynamicStatuses;
    };


    useEffect(() => {
        if (!partSearchQuery.trim()) {
            setPartSearchResults([]);
            return;
        }
        let disposed = false;
        const timer = setTimeout(async () => {
            setIsSearchingParts(true);
            try {
                const lookupTokens = getRepairPartSearchLookupTokens(partSearchQuery);
                if (lookupTokens.length === 0) {
                    setPartSearchResults([]);
                    return;
                }
                const scopedSearchValues = getScopedRepairPartSearchValues(serviceSuggestedCategoryIds, partSearchQuery);
                const readProducts = async (scoped: boolean) => {
                    const searchSnapshot = await getDocs(query(
                        collection(db, 'products'),
                        where('status', '==', 'active'),
                        where(scoped ? 'searchCategoryKeywords' : 'searchKeywords', 'array-contains-any', scoped ? scopedSearchValues : lookupTokens),
                        limit(TECHNICIAN_PART_RESULT_LIMIT),
                    ));
                    return searchSnapshot.docs.map(item => ({ id: item.id, ...item.data() } as Product));
                };
                const filterSearchResults = (products: Product[]) => products
                    .filter(product => isPartCategory(product.category, product.categoryIds))
                    .filter(product => productMatchesRepairPartQuality(product, selectedPartQuality))
                    .filter(product => productMatchesRepairPartSearch(product, partSearchQuery))
                    .filter(product => !queryTargetsRepairDeviceModel(partSearchQuery, selectedTicketDeviceModel)
                        || productMatchesRepairDeviceModel(product, selectedTicketDeviceModel));

                let results = filterSearchResults(await readProducts(scopedSearchValues.length > 0));
                // A service link is a strong first scope, not a restriction on
                // a KTV who discovered an additional issue. The fallback stays
                // indexed and bounded; it never scans arbitrary active stock.
                if (results.length === 0 && scopedSearchValues.length > 0) {
                    results = filterSearchResults(await readProducts(false));
                }
                if (!disposed) setPartSearchResults(rankRepairPartSearchResults(results, partSearchQuery, selectedTicketDeviceModel).slice(0, 10));
            } catch (err) {
                console.error(err);
            } finally {
                if (!disposed) setIsSearchingParts(false);
            }
        }, 400);
        return () => {
            disposed = true;
            clearTimeout(timer);
        };
    }, [partSearchQuery, selectedPartQuality, selectedTicketDeviceModel, serviceSuggestedCategoryIds]);

    const handleAddPart = async (ticket: RepairTicket, product: Product, issueId?: string) => {
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    operationKey: crypto.randomUUID(),
                    command: {
                        type: 'add_selected',
                        productId: product.id,
                        issueId,
                        quantity: 1
                    }
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Lỗi thêm linh kiện');
            }

            setSelectedTicket({ ...ticket, parts: data.parts, payment: data.payment, version: (ticket.version || 0) + 1 });
            toastSuccess('Đã thêm linh kiện thành công.');
            setPartSearchQuery('');
        } catch (err: unknown) {
            console.error('Error adding part:', err);
            const raw = (err as Error)?.message || 'Không thể xuất linh kiện.';
            const msg = raw.includes('không đủ tồn kho')
                ? `${raw} Có thể KTV khác vừa xuất linh kiện này. Vui lòng tải lại danh sách hoặc chuyển sang "Hết (Đề xuất)".`
                : raw;
            toastError(msg);
        }
    };

    const handleRequestPart = async (ticket: RepairTicket, product: Product, issueId?: string) => {
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    operationKey: crypto.randomUUID(),
                    command: {
                        type: 'request_part',
                        productId: product.id,
                        issueId,
                        quantity: 1
                    }
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi yêu cầu linh kiện');

            setSelectedTicket({ ...ticket, parts: data.parts, version: (ticket.version || 0) + 1 });
            toastSuccess('Đã thêm linh kiện vào danh sách yêu cầu.');
            setPartSearchQuery('');
        } catch (err: unknown) {
            console.error('Error requesting part:', err);
            toastError((err as Error)?.message || 'Lỗi khi tạo yêu cầu.');
        }
    };

    const handleAddCustomPart = async (ticket: RepairTicket, issueId?: string) => {
        if (!customPartName.trim()) return;

        try {
            const exactName = customPartName.trim();

            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    operationKey: crypto.randomUUID(),
                    command: {
                        type: 'request_part',
                        productId: '',
                        customName: exactName,
                        issueId,
                        quality: selectedPartQuality,
                        quantity: 1
                    }
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi thêm linh kiện');

            setSelectedTicket({ ...ticket, parts: data.parts, version: (ticket.version || 0) + 1 });
            toastSuccess('Đã thêm linh kiện đề xuất. Kế toán/Kho sẽ xem xét.');
            setCustomPartName('');
        } catch (err: unknown) {
            console.error('Error adding custom part:', err);
            toastError((err as Error)?.message || 'Lỗi khi thêm linh kiện.');
        }
    };

    const handleRemovePart = async (ticket: RepairTicket, partIndex: number) => {
        if (!await appConfirm('Bạn có chắc chắn muốn xóa linh kiện này khỏi phiếu?', { title: 'Xóa linh kiện', confirmText: 'Xóa', destructive: true })) return;
        try {
            const partLineId = ticket.parts?.[partIndex]?.partLineId;
            if (!partLineId) {
                throw new Error('Linh kiện này chưa có mã dòng (partLineId). Vui lòng báo Admin chạy migrate.');
            }

            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    operationKey: crypto.randomUUID(),
                    command: {
                        type: 'remove_line',
                        partLineId
                    }
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi xóa linh kiện');

            setSelectedTicket({ ...ticket, parts: data.parts, payment: data.payment, version: (ticket.version || 0) + 1 });
            toastSuccess('Xóa linh kiện thành công.');
        } catch (err: unknown) {
            console.error('Error removing part:', err);
            toastError((err as Error)?.message || 'Lỗi khi xóa linh kiện.');
        }
    };

    const handleConfirmPartReceived = async (ticket: RepairTicket, partIndex: number) => {
        try {
            const partLineId = ticket.parts?.[partIndex]?.partLineId;
            if (!partLineId) throw new Error('Linh kiện này chưa có mã dòng. Vui lòng tải lại phiếu.');
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    operationKey: crypto.randomUUID(),
                    command: { type: 'confirm_technician_received', partLineId, quantity: 1 },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể xác nhận nhận linh kiện.');
            setSelectedTicket({ ...ticket, parts: data.parts, payment: data.payment, version: (ticket.version || 0) + 1 });
            toastSuccess('Đã xác nhận nhận linh kiện từ Tiếp nhận.');
        } catch (err: unknown) {
            console.error('Error confirming technician part receipt:', err);
            toastError(err instanceof Error ? err.message : 'Không thể xác nhận nhận linh kiện.');
        }
    };

    const handleReportPartNotReceived = async (ticket: RepairTicket, partIndex: number) => {
        try {
            const partLineId = ticket.parts?.[partIndex]?.partLineId;
            if (!partLineId) throw new Error('Linh kiện này chưa có mã dòng. Vui lòng tải lại phiếu.');
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    operationKey: crypto.randomUUID(),
                    command: { type: 'technician_not_received', partLineId, quantity: 1 },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể báo chưa nhận linh kiện.');
            setSelectedTicket({ ...ticket, parts: data.parts, payment: data.payment, version: (ticket.version || 0) + 1 });
            toastSuccess('Đã báo Tiếp nhận: KTV chưa nhận được linh kiện.');
        } catch (err: unknown) {
            console.error('Error reporting missing handover part:', err);
            toastError(err instanceof Error ? err.message : 'Không thể báo chưa nhận linh kiện.');
        }
    };

    useEffect(() => {
        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const normalizationOptions = getWorkflowNormalizationOptions(data.workflowSchemaVersion);
                setDynamicStatuses(normalizeRepairWorkflow(data.repairStatuses, normalizationOptions));
                setWarrantyStatuses(normalizeWarrantyWorkflow(data.warrantyStatuses, normalizationOptions));
            }
            setStatusConfigLoaded(true);
        });

        return () => unsubStatuses();
    }, []);

    useEffect(() => {
        if (!statusConfigLoaded || !user?.uid) return;

        const statusIds = getTechnicianQueryableStatusIds(dynamicStatuses, warrantyStatuses);
        if (statusIds.length === 0) {
            setLiveTickets([]);
            setOlderTickets([]);
            setManagerHasMore(false);
            setAssignedHasMore(false);
            setIncomingHasMore(false);
            setLoading(false);
            return;
        }

        const publish = (assigned: RepairTicket[], incoming: RepairTicket[]) => {
            const uniqueTickets = new Map<string, RepairTicket>();
            [...assigned, ...incoming].forEach(ticket => uniqueTickets.set(ticket.id, ticket));
            setLiveTickets(sortTicketsByCreatedAtDesc([...uniqueTickets.values()]));
            setLoading(false);
        };
        const onError = (error: Error) => {
            console.error('Technician repairs listener error:', error);
            setLoading(false);
        };

        setLoading(true);
        setLiveTickets([]);
        setOlderTickets([]);
        setManagerCursor(null);
        setAssignedCursor(null);
        setIncomingCursor(null);
        setManagerHasMore(false);
        setAssignedHasMore(false);
        setIncomingHasMore(false);

        if (isRepairManager(user)) {
            const managerQuery = query(collection(db, 'repairs'), ...buildTechnicianTicketConstraints({
                scope: 'manager',
                statusIds,
            }));
            return onSnapshot(managerQuery, (snap) => {
                setManagerCursor(snap.docs[snap.docs.length - 1] || null);
                setManagerHasMore(snap.docs.length === TECHNICIAN_LIVE_PAGE_SIZE);
                publish(snap.docs.map(d => ({ id: d.id, ...d.data() })) as RepairTicket[], []);
            }, onError);
        }

        const assignedQuery = query(collection(db, 'repairs'), ...buildTechnicianTicketConstraints({
            scope: 'assigned',
            technicianId: user.uid,
            statusIds,
        }));
        const incomingQuery = query(collection(db, 'repairs'), ...buildTechnicianTicketConstraints({
            scope: 'incoming',
            technicianId: user.uid,
            statusIds,
        }));
        let assignedTickets: RepairTicket[] = [];
        let incomingTickets: RepairTicket[] = [];
        const unsubAssigned = onSnapshot(assignedQuery, (snap) => {
            assignedTickets = snap.docs.map(d => ({ id: d.id, ...d.data() })) as RepairTicket[];
            setAssignedCursor(snap.docs[snap.docs.length - 1] || null);
            setAssignedHasMore(snap.docs.length === TECHNICIAN_LIVE_PAGE_SIZE);
            publish(assignedTickets, incomingTickets);
        }, onError);
        const unsubIncoming = onSnapshot(incomingQuery, (snap) => {
            incomingTickets = snap.docs.map(d => ({ id: d.id, ...d.data() })) as RepairTicket[];
            setIncomingCursor(snap.docs[snap.docs.length - 1] || null);
            setIncomingHasMore(snap.docs.length === TECHNICIAN_LIVE_PAGE_SIZE);
            publish(assignedTickets, incomingTickets);
        }, onError);

        return () => {
            unsubAssigned();
            unsubIncoming();
        };
    }, [dynamicStatuses, statusConfigLoaded, user, warrantyStatuses]);

    const loadMoreTickets = async () => {
        if (!user?.uid || isLoadingMoreTickets || !hasMoreTickets) return;

        const statusIds = getTechnicianQueryableStatusIds(dynamicStatuses, warrantyStatuses);
        if (statusIds.length === 0) return;

        setIsLoadingMoreTickets(true);
        try {
            const pageRequests: Array<Promise<{ scope: TechnicianTicketQueryScope; snap: QuerySnapshot }>> = [];

            if (isManager) {
                if (managerHasMore && managerCursor) {
                    pageRequests.push(
                        getDocs(query(collection(db, 'repairs'), ...buildTechnicianTicketConstraints({
                            scope: 'manager',
                            statusIds,
                            cursor: managerCursor,
                        }))).then(snap => ({ scope: 'manager', snap }))
                    );
                }
            } else {
                if (assignedHasMore && assignedCursor) {
                    pageRequests.push(
                        getDocs(query(collection(db, 'repairs'), ...buildTechnicianTicketConstraints({
                            scope: 'assigned',
                            technicianId: user.uid,
                            statusIds,
                            cursor: assignedCursor,
                        }))).then(snap => ({ scope: 'assigned', snap }))
                    );
                }
                if (incomingHasMore && incomingCursor) {
                    pageRequests.push(
                        getDocs(query(collection(db, 'repairs'), ...buildTechnicianTicketConstraints({
                            scope: 'incoming',
                            technicianId: user.uid,
                            statusIds,
                            cursor: incomingCursor,
                        }))).then(snap => ({ scope: 'incoming', snap }))
                    );
                }
            }

            const pages = await Promise.all(pageRequests);
            const additionalTickets = pages.flatMap(({ snap }) => snap.docs.map(item => ({
                id: item.id,
                ...(item.data() as Record<string, unknown>),
            } as RepairTicket)));
            setOlderTickets(previous => {
                const merged = new Map(previous.map(ticket => [ticket.id, ticket]));
                additionalTickets.forEach(ticket => merged.set(ticket.id, ticket));
                return sortTicketsByCreatedAtDesc([...merged.values()]);
            });

            pages.forEach(({ scope, snap }) => {
                const cursor = snap.docs[snap.docs.length - 1] || null;
                const hasAnotherPage = snap.docs.length === TECHNICIAN_LIVE_PAGE_SIZE;
                if (scope === 'manager') {
                    setManagerCursor(cursor);
                    setManagerHasMore(hasAnotherPage);
                } else if (scope === 'assigned') {
                    setAssignedCursor(cursor);
                    setAssignedHasMore(hasAnotherPage);
                } else {
                    setIncomingCursor(cursor);
                    setIncomingHasMore(hasAnotherPage);
                }
            });
        } catch (error) {
            console.error('Load more technician tickets error:', error);
            toastError('Không thể tải thêm phiếu cũ. Vui lòng thử lại.');
        } finally {
            setIsLoadingMoreTickets(false);
        }
    };

    useEffect(() => {
        getDocs(query(collection(db, 'users'), where('role', '==', 'staff')))
            .then(snap => setTechnicians(snap.docs
                .filter(item => Array.isArray(item.data().permissions) && item.data().permissions.includes('manage_repairs'))
                .map(item => ({ uid: item.id, displayName: item.data().displayName || 'Kỹ thuật viên' }))))
            .catch(error => console.error('Load technicians error:', error));
    }, []);

    const executeStatusChange = async (ticketId: string, newStatus: string) => {
        try {
            const ticket = tickets.find(t => t.id === ticketId);
            if (!ticket) return;

            const workflow = getWorkflowForTicket(ticket);
            const currentCfg = workflow.find(s => s.id === ticket.status);
            if (currentCfg?.isTerminal) {
                toastError('Phiếu đã đóng, không thể thay đổi trạng thái!');
                return;
            }

            if (isTicketWaitingForCustomerHandoff(ticket, workflow)) {
                toastWarning('Phiếu đang chờ bàn giao cho khách. Vui lòng liên hệ thu ngân để xử lý.');
                return;
            }

            if (currentCfg?.allowedFeatures?.includes('allowPartsSelection')) {
                const partsCount = (ticket.parts || []).length;
                if (partsCount === 0) {
                    toastWarning('Chưa chọn linh kiện cho phiếu này. Nếu ca sửa không cần linh kiện, bạn vẫn có thể tiếp tục chuyển trạng thái.');
                }
            }

            if (currentCfg?.allowedFeatures?.includes('requireChecklist')) {
                if (!isChecklistComplete(ticket.deviceInfo?.checklist as Record<string, unknown> | undefined)) {
                    toastError('Trạng thái hiện tại yêu cầu hoàn thành Checklist (8 mục) trước khi chuyển tiếp. Vui lòng mở phiếu để điền checklist.');
                    return;
                }
            }

            if (currentCfg?.allowedFeatures?.includes('requirePartsReady')) {
                if (!areAllPartsReady(ticket)) {
                    const pendingCount = (ticket.parts || []).filter(
                        isPendingRepairPart
                    ).length;
                    toastError(
                        `Còn ${pendingCount} linh kiện chưa về kho. Cần chờ hàng về trước khi chuyển sang sửa chữa.`
                    );
                    return;
                }
            }


            const isAssignedKTV = ticket.staff?.assignedTechnician === user?.uid;
            const isManager = isRepairManager(user);

            if (ticket.staff?.assignedTechnician && !isAssignedKTV && isManager) {
                setTechNoteText('');
                setNoteModalPayload({ ticketId, newStatus, currentNote: ticket.issue?.notes || '' });
                return;
            }

            const targetCfg = workflow.find(s => s.id === newStatus);
            if (isTechnicianHandoffStatus(targetCfg)) {
                const selectedParts = (ticket.parts || []).filter(p => isSelectedRepairPart(p));
                if (selectedParts.length > 0) {
                    setPartsVerificationModalPayload({ ticketId, newStatus });
                    const initSelections: Record<string, 'use' | 'return'> = {};
                    selectedParts.forEach(p => initSelections[p.partLineId!] = 'use');
                    setPartsVerificationSelections(initSelections);
                    return;
                }
            }

            if (currentCfg?.allowedFeatures?.includes('requireTechnicianNote') && !ticket.issue?.notes?.trim()) {
                if (!ticket.issue?.notes?.trim()) {
                    setTechNoteText('');
                    setNoteModalPayload({ ticketId, newStatus, currentNote: '' });
                    return;
                }
                await finalizeStatusChange(ticket, newStatus);
                return;
            }

            await finalizeStatusChange(ticket, newStatus);

        } catch (err) {
            console.error('Status check error:', err);
        }
    };

    const handlePartsVerificationSubmit = async () => {
        if (!partsVerificationModalPayload) return;
        setIsPartsVerifying(true);
        try {
            const ticket = tickets.find(t => t.id === partsVerificationModalPayload.ticketId);
            if (!ticket) throw new Error('Phiếu không tồn tại');

            const didTransition = await finalizeStatusChange(
                ticket,
                partsVerificationModalPayload.newStatus,
                undefined,
                partsVerificationSelections,
            );
            if (!didTransition) return;
            setPartsVerificationModalPayload(null);
            setPartsVerificationSelections({});
        } catch (err: unknown) {
            toastError((err as Error)?.message || 'Lỗi xử lý xác nhận linh kiện');
        } finally {
            setIsPartsVerifying(false);
        }
    };

    const handleStatusChange = async (ticketId: string, newStatus: string) => {
        if (statusTransitionLocksRef.current.has(ticketId)) {
            return;
        }
        const ticket = tickets.find(t => t.id === ticketId);
        if (!ticket) return;
        if (ticket.status === newStatus) {
            toastWarning('Phiếu đang ở trạng thái này, không có thay đổi để thực hiện.');
            return;
        }
        const workflow = getWorkflowForTicket(ticket);
        const currentCfg = workflow.find(s => s.id === ticket.status);
        if (currentCfg?.isTerminal) {
            toastError('Phiếu đã đóng, không thể thay đổi trạng thái!');
            return;
        }

        setStatusConfirmModal({ ticketId, newStatus: String(newStatus) });
    };

    const finalizeStatusChange = async (
        ticket: RepairTicket,
        newStatus: string,
        newTechNote?: string,
        partVerification?: Record<string, TechnicianPartVerificationSelection>,
    ): Promise<boolean> => {
        // This ref lock is synchronous, unlike setState, so rapid repeated
        // clicks cannot send two transition requests before React rerenders.
        if (statusTransitionLocksRef.current.has(ticket.id)) {
            return false;
        }
        statusTransitionLocksRef.current.add(ticket.id);
        setPendingStatusTicketIds(previous => previous.includes(ticket.id)
            ? previous
            : [...previous, ticket.id]);
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/transition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    idempotencyKey: crypto.randomUUID(),
                    targetStatus: newStatus,
                    technicianNote: newTechNote || '',
                    partVerification,
                    source: 'technician'
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật trạng thái');

            toastSuccess('Cập nhật trạng thái thành công.');
            // Older pages are intentionally one-shot reads. Reflect this
            // user's transition locally instead of waiting for a full reload.
            setOlderTickets(previous => previous.map(item => item.id === ticket.id
                ? { ...item, status: newStatus, version: (item.version || 0) + 1 }
                : item));
            if (selectedTicket?.id === ticket.id) {
                setSelectedTicket({ ...ticket, status: newStatus, version: (ticket.version || 0) + 1 });
            }
            return true;
        } catch (err: unknown) {
            console.error('Status update error:', err);
            toastError((err as Error)?.message || 'Lỗi khi cập nhật trạng thái.');
            return false;
        } finally {
            statusTransitionLocksRef.current.delete(ticket.id);
            setPendingStatusTicketIds(previous => previous.filter(id => id !== ticket.id));
        }
    };

    const handleNoteSubmit = async () => {
        if (!noteModalPayload) return;

        const ticket = tickets.find(t => t.id === noteModalPayload.ticketId);
        if (ticket) {
            const isAssignedKTV = ticket.staff?.assignedTechnician === user?.uid;
            const isManager = isRepairManager(user);

            if (ticket.staff?.assignedTechnician && !isAssignedKTV && isManager && !techNoteText.trim()) {
                toastError('Quản lý ghi đè trạng thái (Manager Override) yêu cầu phải nhập lý do!');
                return;
            }

            await finalizeStatusChange(ticket, noteModalPayload.newStatus, techNoteText.trim());
        }

        setNoteModalPayload(null);
        setTechNoteText('');
    };

    const handleTransferResponse = async (ticket: RepairTicket, responseStatus: 'accepted' | 'rejected') => {
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/technician/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    action: 'respond',
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    responseStatus,
                    idempotencyKey: crypto.randomUUID()
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi xử lý yêu cầu');
            toastSuccess(responseStatus === 'accepted' ? 'Đã nhận phiếu!' : 'Đã từ chối phiếu.');
        } catch (e: unknown) {
            toastError(e instanceof Error ? e.message : 'Lỗi xử lý yêu cầu');
        }
    };

    const handleTransferRequest = async () => {
        if (!transferModal || !transferTechnicianId || !transferReason.trim()) {
            toastWarning('Vui lòng chọn KTV nhận và nhập lý do chuyển.');
            return;
        }
        setIsTransferSubmitting(true);
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/technician/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    action: 'request',
                    ticketId: transferModal.ticket.id,
                    ticketVersion: transferModal.ticket.version || 0,
                    toTechnicianId: transferTechnicianId,
                    reason: transferReason.trim(),
                    source: 'technician',
                    idempotencyKey: crypto.randomUUID(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể gửi yêu cầu chuyển KTV.');
            toastSuccess('Đã gửi yêu cầu. KTV mới phải chấp nhận trước khi nhận trách nhiệm.');
            setTransferModal(null);
            setTransferTechnicianId('');
            setTransferReason('');
        } catch (error: unknown) {
            toastError(error instanceof Error ? error.message : 'Không thể gửi yêu cầu chuyển KTV.');
        } finally {
            setIsTransferSubmitting(false);
        }
    };

    const handleTransferCancel = async (ticket: RepairTicket) => {
        if (!ticket.pendingTechnicianTransfer) return;
        if (!await appConfirm('Hủy yêu cầu chuyển KTV đang chờ?', { title: 'Hủy yêu cầu chuyển KTV', confirmText: 'Hủy yêu cầu', destructive: true })) return;
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/technician/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    action: 'cancel',
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    idempotencyKey: crypto.randomUUID(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể hủy yêu cầu chuyển KTV.');
            toastSuccess('Đã hủy yêu cầu chuyển KTV.');
        } catch (error: unknown) {
            toastError(error instanceof Error ? error.message : 'Không thể hủy yêu cầu chuyển KTV.');
        }
    };


    const formatPrice = (p: number) => p > 0 ? p.toLocaleString('vi-VN') + 'đ' : '—';



    const patchChecklist = async (ticket: RepairTicket, key: string, value: string | boolean) => {
        const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
        const res = await fetch('/api/repairs/checklist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                ticketId: ticket.id,
                ticketVersion: ticket.version || 0,
                key,
                value,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Khong the cap nhat checklist.');
    };

    const handleChecklistUpdate = async (ticket: RepairTicket, key: string, newValue: string) => {
        try {
            await patchChecklist(ticket, key, newValue);
        } catch (err) {
            console.error('Checklist update error:', err);
            toastError(err instanceof Error ? err.message : 'Khong the cap nhat checklist.');
        }
    };

    const handleHistoryToggle = async (ticket: RepairTicket, key: string, currentValue: boolean) => {
        try {
            await patchChecklist(ticket, key, !currentValue);
        } catch (err) {
            console.error('History toggle error:', err);
            toastError(err instanceof Error ? err.message : 'Khong the cap nhat checklist.');
        }
    };

    const handleDiagnosisUpdate = async (ticket: RepairTicket, issues: RepairIssue[], technicianNote: string) => {
        const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
        const res = await fetch('/api/repairs/diagnosis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ ticketId: ticket.id, ticketVersion: ticket.version || 0, issues, technicianNote }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể cập nhật chẩn đoán kỹ thuật.');

        const updatedTicket: RepairTicket = {
            ...ticket,
            issues: data.issues,
            issue: data.issue,
            categoryPath: data.categoryPath,
            serviceName: data.serviceName,
            payment: data.payment,
            version: data.version,
        };
        setLiveTickets(previous => previous.map(item => item.id === ticket.id ? updatedTicket : item));
        setOlderTickets(previous => previous.map(item => item.id === ticket.id ? updatedTicket : item));
        setSelectedTicket(current => current?.id === ticket.id ? updatedTicket : current);
        toastSuccess('Đã cập nhật chẩn đoán để Tiếp nhận báo khách.');
        return updatedTicket;
    };

    const filtered = tickets.filter(t => {
        const workflow = getWorkflowForTicket(t);
        const st = workflow.find(s => s.id === t.status);
        if (st?.isTerminal) return false;
        if (isTicketWaitingForCustomerHandoff(t, workflow)) return false;

        if (user?.role && user.role !== 'admin' && user?.uid) {
            const isAssigned = t.staff?.assignedTechnician === user.uid;
            const isPendingIncoming = t.pendingTechnicianTransfer?.toTechnicianId === user.uid && t.pendingTechnicianTransfer?.status === 'pending';
            if (!isAssigned && !isPendingIncoming) return false;
        }

        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return t.deviceInfo?.model?.toLowerCase().includes(q) ||
            t.customer?.name?.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q);
    });

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="p-3 sm:p-4 md:p-6 space-y-4">
            <TechnicianPageHeader
                activeRepairCount={tickets.filter(ticket => getWorkflowForTicket(ticket).find(status => status.id === ticket.status)?.allowedFeatures?.includes('countsAsActiveRepair')).length}
                doneCount={tickets.filter(ticket => isTicketWaitingForCustomerHandoff(ticket, getWorkflowForTicket(ticket))).length}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
            />

            {viewMode === 'list' && (
                <div className="space-y-2">
                    {filtered.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <Wrench size={48} className="mx-auto mb-3 opacity-50" />
                            <p>Không có phiếu sửa chữa nào</p>
                        </div>
                    ) : filtered.map(ticket => {
                        const workflow = getWorkflowForTicket(ticket);
                        const st = workflow.find(s => s.id === ticket.status) || { id: ticket.status, label: ticket.status, color: 'text-gray-700 bg-gray-50 border-gray-200', allowedNext: [] } as WorkflowNode;
                        const currentCfg = workflow.find(s => s.id === ticket.status);
                        const isTerminal = isTicketWaitingForCustomerHandoff(ticket, workflow) || !!currentCfg?.isTerminal;
                        const inboundTechnicianHoldMessage = getInboundTechnicianHoldMessage(ticket, currentCfg);
                        const isAssignedToMe = ticket.staff?.assignedTechnician === user?.uid;
                        const isIncomingTransferToMe = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                        const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                        const isReadOnly = isTerminal || isKtvLocked || Boolean(inboundTechnicianHoldMessage);
                        const isStatusTransitionPending = pendingStatusTicketIds.includes(ticket.id);
                        const pendingTransfer = ticket.pendingTechnicianTransfer?.status === 'pending'
                            ? ticket.pendingTechnicianTransfer
                            : null;
                        const isKtvAwaitingInspectionStart = user?.role !== 'admin'
                            && !inboundTechnicianHoldMessage
                            && isAssignedTechnicianAtWorkflowEntry(ticket, workflow, user?.uid);
                        const requiresChecklist = !inboundTechnicianHoldMessage
                            && !isKtvAwaitingInspectionStart
                            && currentCfg?.allowedFeatures?.includes('requireChecklist') === true;
                        const actionWarnings = isKtvAwaitingInspectionStart || inboundTechnicianHoldMessage ? [] : [
                            currentCfg?.allowedFeatures?.includes('requireChecklist') && !isChecklistComplete(ticket.deviceInfo?.checklist as Record<string, unknown> | undefined)
                                ? 'Hoàn thành checklist kiểm tra' : null,
                            currentCfg?.allowedFeatures?.includes('requireTechnicianNote') && !ticket.issue?.notes?.trim()
                                ? 'Nhập kết quả kiểm tra kỹ thuật' : null,
                            currentCfg?.allowedFeatures?.includes('allowPartsSelection') && (!ticket.parts || ticket.parts.length === 0)
                                ? 'Xác nhận ca sửa có cần linh kiện' : null,
                            currentCfg?.allowedFeatures?.includes('requirePartsReady') && !areAllPartsReady(ticket)
                                ? 'Chờ linh kiện sẵn sàng' : null,
                        ].filter((item): item is string => Boolean(item));
                        const canRequestTransfer = !isTerminal && !inboundTechnicianHoldMessage && !pendingTransfer && (isAssignedToMe || isRepairManager(user));

                        return (
                            <div
                                key={ticket.id}
                                className="bg-white rounded-xl border p-3 sm:p-4 xl:p-5 hover:shadow-md transition-shadow"
                                title="Xem chi tiết"
                                onClick={() => setSelectedTicket(ticket)}
                            >
                                {/* Header Row */}
                                <div className="flex items-center justify-between gap-3 border-b pb-3 mb-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0 text-orange-600">
                                            <Smartphone size={19} />
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                                            <p title="Máy" className="font-bold text-gray-900 text-base sm:text-lg truncate">{ticket.deviceInfo?.model || 'Thiết bị'}</p>
                                            {inboundTechnicianHoldMessage ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-sm font-semibold text-sky-800">
                                                    <Truck size={13} /> {inboundTechnicianHoldMessage}
                                                </span>
                                            ) : (
                                                <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border ${st.color}`}>
                                                    {st.label}
                                                </span>
                                            )}
                                            <div className="text-sm text-gray-500 flex items-center gap-1.5">
                                                <span title="Mã phiếu" className="font-mono font-medium">#{ticket.id.slice(-6).toUpperCase()}</span>
                                                {ticket.ticketType === 'warranty' && (
                                                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold">BH</span>
                                                )}
                                                {ticket.customer?.name && (
                                                    <span title="Khách hàng" className="truncate">• {ticket.customer.name}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* KTV Badge */}
                                    <div className="flex-shrink-0 flex items-center gap-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-3 py-1 text-sm font-semibold">
                                        <UserIcon size={14} className="flex-shrink-0" />
                                        <span className="truncate max-w-[120px]">{ticket.staff?.assignedTechnicianName || 'Chưa phân công'}</span>
                                    </div>
                                </div>

                                {/* Body Section */}
                                <div className={requiresChecklist ? 'grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(620px,1.7fr)]' : 'space-y-3'}>
                                    <div className="min-w-0 space-y-3">
                                    {ticket.issues && ticket.issues.length > 0 ? (
                                        <p title="Vấn đề" className="text-xs sm:text-sm text-gray-700 line-clamp-2 bg-gray-50/80 p-2 rounded-lg border border-gray-100">{ticket.issues.map(i => i.label).join(', ')}</p>
                                    ) : ticket.issue?.description ? (
                                        <p className="text-xs sm:text-sm text-gray-700 line-clamp-2 bg-gray-50/80 p-2 rounded-lg border border-gray-100">{ticket.issue.description}</p>
                                    ) : null}

                                    {(inboundTechnicianHoldMessage || pendingTransfer || actionWarnings.length > 0) && (
                                        <div className="space-y-1.5">
                                            {inboundTechnicianHoldMessage && (
                                                <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
                                                    <p className="flex items-center gap-1.5 font-semibold"><Truck size={14} /> {inboundTechnicianHoldMessage}</p>
                                                    <p className="mt-0.5 text-[11px] text-sky-800">Chưa thể bắt đầu kiểm tra cho đến khi Tiếp nhận xác nhận máy đã đến và hoàn tất thông tin.</p>
                                                </div>
                                            )}
                                            {pendingTransfer && (
                                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                                                    <p className="font-semibold flex items-center gap-1.5"><ArrowRightLeft size={14} /> Chờ {pendingTransfer.toTechnicianName} tiếp nhận</p>
                                                    <p className="mt-0.5 text-[11px]">Lý do: {pendingTransfer.reason || 'Không có lý do'}</p>
                                                    <p className="mt-0.5 text-[11px] text-blue-700">Người đề nghị: {pendingTransfer.requestedByName || pendingTransfer.requestedBy}</p>
                                                </div>
                                            )}
                                            {actionWarnings.length > 0 && (
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                                                    <p className="text-[11px] font-bold uppercase text-amber-800 flex items-center gap-1"><ShieldAlert size={13} /> Cần xử lý ở bước này</p>
                                                    <ul className="mt-0.5 space-y-0.5 text-xs text-amber-900">
                                                        {actionWarnings.map(item => <li key={item}>• {item}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!inboundTechnicianHoldMessage && !isKtvAwaitingInspectionStart && st?.allowedFeatures?.includes('allowPartsSelection') && (
                                        <div className="flex flex-wrap gap-1.5 items-center pt-1">
                                            <span className="text-[10px] font-semibold text-gray-500 uppercase">Linh kiện:</span>
                                            {(!ticket.parts || ticket.parts.length === 0) && (
                                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                                                    Chưa chọn linh kiện
                                                </span>
                                            )}
                                            {ticket.parts && ticket.parts.length > 0 && (() => {
                                                const maxShow = 4;
                                                const partsToShow = ticket.parts.slice(0, maxShow);
                                                const remaining = ticket.parts.length - partsToShow.length;
                                                return (
                                                    <>
                                                        {partsToShow.map((p, idx) => (
                                                            <span
                                                                key={idx}
                                                                className={`text-[10px] px-2 py-0.5 rounded-full border ${isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                                        : isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK)
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                            : p.status === 'unavailable'
                                                                                ? 'bg-red-50 text-red-600 border-red-200'
                                                                                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                                    }`}
                                                            >
                                                                {(p.productName || p.partName || PART_CATEGORY_LABEL)}{p.quantity ? ` ×${p.quantity}` : ''}
                                                            </span>
                                                        ))}
                                                        {remaining > 0 && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                                                +{remaining} linh kiện khác
                                                            </span>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    </div>

                                    {requiresChecklist && (
                                        <div className="border-t pt-3 xl:mt-0 xl:border-t-0 xl:border-l xl:pl-4 xl:pt-0">
                                            <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5"><CheckCircle2 size={14} /> Checklist kiểm tra</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
                                                {Object.keys(checklistLabels).map(key => {
                                                    const val = (ticket.deviceInfo?.checklist as Record<string, string> | undefined)?.[key] || '';
                                                    return (
                                                        <div key={key} className="flex flex-col min-w-0">
                                                            <label className="text-xs font-medium text-gray-600 mb-1 truncate">{checklistLabels[key]}</label>
                                                            <select
                                                                value={val}
                                                                onClick={e => e.stopPropagation()}
                                                                onChange={e => handleChecklistUpdate(ticket, key, e.target.value)}
                                                                disabled={isReadOnly}
                                                                aria-label={`Checklist: ${checklistLabels[key]}`}
                                                                title={`Checklist: ${checklistLabels[key]}`}
                                                                className={`min-h-[38px] text-sm px-2 py-1 rounded-lg border cursor-pointer transition-all appearance-none text-center font-bold ${val === 'OK' ? 'bg-green-50 border-green-300 text-green-700' :
                                                                        val === 'Lỗi' ? 'bg-red-50 border-red-300 text-red-600' :
                                                                            val ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                                                                'bg-gray-50 border-gray-200 text-gray-400'
                                                                    }`}>
                                                                <option value="">--</option>
                                                                {CHECKLIST_VALUES.map(v => (
                                                                    <option key={v} value={v}>{v}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {(['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts'] as const).map(key => {
                                                    const labels: Record<string, string> = { hasPriorRepair: 'Đã từng sửa', hasWaterDamage: 'Vào nước', hasNonGenuineParts: 'Kém/Lô' };
                                                    const val = !!(ticket.deviceInfo?.checklist as Record<string, boolean> | undefined)?.[key];
                                                    return (
                                                        <button key={key} onClick={(e) => { e.stopPropagation(); if (!isReadOnly) handleHistoryToggle(ticket, key, val); }}
                                                            disabled={isReadOnly}
                                                            className={`text-xs px-2.5 py-1 rounded-md border transition-all ${isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${val ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold' : 'bg-gray-50 border-gray-200 text-gray-500'
                                                                }`}
                                                            title={`${labels[key]}: ${val ? 'Có' : 'Không'} (Bấm để đổi)`}>
                                                            {val ? '☑' : '☐'} {labels[key]}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer Action Toolbar */}
                                <div className="border-t pt-2.5 mt-3 flex flex-wrap items-center justify-end gap-2">
                                    {!isKtvAwaitingInspectionStart && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }}
                                            className="px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs font-bold hover:bg-gray-50" title="Xem chi tiết"
                                        >
                                            <Eye size={15} className="text-gray-500" /> Chi tiết
                                        </button>
                                    )}

                                    {!isKtvAwaitingInspectionStart && canRequestTransfer && (
                                        <button
                                            onClick={(event) => { event.stopPropagation(); setTransferModal({ ticket }); setTransferTechnicianId(''); setTransferReason(''); }}
                                            className="px-3 py-1.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold hover:bg-blue-100"
                                        >
                                            <ArrowRightLeft size={15} /> Chuyển KTV
                                        </button>
                                    )}

                                    {pendingTransfer && (pendingTransfer.requestedBy === user?.uid || isRepairManager(user)) && (
                                        <button
                                            onClick={(event) => { event.stopPropagation(); handleTransferCancel(ticket); }}
                                            className="px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold hover:bg-red-100"
                                        >
                                            <X size={15} /> Hủy chuyển
                                        </button>
                                    )}

                                    {(() => {
                                        const isIncomingTransfer = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                                        if (isIncomingTransfer) {
                                            return (
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={(e) => { e.stopPropagation(); handleTransferResponse(ticket, 'accepted'); }}
                                                        className="text-xs px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 hover:bg-emerald-100">
                                                        <CheckCircle2 size={13} /> Nhận phiếu
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleTransferResponse(ticket, 'rejected'); }}
                                                        className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 hover:bg-red-100">
                                                        <X size={13} /> Từ chối
                                                    </button>
                                                </div>
                                            );
                                        }

                                        return (
                                            <>
                                                {(() => {
                                                    if (isReadOnly) return null;

                                        const allowedNextStatuses = getTechnicianAllowedNextStatuses(ticket, workflow, user?.uid, isRepairManager(user));
                                                    if (allowedNextStatuses.length > 0) {
                                                        return allowedNextStatuses.map((nextCfg) => {
                                                            const isRefundOutcome = nextCfg.terminalAction === 'refund' || nextCfg.allowedFeatures?.includes('refundOutcome');
                                                            const isHandoverOutcome = nextCfg.terminalAction === 'handover';
                                                            return (
                                                                <button key={nextCfg.id} onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, nextCfg.id); }}
                                                                    disabled={isStatusTransitionPending}
                                                                    className={`py-1.5 px-3 text-white rounded-lg font-bold text-xs shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5 justify-center disabled:cursor-not-allowed disabled:opacity-60 ${isRefundOutcome ? 'bg-red-500 hover:bg-red-600' : isHandoverOutcome ? 'bg-gray-700 hover:bg-gray-800' : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'}`}>
                                                                    {isKtvAwaitingInspectionStart ? 'Bắt đầu kiểm tra' : `Chuyển → ${nextCfg.label}`}
                                                                </button>
                                                            );
                                                        });
                                                    }

                                                    return null;
                                                })()}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {viewMode === 'kanban' && (
                <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
                    {Array.from(new Map(
                        [...dynamicStatuses, ...warrantyStatuses]
                            .filter(s => !s.isTerminal && !isTechnicianHandoffStatus(s))
                            .map(s => [s.id, s])
                    ).values()).map(col => {
                        const colTickets = filtered.filter(t => t.status === col.id);
                        return (
                            <div key={col.id} className="bg-gray-50/50 rounded-xl border p-3 min-w-[280px] max-w-[280px] flex-shrink-0 snap-center flex flex-col max-h-[70vh]">
                                <div className="flex items-center justify-between mb-3 shrink-0">
                                    <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${col.color.split(' ')[0]}`} />
                                        {col.label}
                                    </h3>
                                    <span className="text-xs bg-white px-2 py-0.5 rounded-full font-bold text-gray-500 border">
                                        {colTickets.length}
                                    </span>
                                </div>
                                <div className="space-y-2 overflow-y-auto flex-1 pr-1 pb-1">
                                    {colTickets.length === 0 ? (
                                        <div className="text-center py-8 text-gray-300 text-xs bg-white/50 rounded-lg border border-dashed">Thùng rỗng</div>
                                    ) : colTickets.map(ticket => {
                                        const workflow = getWorkflowForTicket(ticket);
                                        const st = workflow.find(s => s.id === ticket.status) as WorkflowNode | undefined;
                                        const isTerminal = isTicketWaitingForCustomerHandoff(ticket, workflow) || !!st?.isTerminal;
                                        const inboundTechnicianHoldMessage = getInboundTechnicianHoldMessage(ticket, st);
                                        const isAssignedToMe = ticket.staff?.assignedTechnician === user?.uid;
                                        const isIncomingTransferToMe = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                                        const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                                        const isReadOnly = isTerminal || isKtvLocked || Boolean(inboundTechnicianHoldMessage);
                                        const isKtvAwaitingInspectionStart = user?.role !== 'admin'
                                            && !inboundTechnicianHoldMessage
                                            && isAssignedTechnicianAtWorkflowEntry(ticket, workflow, user?.uid);

                                        return (
                                            <div key={ticket.id} className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow relative group">
                                                <div className="flex items-center gap-1 text-[10px] font-medium text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 mb-1.5 w-fit max-w-full">
                                                    <UserIcon size={10} className="flex-shrink-0" />
                                                    <span className="truncate">{ticket.staff?.assignedTechnicianName || 'Chưa phân công'}</span>
                                                </div>
                                                <div className="flex items-start justify-between mb-1">
                                                    <p className="font-semibold text-base text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1 pr-6">{ticket.deviceInfo?.model || 'Thiết bị'}</p>
                                                    <button
                                                        onClick={() => setSelectedTicket(ticket)}
                                                        className="text-gray-400 hover:text-orange-500 absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-white"
                                                        aria-label="Xem chi tiết phiếu"
                                                        title="Xem chi tiết"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <p className="text-xs text-gray-500 font-mono">#{ticket.id.slice(-6).toUpperCase()}</p>
                                                    {ticket.ticketType === 'warranty' && (
                                                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold">BH</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 mt-0.5 max-w-full truncate">{ticket.customer?.name}</p>
                                                {inboundTechnicianHoldMessage && (
                                                    <div className="mt-2 flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] font-semibold text-sky-800">
                                                        <Truck size={12} className="shrink-0" />
                                                        <span>{inboundTechnicianHoldMessage}</span>
                                                    </div>
                                                )}
                                                {ticket.issues && ticket.issues.length > 0 ? (
                                                    <p className="text-sm text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-2 rounded">{ticket.issues.map(i => i.label).join(', ')}</p>
                                                ) : ticket.issue?.description && (
                                                    <p className="text-sm text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-2 rounded">{ticket.issue.description}</p>
                                                )}

                                                {!inboundTechnicianHoldMessage && !isKtvAwaitingInspectionStart && st?.allowedFeatures?.includes('requireChecklist') && (
                                                    <div className="mt-2 pt-2 border-t">
                                                        <div className="grid grid-cols-2 gap-0.5">
                                                            {Object.keys(checklistLabels).map(key => {
                                                                const val = (ticket.deviceInfo?.checklist as Record<string, string> | undefined)?.[key] || '';
                                                                return (
                                                                    <div key={key} className="flex items-center gap-1">
                                                                        <span className="text-xs font-medium text-gray-600 w-[55px] truncate">{checklistLabels[key]}</span>
                                                                        <select
                                                                            value={val}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onChange={e => handleChecklistUpdate(ticket, key, e.target.value)}
                                                                            disabled={isReadOnly}
                                                                            aria-label={`Checklist (kanban): ${checklistLabels[key]}`}
                                                                            title={`Checklist (kanban): ${checklistLabels[key]}`}
                                                                            className={`text-sm font-semibold flex-1 px-2 py-1 rounded border cursor-pointer appearance-none ${val === 'OK' ? 'bg-green-50 border-green-200 text-green-700' :
                                                                                    val === 'Lỗi' ? 'bg-red-50 border-red-200 text-red-600' :
                                                                                        val ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                                                                            'bg-gray-50 border-gray-200 text-gray-600'
                                                                                }`}>
                                                                            <option value="">--</option>
                                                                            {CHECKLIST_VALUES.map(v => (
                                                                                <option key={v} value={v}>{v}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {(() => {
                                                    const isIncomingTransfer = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                                                    if (isIncomingTransfer) {
                                                        return (
                                                            <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                                <button onClick={(e) => { e.stopPropagation(); handleTransferResponse(ticket, 'accepted'); }}
                                                                    className="text-[11px] px-2 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md font-medium transition-all flex items-center justify-center gap-1 w-full hover:bg-emerald-500 hover:text-white">
                                                                    <CheckCircle2 size={12} /> Nhận phiếu
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleTransferResponse(ticket, 'rejected'); }}
                                                                    className="text-[11px] px-2 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-md font-medium transition-all flex items-center justify-center gap-1 w-full hover:bg-red-500 hover:text-white">
                                                                    <X size={12} /> Từ chối
                                                                </button>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <>
                                                            {(() => {
                                                                const allowedNextStatuses = getTechnicianAllowedNextStatuses(ticket, workflow, user?.uid, isRepairManager(user));
                                                                if (allowedNextStatuses.length > 0) {
                                                                    return (
                                                                        <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                                            {allowedNextStatuses.map((nextCfg) => {
                                                                                const isRefundOutcome = nextCfg.terminalAction === 'refund' || nextCfg.allowedFeatures?.includes('refundOutcome');
                                                                                const isHandoverOutcome = nextCfg.terminalAction === 'handover';
                                                                                return (
                                                                                    <button key={nextCfg.id} onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, nextCfg.id); }}
                                                                                        disabled={pendingStatusTicketIds.includes(ticket.id)}
                                                                                        className={`w-full justify-center flex items-center gap-2 text-sm px-4 py-3 rounded-xl font-bold transition-all shadow-md disabled:cursor-not-allowed disabled:opacity-60 ${isRefundOutcome ? 'bg-red-500 text-white hover:bg-red-600' : isHandoverOutcome ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
                                                                                        {isKtvAwaitingInspectionStart ? 'Bắt đầu kiểm tra' : `Chuyển → ${nextCfg.label}`}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                }

                                                                return null;
                                                            })()}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {hasMoreTickets && !searchQuery && (
                <div className="flex justify-center pt-2">
                    <button
                        type="button"
                        onClick={loadMoreTickets}
                        disabled={isLoadingMoreTickets}
                        className="px-5 py-2.5 rounded-lg border border-orange-200 bg-orange-50 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-2"
                    >
                        {isLoadingMoreTickets && <Loader2 size={16} className="animate-spin" />}
                        {isLoadingMoreTickets ? 'Đang tải phiếu cũ...' : 'Tải thêm phiếu cũ'}
                    </button>
                </div>
            )}

            <TechnicianTicketDetailModal
                selectedTicket={selectedTicket}
                setSelectedTicket={setSelectedTicket}
                user={user}
                // userNamesMap removed
                partSearchQuery={partSearchQuery}
                setPartSearchQuery={setPartSearchQuery}
                partSearchResults={partSearchResults}
                isSearchingParts={isSearchingParts}
                serviceSuggestedParts={qualityFilteredServiceSuggestedParts}
                serviceSuggestionHint={serviceSuggestionHint}
                isLoadingServiceSuggestions={isLoadingServiceSuggestions}
                selectedPartQuality={selectedPartQuality}
                setSelectedPartQuality={setSelectedPartQuality}
                customPartName={customPartName}
                setCustomPartName={setCustomPartName}
                getWorkflowForTicket={getWorkflowForTicket}
                getTimelineTitle={getTimelineTitle}
                getTimelineTimestamp={getTimelineTimestamp}
                formatPrice={formatPrice}
                handleTransferResponse={handleTransferResponse}
                handleRemovePart={handleRemovePart}
                handleConfirmPartReceived={handleConfirmPartReceived}
                handleReportPartNotReceived={handleReportPartNotReceived}
                handleAddPart={handleAddPart}
                handleRequestPart={handleRequestPart}
                handleAddCustomPart={handleAddCustomPart}
                handleDiagnosisUpdate={handleDiagnosisUpdate}
                handleStatusChange={handleStatusChange}
            />

            <TechnicianWorkflowModals
                tickets={tickets}
                dynamicStatuses={dynamicStatuses}
                warrantyStatuses={warrantyStatuses}
                technicians={technicians}
                transferModal={transferModal}
                transferTechnicianId={transferTechnicianId}
                transferReason={transferReason}
                isTransferSubmitting={isTransferSubmitting}
                onTransferTechnicianIdChange={setTransferTechnicianId}
                onTransferReasonChange={setTransferReason}
                onCloseTransfer={() => { setTransferModal(null); setTransferTechnicianId(''); setTransferReason(''); }}
                onSubmitTransfer={handleTransferRequest}
                statusConfirmModal={statusConfirmModal}
                isStatusChanging={isStatusChanging}
                onCloseStatusConfirm={() => { if (!isStatusChanging) setStatusConfirmModal(null); }}
                onConfirmStatusChange={async (ticketId, newStatus) => {
                    setStatusConfirmModal(null);
                    await executeStatusChange(ticketId, newStatus);
                }}
                partsVerificationModalPayload={partsVerificationModalPayload}
                partsVerificationSelections={partsVerificationSelections}
                setPartsVerificationSelections={setPartsVerificationSelections}
                isPartsVerifying={isPartsVerifying}
                onClosePartsVerification={() => { if (!isPartsVerifying) setPartsVerificationModalPayload(null); }}
                onSubmitPartsVerification={handlePartsVerificationSubmit}
                noteModalPayload={noteModalPayload}
                techNoteText={techNoteText}
                onTechNoteTextChange={setTechNoteText}
                onCloseNote={() => setNoteModalPayload(null)}
                onSubmitNote={handleNoteSubmit}
            />
        </div>
    );
}
