'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { collection, query, where, updateDoc, doc, serverTimestamp, orderBy, Timestamp, limit, startAfter, getCountFromServer, DocumentSnapshot, arrayUnion, type QueryConstraint } from 'firebase/firestore';
import { getDocs, onSnapshot, getDoc } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { getSearchKeywordQuery } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import type { RepairTicket, RepairStatus, PaymentStatus, DeviceChecklist, WorkflowNode, RepairIssue } from '@/lib/types';
import { isChecklistComplete, areAllPartsReady } from '@/lib/workflowFeatures';
import { isPendingRepairPart, isSelectedRepairPart, isWarrantyEligibleRepairPart } from '@/lib/repairStatus';
import { normalizeVietnamPhone } from '@/lib/phone';
import { appAlert, appConfirm } from '@/lib/appDialog';
import {
    buildContactMethods,
    buildContactSearchKeywords,
    getPrimaryContact,
} from '@/lib/contactIdentity';
import { buildCustomerDocumentBaseId } from '@/lib/customerDocumentIds';
import type { ContactMethodType } from '@/lib/types/contact';
import { consumeChatWorkflowHandoff } from '@/lib/chatWorkflowHandoff';
import type { ReceiptConfig } from '@/components/admin/PrintableReceipt';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import { getWorkflowNormalizationOptions, normalizeRepairWorkflow, normalizeWarrantyWorkflow } from '@/lib/repairWorkflowConfig';
import { requiresRepairPaymentAtPos } from '@/lib/repairPaymentGate';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';
import { canSelectInitialPartsWhenEditingRepair } from '@/lib/repairInboundIntake';
import { canAttachBackgroundMedia, createBackgroundRepairMediaSession, type BackgroundRepairMediaSession, type RepairMediaPlacement } from '@/lib/repairMediaSession';
import {
    canOverrideRepairTerminalStatus,
    formatRepairPrice,
    resolveWarrantyTypeFromPath,
    type Appointment,
    type ServiceModel,
    type WarrantyPrintType,
} from '@/features/repairs/repairPageUtils';
import { RepairStatsGrid } from '@/features/repairs/RepairStatsGrid';
import { RepairFilters } from '@/features/repairs/RepairFilters';
import { RepairPrintTemplates } from '@/features/repairs/RepairPrintTemplates';
import { RepairHandoverModal } from '@/features/repairs/RepairHandoverModal';
import { RepairDetailModal } from '@/features/repairs/RepairDetailModal';
import { RepairWarrantyModal } from '@/features/repairs/RepairWarrantyModal';
import { RepairEditorModal, type RepairEditorFormData } from '@/features/repairs/RepairEditorModal';
import { RepairAuxiliaryModals } from '@/features/repairs/RepairAuxiliaryModals';
import { RepairPageHeader } from '@/features/repairs/RepairPageHeader';
import { RepairMediaManagers } from '@/features/repairs/RepairMediaManagers';
import { RepairTicketBoard } from '@/features/repairs/RepairTicketBoard';
const paymentLabels: Record<PaymentStatus, { label: string; color: string }> = {
    unpaid: { label: 'Chưa thanh toán', color: 'text-red-600 bg-red-50' },
    deposit: { label: 'Đã đặt cọc', color: 'text-yellow-600 bg-yellow-50' },
    paid: { label: 'Đã thanh toán', color: 'text-green-600 bg-green-50' },
    pay_later: { label: 'Thanh toán sau', color: 'text-purple-600 bg-purple-50' },
    refunded: { label: 'Đã hoàn tiền', color: 'text-orange-600 bg-orange-50' },
    warranty: { label: 'Bảo hành', color: 'text-blue-600 bg-blue-50' },
};
const formatPrice = formatRepairPrice;
const REPAIRS_PAGE_SIZE = 50;
const REPAIR_SEARCH_LIMIT = 50;
type RepairListTab = 'active' | 'closed';
function getRepairCustomerContact(ticket: RepairTicket): string {
    return ticket.customer.primaryContactValue
        || ticket.customer.contactValue
        || ticket.customer.phone
        || ticket.customer.id
        || ticket.customer.customerId
        || '';
}

function isContactMethodType(value: string | null | undefined): value is ContactMethodType {
    return value === 'phone' || value === 'zalo' || value === 'facebook' || value === 'email' || value === 'address' || value === 'note' || value === 'other';
}

function getWorkflowForTicketFromLists(ticket: RepairTicket, repairStatuses: WorkflowNode[], warrantyStatuses: WorkflowNode[]): WorkflowNode[] {
    return ticket.ticketType === 'warranty' ? warrantyStatuses : repairStatuses;
}

function getEntryStatusId(statuses: WorkflowNode[], configuredEntryStatusId: string): RepairStatus | undefined {
    return statuses.find(status => status.id === configuredEntryStatusId)?.id as RepairStatus | undefined
        || statuses[0]?.id as RepairStatus | undefined;
}

function isTerminalTicket(ticket: RepairTicket, repairStatuses: WorkflowNode[], warrantyStatuses: WorkflowNode[]): boolean {
    const workflow = getWorkflowForTicketFromLists(ticket, repairStatuses, warrantyStatuses);
    return workflow.find(status => status.id === ticket.status)?.isTerminal === true;
}

function getRepairScopeStatusIds(tab: RepairListTab, repairStatuses: WorkflowNode[], warrantyStatuses: WorkflowNode[]): string[] {
    const shouldUseTerminal = tab === 'closed';
    const ids = [...repairStatuses, ...warrantyStatuses]
        .filter(status => status.isTerminal === shouldUseTerminal)
        .map(status => status.id)
        .filter(Boolean);

    return Array.from(new Set(ids));
}

function getRepairCreatedAtMillis(ticket: RepairTicket): number {
    const createdAt = ticket.createdAt as unknown as Timestamp | number | undefined;
    if (typeof createdAt === 'number') return createdAt;
    return createdAt?.toMillis?.() || 0;
}

function sortRepairTicketsByCreatedAtDesc(ticketsToSort: RepairTicket[]): RepairTicket[] {
    return [...ticketsToSort].sort((a, b) => getRepairCreatedAtMillis(b) - getRepairCreatedAtMillis(a));
}

function getDateMillis(value: unknown): number {
    if (typeof value === 'number') return value;
    return (value as { toDate?: () => Date; toMillis?: () => number } | undefined)?.toMillis?.()
        || (value as { toDate?: () => Date } | undefined)?.toDate?.()?.getTime()
        || 0;
}

function hasActiveWarrantySource(ticket: RepairTicket): boolean {
    const hasPartWarranty = (ticket.parts || []).some(part =>
        isSelectedRepairPart(part)
        && isWarrantyEligibleRepairPart(part)
        && Number(part.warrantyMonths || 0) > 0
        && getDateMillis(part.warrantyExpiresAt) > Date.now()
    );
    if (hasPartWarranty) return true;
    return getDateMillis(ticket.serviceWarrantyExpiresAt) > Date.now();
}

function buildRepairListConstraints(statusIds: string[], cursor?: DocumentSnapshot | null): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];
    if (statusIds.length > 0 && statusIds.length <= 30) {
        constraints.push(where('status', 'in', statusIds));
    } else {
        constraints.push(orderBy('createdAt', 'desc'));
    }
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(REPAIRS_PAGE_SIZE));
    return constraints;
}

export default function RepairPage() {
    const { user } = useAuth();
    const canOverrideTerminalStatus = canOverrideRepairTerminalStatus(user);
    const { config } = useConfig();
    const searchParams = useSearchParams();
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isSearchingDB, setIsSearchingDB] = useState(false);
    const [staffs, setStaffs] = useState<{ uid: string; displayName: string }[]>([]);
    const [services, setServices] = useState<ServiceModel[]>([]);
    const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig | undefined>(undefined);
    const [printWarrantyType, setPrintWarrantyType] = useState<WarrantyPrintType | null>(null);
    const [preMediaFiles, setPreMediaFiles] = useState<string[]>([]);
    const [postMediaFiles, setPostMediaFiles] = useState<string[]>([]);
    const [showPreMediaManager, setShowPreMediaManager] = useState(false);
    const [showPostMediaManager, setShowPostMediaManager] = useState(false);
    const [activeMediaUploadContext, setActiveMediaUploadContext] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [techFilter, setTechFilter] = useState<string>('all');
    const [ticketTypeFilter, setTicketTypeFilter] = useState<'all' | 'repair' | 'warranty'>('all');
    const [repairListTab, setRepairListTab] = useState<RepairListTab>('active');
    const [showModal, setShowModal] = useState(false);
    const [editingTicket, setEditingTicket] = useState<RepairTicket | null>(null);
    const [printMode, setPrintMode] = useState<'receipt' | 'invoice' | 'warranty' | 'handover' | null>(null);
    const [printTicket, setPrintTicket] = useState<RepairTicket | null>(null);

    const [noteModal, setNoteModal] = useState<{ ticket: RepairTicket; targetStatus: RepairStatus } | null>(null);
    const [deliveryNote, setDeliveryNote] = useState('');
    const [posRedirectModal, setPosRedirectModal] = useState<{ ticket: RepairTicket } | null>(null);
    const [handoverModal, setHandoverModal] = useState<{ ticket: RepairTicket; action: 'handover' | 'refund'; targetStatus?: string } | null>(null);
    const [handoverNote, setHandoverNote] = useState('');
    const [paymentConfirmed, setPaymentConfirmed] = useState(false);
    const [handoverAdditionalFees, setHandoverAdditionalFees] = useState<string>('');
    const [handoverLaborCost, setHandoverLaborCost] = useState<string>('');
    const [viewingTicket, setViewingTicket] = useState<RepairTicket | null>(null);
    const [warrantyModal, setWarrantyModal] = useState<RepairTicket | null>(null);
    const [warrantyHistory, setWarrantyHistory] = useState<RepairTicket[]>([]);
    const [warrantySelectedIndexes, setWarrantySelectedIndexes] = useState<number[]>([]);
    const [warrantyCreating, setWarrantyCreating] = useState(false);
    const [repairSaving, setRepairSaving] = useState(false);
    const [assignModal, setAssignModal] = useState<{ ticket: RepairTicket } | null>(null);
    const [assignTechnicianId, setAssignTechnicianId] = useState('');
    const [managerOverrideModal, setManagerOverrideModal] = useState<{ ticket: RepairTicket; targetStatus: string } | null>(null);
    const [managerOverrideNote, setManagerOverrideNote] = useState('');
    const chatPrefillApplied = useRef(false);
    const repairSaveInFlightRef = useRef(false);
    const repairCreateOperationKeyRef = useRef<string | null>(null);
    const activeMediaUploadContextRef = useRef<string | null>(null);
    const appointmentMediaContextRef = useRef<string | null>(null);
    const backgroundRepairMediaSessionsRef = useRef(new Map<string, BackgroundRepairMediaSession>());
    const warrantyCreateInFlightRef = useRef(false);
    const warrantyCreateOperationKeyRef = useRef<string | null>(null);

    const startRepairMediaSession = useCallback(() => {
        const previousContext = activeMediaUploadContextRef.current;
        if (previousContext && !backgroundRepairMediaSessionsRef.current.get(previousContext)?.ticketId) {
            backgroundRepairMediaSessionsRef.current.delete(previousContext);
        }

        const nextContext = crypto.randomUUID();
        backgroundRepairMediaSessionsRef.current.set(nextContext, createBackgroundRepairMediaSession());
        activeMediaUploadContextRef.current = nextContext;
        setActiveMediaUploadContext(nextContext);
        return nextContext;
    }, []);

    const persistBackgroundRepairMedia = async (uploadContext: string, placement: RepairMediaPlacement) => {
        const session = backgroundRepairMediaSessionsRef.current.get(uploadContext);
        if (!session?.ticketId) return;

        const { getAuthInstance } = await import('@/lib/firebase');
        const auth = await getAuthInstance();
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
            toastError('Không thể tự gắn media nền vì phiên đăng nhập đã hết hạn.');
            return;
        }

        for (const url of session.uploaded[placement]) {
            if (!canAttachBackgroundMedia(session, placement, url)) {
                continue;
            }

            session.attaching[placement].add(url);
            try {
                const response = await fetch('/api/repairs/media', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        ticketId: session.ticketId,
                        mediaUrl: url,
                        source: 'upload',
                        placement,
                    }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.error || 'Không thể gắn media vào phiếu.');
                }
                session.attached[placement].add(url);
            } catch (error) {
                console.error('Unable to attach background repair media:', error);
                toastError(error instanceof Error ? error.message : 'Không thể gắn media nền vào phiếu.');
            } finally {
                session.attaching[placement].delete(url);
            }
        }
    };

    const handleBackgroundRepairMediaUploaded = (
        placement: RepairMediaPlacement,
        urls: string[],
        uploadContext: string | null | undefined,
    ) => {
        if (!uploadContext) return;
        const session = backgroundRepairMediaSessionsRef.current.get(uploadContext);
        if (!session) return;

        const uniqueUrls = Array.from(new Set(urls.filter(url => url && !session.excluded[placement].has(url))));
        uniqueUrls.forEach(url => session.uploaded[placement].add(url));

        if (activeMediaUploadContextRef.current === uploadContext) {
            const appendUrls = (current: string[]) => Array.from(new Set([...current, ...uniqueUrls]));
            if (placement === 'pre_repair') {
                setPreMediaFiles(appendUrls);
            } else {
                setPostMediaFiles(appendUrls);
            }
        }

        void persistBackgroundRepairMedia(uploadContext, placement);
    };

    const handleRemoveRepairMedia = (placement: RepairMediaPlacement, url: string) => {
        if (repairSaveInFlightRef.current) return;
        const context = activeMediaUploadContextRef.current;
        if (context) backgroundRepairMediaSessionsRef.current.get(context)?.excluded[placement].add(url);
        const update = placement === 'pre_repair' ? setPreMediaFiles : setPostMediaFiles;
        update(current => current.filter(value => value !== url));
    };

    const handleSelectRepairMedia = (placement: RepairMediaPlacement, urls: string[]) => {
        const context = activeMediaUploadContextRef.current;
        const session = context ? backgroundRepairMediaSessionsRef.current.get(context) : undefined;
        urls.forEach(url => session?.excluded[placement].delete(url));
        const update = placement === 'pre_repair' ? setPreMediaFiles : setPostMediaFiles;
        update(current => Array.from(new Set([...current, ...urls])));
    };

    const bindBackgroundRepairMediaToTicket = (
        ticketId: string,
        submittedPreMedia: string[],
        submittedPostMedia: string[],
    ) => {
        const uploadContext = activeMediaUploadContextRef.current;
        if (!uploadContext) return;
        const session = backgroundRepairMediaSessionsRef.current.get(uploadContext);
        if (!session) return;

        session.ticketId = ticketId;
        submittedPreMedia.forEach(url => session.submitted.pre_repair.add(url));
        submittedPostMedia.forEach(url => session.submitted.post_repair.add(url));
        void persistBackgroundRepairMedia(uploadContext, 'pre_repair');
        void persistBackgroundRepairMedia(uploadContext, 'post_repair');
    };

    const handleCloseRepairEditor = () => {
        const uploadContext = activeMediaUploadContextRef.current;
        if (uploadContext && !backgroundRepairMediaSessionsRef.current.get(uploadContext)?.ticketId) {
            backgroundRepairMediaSessionsRef.current.delete(uploadContext);
        }
        activeMediaUploadContextRef.current = null;
        setActiveMediaUploadContext(null);
        setShowModal(false);
    };

    useEffect(() => {
        if (warrantyModal) {
            const fetchHistory = async () => {
                try {
                    const q = query(collection(db, 'repairs'), where('warrantyClaim.originalTicketId', '==', warrantyModal.id));
                    const snap = await getDocs(q);
                    setWarrantyHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket)));
                } catch (e) {
                    console.error('Error fetching warranty history:', e);
                }
            };
            fetchHistory();
        } else {
            setWarrantyHistory([]);
        }
    }, [warrantyModal]);
    const emptyForm = useMemo<RepairEditorFormData>(() => ({
        appointmentId: '',
        appointmentIntakeMethod: '',
        customerId: '',
        customerName: '',
        customerPhone: '',
        customerZalo: '',
        customerFacebook: '',
        customerOtherContact: '',
        customerPrimaryContactType: 'phone' as ContactMethodType,
        deviceModel: '',
        deviceImei: '',
        devicePasscode: '',
        deviceColor: '',
        checkBody: 'OK',
        checkScreen: 'OK',
        checkTouch: 'OK',
        checkCamera: 'OK',
        checkSpeaker: 'OK',
        checkConnectivity: 'OK',
        checkBattery: 'OK',
        checkBiometric: 'OK',
        hasPriorRepair: false,
        hasWaterDamage: false,
        hasNonGenuineParts: false,
        historyOtherNote: '',
        issueDescription: '',
        techNotes: '',
        issues: [] as RepairIssue[],
        initialParts: [],
        initialPartRequests: [],
        partsCost: '' as string | number,
        laborCost: '' as string | number,
        depositAmount: '' as string | number,
        paymentStatus: 'unpaid' as PaymentStatus,
        technicianId: '',
        status: '' as RepairStatus,
        estimatedReturnDate: '',
        selectedServiceName: '',
        selectedCategoryPath: [] as string[],
    }), []);
    const [formData, setFormData] = useState(emptyForm);

    useEffect(() => {
        const phone = formData.customerPhone.trim();
        if (phone.length >= 10 && !editingTicket && showModal) {
            const fetchCustomer = async () => {
                try {
                    const snap = await getDoc(doc(db, 'customers', phone));
                    if (snap.exists()) {
                        const customerData = snap.data();
                        const fetchedName = customerData.name || customerData.displayName || '';
                        if (fetchedName) {
                            setFormData(p => {
                                return {
                                    ...p,
                                    customerId: p.customerId || snap.id,
                                    customerName: p.customerName || fetchedName,
                                    customerPrimaryContactType: 'phone',
                                };
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error fetching customer:', e);
                }
            };
            fetchCustomer();
        }
    }, [formData.customerPhone, editingTicket, showModal]);

    const [totalCount, setTotalCount] = useState<number | null>(null);

    useEffect(() => {
        getCountFromServer(collection(db, 'repairs'))
            .then(snap => setTotalCount(snap.data().count))
            .catch(() => null);
    }, []);

    const [dynamicStatuses, setDynamicStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);
    const [repairEntryStatusId, setRepairEntryStatusId] = useState('');
    const [warrantyEntryStatusId, setWarrantyEntryStatusId] = useState('');
    const [statusConfigLoaded, setStatusConfigLoaded] = useState(false);
    const getWorkflowForTicket = (ticket: RepairTicket): WorkflowNode[] => {
        return getWorkflowForTicketFromLists(ticket, dynamicStatuses, warrantyStatuses);
    };

    const getWarrantyTypeForTicket = (ticket: RepairTicket): WarrantyPrintType | null => {
        const categoryPath = ticket.categoryPath || [];
        if (categoryPath.length === 0) return hasActiveWarrantySource(ticket) ? 'warrantyRepair' : null;

        const taxonomyRoots = [
            ...(config.taxonomy?.service || []),
            ...(config.taxonomy?.retail || []),
            ...(config.taxonomy?.component || []),
        ];

        return resolveWarrantyTypeFromPath(taxonomyRoots, categoryPath)
            || (hasActiveWarrantySource(ticket) ? 'warrantyRepair' : null);
    };

    const getWarrantyConfigForType = (type: WarrantyPrintType | null): WarrantyTemplateConfig | undefined => {
        return type && receiptConfig ? receiptConfig[type] : undefined;
    };
    useEffect(() => {
        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const normalizationOptions = getWorkflowNormalizationOptions(data.workflowSchemaVersion);
                const repairWorkflow = normalizeRepairWorkflow(data.repairStatuses ?? data.statuses ?? [], normalizationOptions);
                const warrantyWorkflow = normalizeWarrantyWorkflow(data.warrantyStatuses ?? [], normalizationOptions);
                setDynamicStatuses(repairWorkflow);
                setWarrantyStatuses(warrantyWorkflow);
                setRepairEntryStatusId(repairWorkflow.find(status => status.id === data.repairEntryStatusId)?.id || repairWorkflow[0]?.id || '');
                setWarrantyEntryStatusId(warrantyWorkflow.find(status => status.id === data.warrantyEntryStatusId)?.id || warrantyWorkflow[0]?.id || '');
            }
            setStatusConfigLoaded(true);
        }, (err) => {
            console.error('Repair workflow listener error:', err);
            setStatusConfigLoaded(true);
        });
        getDoc(doc(db, 'system_config', 'receipt')).then(snap => {
            if (snap.exists()) setReceiptConfig(snap.data() as ReceiptConfig);
        }).catch(console.error);
        return () => {
            unsubStatuses();
        };
    }, []);

    useEffect(() => {
        if (!statusConfigLoaded) return;

        const statusIds = getRepairScopeStatusIds(repairListTab, dynamicStatuses, warrantyStatuses);
        const hasWorkflowStatuses = dynamicStatuses.length + warrantyStatuses.length > 0;
        if (repairListTab === 'closed' && hasWorkflowStatuses && statusIds.length === 0) {
            setTickets([]);
            setLastDoc(null);
            setHasMore(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        setTickets([]);
        setLastDoc(null);
        const q = query(collection(db, 'repairs'), ...buildRepairListConstraints(statusIds));
        const unsubTickets = onSnapshot(q, (snap) => {
            const scopedTickets = sortRepairTicketsByCreatedAtDesc(snap.docs
                .map(d => ({ id: d.id, ...d.data() } as RepairTicket))
                .filter(ticket => repairListTab === 'closed'
                    ? isTerminalTicket(ticket, dynamicStatuses, warrantyStatuses)
                    : !isTerminalTicket(ticket, dynamicStatuses, warrantyStatuses)));
            setTickets(scopedTickets);
            setLastDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === REPAIRS_PAGE_SIZE);
            setLoading(false);
        }, (err) => {
            console.error('Repairs listener error:', err);
            setLoading(false);
        });

        return () => unsubTickets();
    }, [dynamicStatuses, repairListTab, statusConfigLoaded, warrantyStatuses]);

    const loadMoreData = async () => {
        if (!lastDoc || !hasMore) return;
        setLoading(true);
        const statusIds = getRepairScopeStatusIds(repairListTab, dynamicStatuses, warrantyStatuses);
        const q = query(collection(db, 'repairs'), ...buildRepairListConstraints(statusIds, lastDoc));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const data = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as RepairTicket))
                .filter(ticket => repairListTab === 'closed'
                    ? isTerminalTicket(ticket, dynamicStatuses, warrantyStatuses)
                    : !isTerminalTicket(ticket, dynamicStatuses, warrantyStatuses));
            setTickets(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newItems = data.filter(d => !existingIds.has(d.id));
                return sortRepairTicketsByCreatedAtDesc([...prev, ...newItems]);
            });
            setLastDoc(snap.docs[snap.docs.length - 1]);
            setHasMore(snap.docs.length === REPAIRS_PAGE_SIZE);
        } else {
            setHasMore(false);
        }
        setLoading(false);
    };
    const searchInDatabase = async () => {
        if (!searchTerm.trim()) {
            toastWarning('Vui lòng nhập số điện thoại, tên máy, IMEI hoặc mã phiếu để tìm trên máy chủ.');
            return;
        }
        setIsSearchingDB(true);
        try {
            const s = searchTerm.trim();
            const searchToken = getSearchKeywordQuery(s);
            const phone = s.replace(/[^0-9]/g, '').trim();

            const queries = [
                getDocs(query(collection(db, 'repairs'), where('searchKeywords', 'array-contains', searchToken), limit(REPAIR_SEARCH_LIMIT))),
                getDocs(query(collection(db, 'repairs'), where('customer.id', '==', s), limit(REPAIR_SEARCH_LIMIT))),
                getDocs(query(collection(db, 'repairs'), where('deviceInfo.imei', '==', s), limit(REPAIR_SEARCH_LIMIT))),
            ];
            if (phone.length >= 8) {
                queries.push(getDocs(query(collection(db, 'repairs'), where('customer.phone', '==', phone), limit(10))));
            }

            const snaps = await Promise.all(queries);
            const foundMap = new Map<string, RepairTicket>();

            snaps.forEach(snap => {
                snap.docs.forEach(d => {
                    foundMap.set(d.id, { id: d.id, ...d.data() } as RepairTicket);
                });
            });

            try {
                const docSnap = await getDoc(doc(db, 'repairs', s));
                if (docSnap.exists()) {
                    foundMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as RepairTicket);
                }
            } catch {}

            if (foundMap.size > 0) {
                const combined = Array.from(foundMap.values());
                setTickets(prev => {
                    const map = new Map(prev.map(p => [p.id, p]));
                    combined.forEach(c => map.set(c.id, c));
                    return Array.from(map.values()).sort((a, b) => {
                        const tA = (a.createdAt as unknown as Timestamp)?.toMillis?.() || 0;
                        const tB = (b.createdAt as unknown as Timestamp)?.toMillis?.() || 0;
                        return tB - tA;
                    });
                });
                toastSuccess(`Đã tìm thấy ${combined.length} phiếu sửa chữa từ Server!`);
            } else {
                toastWarning('Không tìm thấy dữ liệu trên máy chủ!');
            }
        } catch (e) {
            console.error('Lỗi tìm kiếm DB', e);
            toastError('Lỗi tìm kiếm!');
        } finally {
            setIsSearchingDB(false);
        }
    };
    useEffect(() => {
        if (!showModal && !assignModal && !managerOverrideModal) return;
        if (staffs.length > 0) return; // already loaded
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'admin'])));
                setStaffs(snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName || 'N/A' })));
            } catch (e) { console.error(e); }
        })();
    }, [showModal, assignModal, managerOverrideModal, staffs.length]);
    useEffect(() => {
        const hasAppointment = !!searchParams.get('appointmentId');
        if (!showModal && !hasAppointment) return;
        if (services.length > 0) return; // already loaded
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'services'), orderBy('createdAt', 'desc'), limit(50)));
                setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) { console.error(e); }
        })();
    }, [showModal, searchParams, services.length]);
    useEffect(() => {
        const appointmentId = searchParams.get('appointmentId');
        if (!appointmentId) return;
        (async () => {
            try {
                const fallbackIntakeMethod = searchParams.get('intakeMethod') || '';
                const fallbackCustomerName = searchParams.get('customerName') || '';
                const fallbackCustomerPhone = searchParams.get('customerPhone') || '';
                const fallbackServiceId = searchParams.get('serviceId') || '';
                const fallbackServiceName = searchParams.get('serviceName') || '';
                const snap = await getDoc(doc(db, 'appointments', appointmentId));
                const app = snap.exists()
                    ? ({ id: snap.id, ...snap.data() } as Appointment)
                    : ({
                        id: appointmentId,
                        fullName: fallbackCustomerName,
                        phone: fallbackCustomerPhone,
                        serviceId: fallbackServiceId,
                        serviceName: fallbackServiceName,
                        intakeMethod: fallbackIntakeMethod,
                    } as Appointment);
                setFormData(prev => {
                    const updated = {
                        ...prev,
                        appointmentId: app.id,
                        appointmentIntakeMethod: app.intakeMethod || fallbackIntakeMethod,
                        customerName: app.fullName || fallbackCustomerName,
                        customerPhone: app.phone || fallbackCustomerPhone,
                        technicianId: user?.uid || prev.technicianId,
                        selectedServiceName: app.serviceName || fallbackServiceName || '',
                    };
                    if (app.serviceId) {
                        const svc = services.find(s => s.id === app.serviceId);
                        if (svc) {
                            const price = Number(svc.price_promo || svc.price_original || svc.price) || 0;
                            updated.deviceModel = svc.device_model || updated.deviceModel;
                            updated.partsCost = price || updated.partsCost;
                            updated.selectedServiceName = svc.name || app.serviceName || '';
                        } else {
                            updated.selectedServiceName = app.appService?.name || app.serviceName || '';
                        }
                    }
                    return updated;
                });
                setEditingTicket(null);
                if (appointmentMediaContextRef.current !== appointmentId) {
                    appointmentMediaContextRef.current = appointmentId;
                    setPreMediaFiles([]);
                    setPostMediaFiles([]);
                    startRepairMediaSession();
                }
                setShowModal(true);
            } catch (e) {
                console.error('Error auto-filling from appointment:', e);
            }
        })();
    }, [searchParams, services, user?.uid, startRepairMediaSession]);

    useEffect(() => {
        if (chatPrefillApplied.current || searchParams.get('source') !== 'chat') return;
        const handoff = consumeChatWorkflowHandoff(searchParams);
        if (!handoff) return;
        const initialStatus = getEntryStatusId(dynamicStatuses, repairEntryStatusId);
        if (!initialStatus) return;
        const handoffContactType = isContactMethodType(handoff.primaryContactType) ? handoff.primaryContactType : handoff.customerPhone ? 'phone' : 'other';
        const handoffContactValue = handoff.primaryContactValue || '';
        setEditingTicket(null);
        setPreMediaFiles([]);
        setPostMediaFiles([]);
        startRepairMediaSession();
        setFormData({
            ...emptyForm,
            status: initialStatus,
            customerId: handoff.customerId || '',
            customerName: handoff.customerName,
            customerPhone: handoff.customerPhone,
            customerZalo: handoffContactType === 'zalo' ? handoffContactValue : '',
            customerFacebook: handoffContactType === 'facebook' ? handoffContactValue : '',
            customerOtherContact: handoffContactType !== 'phone' && handoffContactType !== 'zalo' && handoffContactType !== 'facebook' ? handoffContactValue : '',
            customerPrimaryContactType: handoffContactType,
        });
        setShowModal(true);
        chatPrefillApplied.current = true;
    }, [dynamicStatuses, emptyForm, repairEntryStatusId, searchParams, startRepairMediaSession]);
    const isTerminal = (ticket: RepairTicket) => {
        return isTerminalTicket(ticket, dynamicStatuses, warrantyStatuses);
    };
    const stats = {
        total: tickets.length,
        processing: tickets.filter(t => !isTerminal(t)).length,
        completed: tickets.filter(t => isTerminal(t)).length,
        revenue: tickets
            .filter(t => isTerminal(t) && t.ticketType !== 'warranty')
            .reduce((sum, t) => sum + (t.payment?.amount || 0), 0),
    };
    const filtered = tickets.filter(t => {
        const s = searchTerm.toLowerCase();
        const matchSearch = !s ||
            t.customer.name.toLowerCase().includes(s) ||
            getRepairCustomerContact(t).toLowerCase().includes(s) ||
            t.deviceInfo?.imei?.includes(s) ||
            t.deviceInfo?.model?.toLowerCase().includes(s);
        const matchStatus = statusFilter === 'all' || t.status === statusFilter;
        const matchTech = techFilter === 'all' || t.staff?.assignedTechnician === techFilter;
        const matchType = ticketTypeFilter === 'all' || (ticketTypeFilter === 'warranty' ? t.ticketType === 'warranty' : t.ticketType !== 'warranty');
        const matchScope = repairListTab === 'closed' ? isTerminal(t) : !isTerminal(t);
        return matchSearch && matchStatus && matchTech && matchType && matchScope;
    });
    const { paginatedData: paginatedTickets, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filtered, 20);
    useEffect(() => { resetPage(); }, [repairListTab, searchTerm, statusFilter, techFilter, ticketTypeFilter, resetPage]);
    const handleQuickStatus = async (ticket: RepairTicket, nextStatus: string) => {
        const workflow = getWorkflowForTicket(ticket);
        const currentCfg = workflow.find(s => s.id === ticket.status);
        if (currentCfg?.isTerminal) {
            toastError('Phiếu đã đóng, không thể thay đổi trạng thái!');
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
        const nextCfg = workflow.find(s => s.id === nextStatus);
        if (nextCfg?.allowedFeatures?.includes('recordCustomerApproval') || nextCfg?.allowedFeatures?.includes('recordCustomerDecline')) {
            setViewingTicket(ticket);
            toastWarning('Hãy mở chi tiết phiếu để Tiếp nhận ghi nhận phản hồi của khách.');
            return;
        }
        // Payment is a gate on the CURRENT workflow node. It must take
        // precedence over the terminal action configured on the destination.
        if (requiresRepairPaymentAtPos(ticket, currentCfg)) {
            setPosRedirectModal({ ticket });
            return;
        }
        const terminalAction = nextCfg?.terminalAction;
        if (terminalAction === 'handover' || terminalAction === 'refund') {
            const defaultLaborCost = ticket.payment?.laborCost !== undefined
                ? ticket.payment.laborCost
                : Math.max(0, (ticket.issues || []).reduce((sum, i) => sum + (Number(i.estimatedPrice) || 0), 0) - (Number(ticket.payment?.partsCost) || 0));
            setHandoverLaborCost(defaultLaborCost.toString() || '');
            setHandoverModal({ ticket, action: terminalAction, targetStatus: nextStatus });
            return;
        }
        if (currentCfg?.allowedFeatures?.includes('requirePartsReady')) {
            if (!areAllPartsReady(ticket)) {
                const pendingCount = (ticket.parts || []).filter(
                    isPendingRepairPart
                ).length;
                toastError(
                    `Còn ${pendingCount} linh kiện chưa về kho. Vui lòng chờ hàng về và nhập kho trước khi chuyển sang bước tiếp theo.`
                );
                return;
            }
        }
        if (nextCfg?.allowedFeatures?.includes('requireAssignedTechnician') && !ticket.staff?.assignedTechnician) {
            toastError('Cần phân công Kỹ thuật viên trước khi thực hiện bước này!');
            setAssignModal({ ticket });
            return;
        }

        if (ticket.staff?.assignedTechnician) {
            const isAssignedKTV = ticket.staff.assignedTechnician === user?.uid;
            const isManager = user?.role === 'admin' || user?.permissions?.includes('manage_staff') || user?.permissions?.includes('manage_settings');
            const configuredActors = currentCfg?.transitionActors?.[nextStatus];
            const workflowActor = isManager ? 'manager' : isAssignedKTV ? 'technician' : ticket.staff?.createdBy === user?.uid ? 'reception' : null;

            if (configuredActors && (!workflowActor || !configuredActors.includes(workflowActor))) {
                toastError('Vai trò của bạn không được phép chuyển bước này.');
                return;
            }

            if (!configuredActors && !isAssignedKTV) {
                if (isManager) {
                    setManagerOverrideModal({ ticket, targetStatus: nextStatus });
                    return;
                } else {
                    toastError('Chỉ KTV được phân công hoặc Quản lý mới có thể chuyển trạng thái phiếu này.');
                    return;
                }
            }
        }

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
                    targetStatus: nextStatus,
                    ticketVersion: ticket.version || 0,
                    idempotencyKey: crypto.randomUUID()
                })
            });
            const data = await res.json();
            if (!res.ok) {
                toastError(data.error || 'Lỗi cập nhật trạng thái');
                return;
            }
            toastSuccess('Cập nhật trạng thái thành công');
        } catch (e: unknown) {
            console.error(e);
            toastError(e instanceof Error ? e.message : 'Lỗi cập nhật trạng thái!');
        }
    };
    const submitManagerOverride = async () => {
        if (!managerOverrideModal || !managerOverrideNote.trim()) {
            toastWarning('Vui lòng nhập lý do (Ghi chú kỹ thuật) để ghi đè trạng thái.');
            return;
        }
        try {
            const { ticket, targetStatus } = managerOverrideModal;
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/transition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    targetStatus,
                    technicianNote: managerOverrideNote.trim(),
                    ticketVersion: ticket.version || 0,
                    idempotencyKey: crypto.randomUUID()
                })
            });
            const data = await res.json();
            if (!res.ok) {
                toastError(data.error || 'Lỗi cập nhật trạng thái');
                return;
            }
            toastSuccess('Ghi đè trạng thái thành công');
            setManagerOverrideModal(null);
            setManagerOverrideNote('');
        } catch (e: unknown) {
            console.error(e);
            toastError(e instanceof Error ? e.message : 'Lỗi cập nhật trạng thái!');
        }
    };

    const submitAssignTechnician = async () => {
        if (!assignModal || !assignTechnicianId) {
            toastWarning('Vui lòng chọn Kỹ thuật viên');
            return;
        }
        try {
            const { ticket } = assignModal;
            const isTransfer = !!ticket.staff?.assignedTechnician && ticket.staff.assignedTechnician !== assignTechnicianId;
            const endpoint = isTransfer ? '/api/repairs/technician/transfer' : '/api/repairs/technician/assign';
            const techName = staffs.find(s => s.uid === assignTechnicianId)?.displayName || '';
            const payload = isTransfer
                ? { action: 'request', ticketId: ticket.id, ticketVersion: ticket.version || 0, toTechnicianId: assignTechnicianId, toTechnicianName: techName, reason: 'Yêu cầu chuyển từ UI Quản lý/KTV', source: 'admin' }
                : { ticketId: ticket.id, ticketVersion: ticket.version || 0, technicianId: assignTechnicianId, technicianName: techName };

            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
                toastError(data.error || (isTransfer ? 'Lỗi đề nghị chuyển KTV' : 'Lỗi phân công KTV'));
                return;
            }
            toastSuccess(isTransfer ? 'Đã gửi đề nghị chuyển KTV' : 'Phân công KTV thành công');
            setAssignModal(null);
            setAssignTechnicianId('');
        } catch (e: unknown) {
            console.error(e);
            toastError(e instanceof Error ? e.message : 'Lỗi phân công KTV!');
        }
    };

    const handleHandover = async () => {
        if (!handoverModal) return;
        const { ticket, action, targetStatus } = handoverModal;
        const targetStatusId = targetStatus || action;
        const parsedAdditionalFees = Number(handoverAdditionalFees.replace(/[^0-9-]/g, '')) || 0;
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/handover', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    targetStatus: targetStatusId,
                    action,
                    handoverNote: handoverNote.trim(),
                    paymentConfirmed,
                    additionalFees: parsedAdditionalFees,
                    laborCost: handoverLaborCost ? Number(handoverLaborCost.replace(/[^0-9-]/g, '')) : undefined,
                    discountAmount: 0,
                    giftItems: [],
                    operationKey: crypto.randomUUID(),
                    ticketVersion: ticket.version
                })
            });
            const data = await res.json();
            if (!res.ok) {
                toastError(data.error || 'Lỗi xử lý bàn giao');
                return;
            }

            if (data.warnings && data.warnings.length > 0) {
                for (const warning of data.warnings) {
                    toastWarning(warning);
                }
            }

            setHandoverModal(null);
            setHandoverNote('');
            setPaymentConfirmed(false);
            setHandoverAdditionalFees('');
            setHandoverLaborCost('');
            toastSuccess('Bàn giao thành công!');
        } catch (e: unknown) {
            console.error(e);
            toastError(e instanceof Error ? e.message : 'Lỗi xử lý bàn giao!');
        }
    };
    const handleCreateWarrantyTicket = async (originalTicket: RepairTicket, claimedPartIndexes: number[]) => {
        const warrantyType = getWarrantyTypeForTicket(originalTicket);
        const hasServiceWarrantyConfig = Boolean(getWarrantyConfigForType(warrantyType));
        const initialWarrantyStatus = getEntryStatusId(warrantyStatuses, warrantyEntryStatusId);
        if (!initialWarrantyStatus) {
            toastError('Chưa có trạng thái mở đầu trong workflow bảo hành.');
            return;
        }
        if (claimedPartIndexes.length === 0 && !hasServiceWarrantyConfig) {
            toastWarning('Vui lòng chọn ít nhất 1 linh kiện cần bảo hành.');
            return;
        }
        if (warrantyCreateInFlightRef.current) return;

        warrantyCreateInFlightRef.current = true;
        setWarrantyCreating(true);
        const idempotencyKey = warrantyCreateOperationKeyRef.current || crypto.randomUUID();
        warrantyCreateOperationKeyRef.current = idempotencyKey;
        try {
            const existingQ = query(
                collection(db, 'repairs'),
                where('ticketType', '==', 'warranty'),
                where('warrantyClaim.originalTicketId', '==', originalTicket.id)
            );
            const existingSnap = await getDocs(existingQ);
            const activeWarranty = existingSnap.docs.find(d => {
                const data = d.data();
                const terminalIds = warrantyStatuses.filter(s => s.isTerminal).map(s => s.id);
                return !terminalIds.includes(data.status as string);
            });
            if (activeWarranty) {
                toastWarning(`Đã có phiếu bảo hành #${activeWarranty.id.slice(-6).toUpperCase()} đang xử lý cho phiếu này.`);
                return;
            }
            const claimedPartsSnapshot = claimedPartIndexes
                .map(index => {
                    const part = originalTicket.parts?.[index];
                    if (!part) return null;
                    return {
                        originalPartIndex: index,
                        partLineId: part.partLineId || null,
                        productId: part.productId || null,
                        productName: part.productName || part.name || part.partName || 'Linh kiện',
                        partType: part.partType || '',
                        quality: part.quality || '',
                        quantity: Number(part.quantity) || 1,
                        warrantyMonths: Number(part.warrantyMonths || 0),
                        warrantyExpiresAt: part.warrantyExpiresAt || null,
                    };
                })
                .filter(Boolean);
            const warrantyTicketData = {
                idempotencyKey,
                ticketType: 'warranty' as const,
                warrantyClaim: {
                    originalTicketId: originalTicket.id,
                    originalTicketCode: originalTicket.id.slice(-6).toUpperCase(),
                    originalDeviceModel: originalTicket.deviceInfo?.model || '',
                    originalDeviceImei: originalTicket.deviceInfo?.imei || '',
                    claimedPartIndexes,
                    claimedPartsSnapshot,
                    warrantyType: warrantyType || null,
                },
                categoryPath: originalTicket.categoryPath || [],
                serviceName: originalTicket.serviceName || '',
                customer: originalTicket.customer,
                deviceInfo: {
                    model: originalTicket.deviceInfo?.model || '',
                    passcode: '',
                    imei: originalTicket.deviceInfo?.imei || '',
                    color: originalTicket.deviceInfo?.color || '',
                },
                issue: { description: claimedPartIndexes.length > 0 ? 'Bảo hành linh kiện' : 'Bảo hành dịch vụ/sửa chữa', notes: '' },
                preRepairMedia: [],
                postRepairMedia: [],
                payment: {
                    status: 'warranty' as const,
                    partsCost: 0,
                    laborCost: 0,
                    amount: 0,
                    depositAmount: 0,
                },
                staff: {
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || 'Admin',
                    assignedTechnician: '',
                    assignedTechnicianName: '',
                },
                status: initialWarrantyStatus,
                statusTimeline: [{ status: initialWarrantyStatus, timestamp: Date.now() }],
                timing: { receivedAt: serverTimestamp() },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            const { getAuthInstance } = await import('@/lib/firebase');
            const auth = await getAuthInstance();
            const token = await auth.currentUser?.getIdToken();

            const res = await fetch('/api/repairs/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(warrantyTicketData)
            });
            const createData = await res.json();
            if (!res.ok) {
                throw new Error(createData.error || 'Lỗi khi tạo phiếu bảo hành');
            }
            const warrantyTicketId = String(createData.id || '');
            if (warrantyTicketId) {
                const warrantyLog = {
                    warrantyTicketId,
                    warrantyTicketCode: warrantyTicketId.slice(-6).toUpperCase(),
                    warrantyType: warrantyType || null,
                    claimedPartIndexes,
                    claimedPartsSnapshot,
                    createdAt: Date.now(),
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || 'Admin',
                };
                await updateDoc(doc(db, 'repairs', originalTicket.id), {
                    statusTimeline: arrayUnion({
                        eventType: 'warranty_created',
                        status: originalTicket.status,
                        timestamp: Date.now(),
                        by: user?.uid || '',
                        actorId: user?.uid || '',
                        actorName: user?.displayName || 'Admin',
                        actorRole: user?.role || 'admin',
                        source: 'repairs',
                        note: `Tạo phiếu bảo hành #${warrantyLog.warrantyTicketCode}`,
                        warrantyTicketId,
                        claimedPartsSnapshot,
                    }),
                    warrantyClaimHistory: arrayUnion(warrantyLog),
                    updatedAt: serverTimestamp(),
                });
            }
            toastSuccess('Đã tạo phiếu bảo hành thành công!');
            setWarrantyModal(null);
            setWarrantySelectedIndexes([]);
        } catch (err) {
            console.error('Error creating warranty ticket:', err);
            toastError('Không thể tạo phiếu bảo hành. Vui lòng thử lại.');
        } finally {
            warrantyCreateInFlightRef.current = false;
            setWarrantyCreating(false);
        }
    };
    const applyUpdatedTicket = (updatedTicket: RepairTicket) => {
        setTickets(previous => previous.map(ticket => ticket.id === updatedTicket.id ? { ...ticket, ...updatedTicket } : ticket));
        setViewingTicket(previous => previous?.id === updatedTicket.id ? { ...previous, ...updatedTicket } : previous);
        setPrintTicket(previous => previous?.id === updatedTicket.id ? { ...previous, ...updatedTicket } : previous);
    };

    const shouldSyncRepairWarranty = (ticket: RepairTicket) => {
        if (!isTerminal(ticket) || ticket.ticketType === 'warranty') return false;
        return (ticket.parts || []).some(part =>
            isSelectedRepairPart(part)
            && isWarrantyEligibleRepairPart(part)
            && (!part.warrantyExpiresAt || Number(part.warrantyMonths || 0) <= 0)
        );
    };

    const handleOpenWarrantyModal = async (ticket: RepairTicket) => {
        warrantyCreateInFlightRef.current = false;
        warrantyCreateOperationKeyRef.current = null;
        setWarrantySelectedIndexes([]);
        if (!shouldSyncRepairWarranty(ticket)) {
            setWarrantyModal(ticket);
            return;
        }

        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/sync-warranty', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Không thể đồng bộ bảo hành phiếu sửa chữa.');
            }

            const syncedTicket = (data.ticket || ticket) as RepairTicket;
            applyUpdatedTicket(syncedTicket);
            if (data.stampedCount > 0) {
                toastSuccess(`Đã đồng bộ ${data.stampedCount} linh kiện có bảo hành.`);
            }
            setWarrantyModal(syncedTicket);
        } catch (error) {
            console.error('Error syncing repair warranty:', error);
            toastError(error instanceof Error ? error.message : 'Không thể đồng bộ bảo hành phiếu sửa chữa.');
        }
    };
    const handleOpenModal = (ticket?: RepairTicket) => {
        repairSaveInFlightRef.current = false;
        setRepairSaving(false);
        startRepairMediaSession();
        if (ticket) {
            repairCreateOperationKeyRef.current = null;
            const cl = ticket.deviceInfo?.checklist;
            const ticketIssues = ticket.issues && ticket.issues.length > 0
                ? ticket.issues
                : ticket.issue?.description
                    ? [{ id: crypto.randomUUID(), label: ticket.issue.description, estimatedPrice: 0, status: 'pending' as const }]
                    : [];
            // Legacy tickets had a single service at ticket level. Surface it
            // on every existing issue so staff can refine each one separately.
            const issuesWithServiceGroups = ticketIssues.map(issue => ({
                ...issue,
                categoryPath: issue.categoryPath?.length ? issue.categoryPath : (ticket.categoryPath || []),
                serviceName: issue.serviceName || ticket.serviceName || '',
            }));
            setFormData({
                appointmentId: ticket.appointmentId || '',
                appointmentIntakeMethod: (ticket as RepairTicket & { appointmentIntakeMethod?: string | null }).appointmentIntakeMethod || '',
                customerId: ticket.customer.id || ticket.customer.customerId || '',
                customerName: ticket.customer.name,
                customerPhone: ticket.customer.phone,
                customerZalo: ticket.customer.contactMethods?.find(method => method.type === 'zalo')?.value || '',
                customerFacebook: ticket.customer.contactMethods?.find(method => method.type === 'facebook')?.value || '',
                customerOtherContact: ticket.customer.contactMethods?.find(method => method.type === 'other')?.value || ticket.customer.primaryContactValue || ticket.customer.contactValue || '',
                customerPrimaryContactType: ticket.customer.primaryContactType || ticket.customer.contactType || (ticket.customer.phone ? 'phone' : 'other'),
                deviceModel: ticket.deviceInfo?.model || '',
                deviceImei: ticket.deviceInfo?.imei || '',
                devicePasscode: ticket.deviceInfo?.passcode || '',
                deviceColor: ticket.deviceInfo?.color || '',
                checkBody: cl?.body || 'OK',
                checkScreen: cl?.screen || 'OK',
                checkTouch: cl?.touch || 'OK',
                checkCamera: cl?.camera || 'OK',
                checkSpeaker: cl?.speaker || 'OK',
                checkConnectivity: cl?.connectivity || 'OK',
                checkBattery: cl?.battery || 'OK',
                checkBiometric: cl?.biometric || 'OK',
                hasPriorRepair: cl?.hasPriorRepair || false,
                hasWaterDamage: cl?.hasWaterDamage || false,
                hasNonGenuineParts: cl?.hasNonGenuineParts || false,
                historyOtherNote: cl?.historyOtherNote || '',
                issueDescription: ticket.issue?.description || '',
                techNotes: ticket.issue?.notes || '',
                issues: issuesWithServiceGroups,
                initialParts: [],
                initialPartRequests: [],
                partsCost: ticket.payment?.partsCost || ticket.payment?.amount || '',
                laborCost: ticket.payment?.laborCost !== undefined ? ticket.payment.laborCost : Math.max(0, (ticket.issues || []).reduce((sum, i) => sum + (Number(i.estimatedPrice) || 0), 0) - (Number(ticket.payment?.partsCost) || 0)),
                depositAmount: ticket.payment?.depositAmount || '',
                paymentStatus: ticket.payment?.status || 'unpaid',
                technicianId: ticket.staff?.assignedTechnician || '',
                status: ticket.status,
                estimatedReturnDate: '',
                selectedServiceName: ticket.serviceName || '',
                selectedCategoryPath: ticket.categoryPath || [],
            });
            setPreMediaFiles(ticket.preRepairMedia || []);
            setPostMediaFiles(ticket.postRepairMedia || []);
            setEditingTicket(ticket);
        } else {
            const initialStatus = getEntryStatusId(dynamicStatuses, repairEntryStatusId);
            if (!initialStatus) {
                toastError('Chưa có trạng thái mở đầu trong workflow sửa chữa.');
                return;
            }
            setEditingTicket(null);
            repairCreateOperationKeyRef.current = crypto.randomUUID();
            setFormData({ ...emptyForm, technicianId: '', status: initialStatus, appointmentIntakeMethod: '' });
            setPreMediaFiles([]);
            setPostMediaFiles([]);
        }
        setShowModal(true);
    };

    const handleConfirmReturnedPart = async (ticket: RepairTicket, partIndex: number) => {
        const part = ticket.parts?.[partIndex];
        if (!part?.partLineId) {
            toastError('Linh kiện chưa có mã dòng. Vui lòng tải lại phiếu.');
            return;
        }
        if (!await appConfirm(`Xác nhận đã nhận lại ${part.productName || 'linh kiện'} từ KTV?`, {
            title: 'Nhận lại linh kiện hoàn kho',
            confirmText: 'Xác nhận đã nhận',
        })) return;

        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    ticketVersion: ticket.version || 0,
                    operationKey: crypto.randomUUID(),
                    command: { type: 'confirm_return_received', partLineId: part.partLineId, quantity: 1 },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể xác nhận nhận lại linh kiện.');

            const updatedTicket = {
                ...ticket,
                parts: data.parts,
                payment: data.payment,
                version: (ticket.version || 0) + 1,
            };
            setTickets(previous => previous.map(item => item.id === ticket.id ? updatedTicket : item));
            setViewingTicket(current => current?.id === ticket.id ? updatedTicket : current);
            toastSuccess('Đã xác nhận nhận lại linh kiện hoàn kho.');
        } catch (error: unknown) {
            console.error('Confirm returned repair part error:', error);
            toastError(error instanceof Error ? error.message : 'Không thể xác nhận nhận lại linh kiện.');
        }
    };

    const handleHandoverPart = async (ticket: RepairTicket, partIndex: number) => {
        const part = ticket.parts?.[partIndex];
        if (!part?.partLineId) {
            toastError('Linh kiện chưa có mã dòng. Vui lòng tải lại phiếu.');
            return;
        }
        if (!await appConfirm(`Bàn giao ${part.productName || 'linh kiện'} cho KTV? KTV sẽ cần xác nhận đã nhận.`, {
            title: 'Bàn giao linh kiện', confirmText: 'Bàn giao LK',
        })) return;
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/confirm-parts', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    ticketId: ticket.id, ticketVersion: ticket.version || 0, operationKey: crypto.randomUUID(),
                    command: { type: 'handover_to_technician', partLineId: part.partLineId, quantity: 1 },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể bàn giao linh kiện.');
            const updatedTicket = { ...ticket, parts: data.parts, payment: data.payment, version: (ticket.version || 0) + 1 };
            setTickets(previous => previous.map(item => item.id === ticket.id ? updatedTicket : item));
            setViewingTicket(current => current?.id === ticket.id ? updatedTicket : current);
            toastSuccess('Đã bàn giao linh kiện, chờ KTV xác nhận.');
        } catch (error: unknown) {
            console.error('Handover repair part error:', error);
            toastError(error instanceof Error ? error.message : 'Không thể bàn giao linh kiện.');
        }
    };

    const handleRecordCustomerDecision = async (
        ticket: RepairTicket,
        decision: 'approved' | 'declined',
        targetStatus: string,
        customerNote: string,
    ) => {
        const workflow = getWorkflowForTicket(ticket);
        const currentNode = workflow.find(node => node.id === ticket.status);
        const targetNode = workflow.find(node => node.id === targetStatus);
        const recordsOnCurrentNode = decision === 'approved'
            ? currentNode?.allowedFeatures?.includes('recordCustomerApproval')
            : currentNode?.allowedFeatures?.includes('recordCustomerDecline');
        const recordsOnTargetNode = decision === 'approved'
            ? targetNode?.allowedFeatures?.includes('recordCustomerApproval')
            : targetNode?.allowedFeatures?.includes('recordCustomerDecline');
        if (!currentNode || !targetNode || (!recordsOnCurrentNode && !recordsOnTargetNode)) {
            toastError('Trạng thái phản hồi khách hàng không còn hợp lệ. Vui lòng tải lại phiếu.');
            return;
        }
        const decisionLabel = decision === 'approved' ? 'khách đã đồng ý sửa' : 'khách không đồng ý sửa';
        if (!await appConfirm(`Xác nhận Tiếp nhận đã trao đổi và ${decisionLabel}?`, {
            title: 'Ghi nhận phản hồi khách',
            confirmText: 'Xác nhận',
        })) return;

        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
            const res = await fetch('/api/repairs/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    ticketId: ticket.id,
                    targetStatus,
                    customerDecision: decision,
                    customerNote,
                    ticketVersion: ticket.version || 0,
                    idempotencyKey: crypto.randomUUID(),
                    source: 'repairs',
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể ghi nhận phản hồi khách hàng.');
            const updatedTicket: RepairTicket = {
                ...ticket,
                status: targetStatus,
                version: (ticket.version || 0) + 1,
                customerApproval: {
                    ...ticket.customerApproval,
                    decision,
                    note: customerNote || undefined,
                    respondedAt: new Date(),
                },
            };
            setTickets(previous => previous.map(item => item.id === ticket.id ? updatedTicket : item));
            setViewingTicket(current => current?.id === ticket.id ? updatedTicket : current);
            toastSuccess(`Đã ghi nhận ${decisionLabel}. KTV sẽ thấy thông tin này trên phiếu.`);
        } catch (error: unknown) {
            console.error('Record customer repair decision error:', error);
            toastError(error instanceof Error ? error.message : 'Không thể ghi nhận phản hồi khách hàng.');
            throw error;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (repairSaveInFlightRef.current) return;
        repairSaveInFlightRef.current = true;
        setRepairSaving(true);
        const submittedPreMedia = [...preMediaFiles];
        const submittedPostMedia = [...postMediaFiles];
        let savedTicketId = editingTicket?.id || '';

        try {
            if (!formData.customerPhone.trim()) {
                toastError('Can nhap so dien thoai khach hang.');
                return;
            }

            let normalizedCustomerPhone = '';
            if (formData.customerPhone) {
                const normalizedPhone = normalizeVietnamPhone(formData.customerPhone);
                if (!normalizedPhone) {
                    await appAlert('Số điện thoại không hợp lệ. Vui lòng nhập đúng định dạng số điện thoại Việt Nam.', { title: 'Số điện thoại không hợp lệ' });
                    return;
                }
                normalizedCustomerPhone = normalizedPhone.local;
            }

            const customerContactInput = {
                name: formData.customerName,
                phone: normalizedCustomerPhone,
                zalo: String(formData.customerZalo || ''),
                facebook: String(formData.customerFacebook || ''),
                other: String(formData.customerOtherContact || ''),
                primaryType: 'phone' as ContactMethodType,
                source: 'repair' as const,
            };
            const contactMethods = buildContactMethods(customerContactInput);
            const primaryContact = getPrimaryContact(contactMethods);
            const explicitCustomerId = String(formData.customerId || '').trim();
            const resolvedCustomerId = explicitCustomerId
                || buildCustomerDocumentBaseId({
                    ...customerContactInput,
                });
            if (!formData.customerName.trim()) {
                toastError('Can nhap ten khach hang.');
                return;
            }
            if (!explicitCustomerId && contactMethods.length === 0) {
                toastError('Can co Ma KH, SDT, Zalo, Facebook hoac lien he khac de tao phieu sua chua.');
                return;
            }
            const submittedIssues: RepairIssue[] = formData.issues.map(issue => ({
                ...issue,
                categoryPath: Array.isArray(issue.categoryPath) ? issue.categoryPath : [],
                serviceName: typeof issue.serviceName === 'string' ? issue.serviceName : '',
                serviceId: typeof issue.serviceId === 'string' ? issue.serviceId : '',
                billingMode: issue.billingMode === 'parts_only' || issue.billingMode === 'parts_and_service' || issue.billingMode === 'free'
                    ? issue.billingMode
                    : issue.billingMode === 'service_only' ? 'service_only' : undefined,
            }));
            const calculatedLaborCost = getRepairIssueLaborCost(submittedIssues, formData.initialParts, Number(formData.laborCost) || 0);
            // Keep the existing ticket-level fields as a representative projection
            // for older reports, warranty logic, and integrations. New logic reads
            // the service group from each issue above.
            const representativeIssue = submittedIssues.find(issue => (issue.categoryPath?.length || 0) > 0 || issue.serviceName);
            const representativeCategoryPath = representativeIssue?.categoryPath || formData.selectedCategoryPath;
            const representativeServiceName = representativeIssue?.serviceName || formData.selectedServiceName;
            const customerSnapshot = {
                id: resolvedCustomerId,
                customerId: resolvedCustomerId,
                name: formData.customerName.trim(),
                phone: normalizedCustomerPhone,
                contactType: primaryContact?.type || null,
                contactLabel: primaryContact?.label || '',
                contactValue: primaryContact?.value || '',
                primaryContactType: primaryContact?.type || null,
                primaryContactValue: primaryContact?.value || '',
                contactMethods,
                searchKeywords: buildContactSearchKeywords(customerContactInput, contactMethods),
            };

            const tech = staffs.find(s => s.uid === formData.technicianId);
            if (editingTicket) {
                const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
                const editRes = await fetch('/api/repairs/edit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        ticketId: editingTicket.id,
                        ticketVersion: editingTicket.version || 0,
                        idempotencyKey: crypto.randomUUID(),
                        profileData: {
                            appointmentId: formData.appointmentId || null,
                            appointmentIntakeMethod: formData.appointmentIntakeMethod || null,
                            categoryPath: representativeCategoryPath,
                            serviceName: representativeServiceName,
                            customer: customerSnapshot,
                            deviceInfo: {
                                model: formData.deviceModel,
                                imei: formData.deviceImei,
                                passcode: formData.devicePasscode,
                                color: formData.deviceColor,
                                checklist: {
                                    body: formData.checkBody,
                                    screen: formData.checkScreen,
                                    touch: formData.checkTouch,
                                    camera: formData.checkCamera,
                                    speaker: formData.checkSpeaker,
                                    connectivity: formData.checkConnectivity,
                                    battery: formData.checkBattery,
                                    biometric: formData.checkBiometric,
                                    hasPriorRepair: formData.hasPriorRepair,
                                    hasWaterDamage: formData.hasWaterDamage,
                                    hasNonGenuineParts: formData.hasNonGenuineParts,
                                    historyOtherNote: formData.historyOtherNote.trim(),
                                } as DeviceChecklist,
                            },
                            preRepairMedia: submittedPreMedia,
                            postRepairMedia: submittedPostMedia,
                            issue: {
                                description: formData.issues.length > 0
                                    ? formData.issues.map(i => i.label).join(' | ')
                                    : formData.issueDescription,
                                notes: formData.techNotes
                            },
                            issues: submittedIssues.length > 0 ? submittedIssues : null,
                            estimatedReturnAt: formData.estimatedReturnDate
                                ? new Date(formData.estimatedReturnDate).toISOString()
                                : null,
                            assignedTechnician: formData.technicianId,
                            assignedTechnicianName: tech?.displayName || '',
                        },
                        paymentData: {
                            deposit: Number(formData.depositAmount) || 0,
                            laborCost: calculatedLaborCost,
                        },
                        initialParts: formData.initialParts.map(part => ({
                            productId: part.productId,
                            issueId: part.issueId,
                            quantity: part.quantity,
                        })),
                        initialPartRequests: formData.initialPartRequests.map(part => ({
                            productId: part.productId,
                            customName: part.productId ? '' : part.productName,
                            issueId: part.issueId,
                            quantity: part.quantity,
                            quality: part.quality,
                        })),
                    })
                });

                const editDataResp = await editRes.json();
                if (!editRes.ok) {
                    throw new Error(editDataResp.error || 'Loi cap nhat phieu sua chua');
                }
            } else {
                const initialStatus = getEntryStatusId(dynamicStatuses, repairEntryStatusId);
                if (!initialStatus) {
                    throw new Error('Chưa có trạng thái mở đầu trong workflow sửa chữa.');
                }
                const idempotencyKey = repairCreateOperationKeyRef.current || crypto.randomUUID();
                repairCreateOperationKeyRef.current = idempotencyKey;
                const ticketData: Record<string, unknown> = {
                    idempotencyKey,
                    appointmentId: formData.appointmentId || null,
                    appointmentIntakeMethod: formData.appointmentIntakeMethod || null,
                    categoryPath: representativeCategoryPath,
                    serviceName: representativeServiceName,
                    customer: customerSnapshot,
                    deviceInfo: {
                        model: formData.deviceModel,
                        imei: formData.deviceImei,
                        passcode: formData.devicePasscode,
                        color: formData.deviceColor,
                        checklist: {
                            body: formData.checkBody,
                            screen: formData.checkScreen,
                            touch: formData.checkTouch,
                            camera: formData.checkCamera,
                            speaker: formData.checkSpeaker,
                            connectivity: formData.checkConnectivity,
                            battery: formData.checkBattery,
                            biometric: formData.checkBiometric,
                            hasPriorRepair: formData.hasPriorRepair,
                            hasWaterDamage: formData.hasWaterDamage,
                            hasNonGenuineParts: formData.hasNonGenuineParts,
                            historyOtherNote: formData.historyOtherNote.trim(),
                        } as DeviceChecklist,
                    },
                    preRepairMedia: submittedPreMedia,
                    postRepairMedia: submittedPostMedia,
                    statusTimeline: [{ status: initialStatus, timestamp: Date.now() }],
                    issue: {
                        description: formData.issues.length > 0
                            ? formData.issues.map(i => i.label).join(' | ')
                            : formData.issueDescription,
                        notes: formData.techNotes
                    },
                    issues: submittedIssues.length > 0 ? submittedIssues : undefined,
                    initialParts: formData.initialParts.map(part => ({
                        productId: part.productId,
                        issueId: part.issueId,
                        quantity: part.quantity,
                    })),
                    initialPartRequests: formData.initialPartRequests.map(part => ({
                        productId: part.productId,
                        customName: part.productId ? '' : part.productName,
                        issueId: part.issueId,
                        quantity: part.quantity,
                        quality: part.quality,
                    })),
                    timing: {
                        receivedAt: serverTimestamp(),
                        estimatedReturnAt: formData.estimatedReturnDate
                            ? Timestamp.fromDate(new Date(formData.estimatedReturnDate))
                            : null,
                    },
                    payment: {
                        status: formData.paymentStatus,
                        partsCost: 0,
                        laborCost: calculatedLaborCost,
                        amount: calculatedLaborCost,
                        depositAmount: Number(formData.depositAmount) || 0,
                    },
                    staff: {
                        createdBy: user?.uid || '',
                        createdByName: user?.displayName || 'Admin',
                        assignedTechnician: formData.technicianId,
                        assignedTechnicianName: tech?.displayName || '',
                    },
                    status: initialStatus,
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                    version: 1,
                };
                const depositAmt = Number(formData.depositAmount) || 0;
                if (depositAmt > 0) {
                    ticketData.paymentHistory = [{
                        type: depositAmt >= calculatedLaborCost ? 'full' : 'deposit',
                        amount: depositAmt,
                        timestamp: Date.now(),
                        note: depositAmt >= calculatedLaborCost
                            ? 'Thanh toán trước toàn bộ khi tạo phiếu'
                            : 'Đặt cọc khi tạo phiếu',
                    }];
                }
                const { getAuthInstance } = await import('@/lib/firebase');
                const auth = await getAuthInstance();
                const token = await auth.currentUser?.getIdToken();

                const res = await fetch('/api/repairs/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(ticketData)
                });

                const createResult = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(createResult.error || 'Lỗi khi tạo phiếu sửa chữa');
                }
                if (typeof createResult.id !== 'string' || !createResult.id) {
                    throw new Error('Không nhận được mã phiếu sau khi tạo.');
                }
                savedTicketId = createResult.id;
                if (formData.appointmentId) {
                    await updateDoc(doc(db, 'appointments', formData.appointmentId), {
                        status: 'completed',
                        updatedAt: serverTimestamp(),
                    });
                }
            }

            if (savedTicketId) {
                bindBackgroundRepairMediaToTicket(savedTicketId, submittedPreMedia, submittedPostMedia);
            }

            if (normalizedCustomerPhone) {
                fetch('/api/customers/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formData.customerName,
                        phone: normalizedCustomerPhone,
                        forceUpdateName: true
                    })
                }).catch(err => console.error('Failed to sync customer', err));
            }

            setShowModal(false);
            toastSuccess(editingTicket ? 'Cập nhật thành công!' : 'Tạo phiếu thành công!');
        } catch (err: unknown) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Có lỗi xảy ra!');
        } finally {
            repairSaveInFlightRef.current = false;
            setRepairSaving(false);
        }
    };
    const openPrint = (ticket: RepairTicket, mode: 'receipt' | 'invoice' | 'warranty' | 'handover', warrantyType: WarrantyPrintType | null = null) => {
        if (mode === 'warranty' && !getWarrantyConfigForType(warrantyType)) {
            toastWarning('Danh mục này chưa có mẫu phiếu bảo hành khả dụng.');
            return;
        }
        setPrintMode(mode);
        setPrintTicket(ticket);
        if (mode === 'warranty') {
            setPrintWarrantyType(warrantyType);
        } else {
            setPrintWarrantyType(null);
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(() => window.print(), 200);
            });
        });
    };
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
        );
    }
    return (
        <div className="space-y-6">
            <RepairPageHeader
                onCreate={() => handleOpenModal()}
                totalCount={totalCount}
            />
            <RepairStatsGrid stats={stats} />
            <div className="flex flex-wrap items-center gap-2 print:hidden">
                {[
                    { id: 'active' as const, label: 'Phi\u1ebfu \u0111ang x\u1eed l\u00fd' },
                    { id: 'closed' as const, label: 'Phi\u1ebfu \u0111\u00e3 \u0111\u00f3ng' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                            setRepairListTab(tab.id);
                            setStatusFilter('all');
                        }}
                        className={`h-9 rounded-lg border px-3 text-sm font-semibold transition-colors ${repairListTab === tab.id
                            ? 'border-orange-300 bg-orange-50 text-orange-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:text-orange-600'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <RepairFilters
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                showServerSearch={searchTerm.trim().length > 0 && filtered.length === 0}
                isSearchingDB={isSearchingDB}
                onSearchInDatabase={searchInDatabase}
                ticketTypeFilter={ticketTypeFilter}
                onTicketTypeFilterChange={(value) => {
                    setTicketTypeFilter(value);
                    setStatusFilter('all');
                }}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                repairListTab={repairListTab}
                techFilter={techFilter}
                onTechFilterChange={setTechFilter}
                dynamicStatuses={dynamicStatuses}
                warrantyStatuses={warrantyStatuses}
                staffs={staffs}
            />
            <RepairTicketBoard
                filtered={filtered}
                paginatedTickets={paginatedTickets}
                ticketsTotal={tickets.length}
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalFiltered={totalFiltered}
                hasMore={hasMore}
                searchTerm={searchTerm}
                canOverrideTerminalStatus={!!canOverrideTerminalStatus}
                paymentLabels={paymentLabels}
                getWorkflowForTicket={getWorkflowForTicket}
                getWarrantyTypeForTicket={getWarrantyTypeForTicket}
                getWarrantyConfigForType={getWarrantyConfigForType}
                formatPrice={formatPrice}
                handleQuickStatus={handleQuickStatus}
                handleCustomerConfirmation={setViewingTicket}
                onHandoverPart={handleHandoverPart}
                onConfirmReturnedPart={handleConfirmReturnedPart}
                handleOpenModal={handleOpenModal}
                openPrint={openPrint}
                setViewingTicket={setViewingTicket}
                setAssignModal={setAssignModal}
                setWarrantyModal={handleOpenWarrantyModal}
                setWarrantySelectedIndexes={setWarrantySelectedIndexes}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                onLoadMore={loadMoreData}
            />
            <RepairAuxiliaryModals
                noteModal={noteModal}
                deliveryNote={deliveryNote}
                onDeliveryNoteChange={setDeliveryNote}
                onCloseNote={() => { setNoteModal(null); setDeliveryNote(''); }}
                onSubmitNote={handleSubmit}
                posRedirectModal={posRedirectModal}
                onClosePosRedirect={() => setPosRedirectModal(null)}
                assignModal={assignModal}
                assignTechnicianId={assignTechnicianId}
                onAssignTechnicianIdChange={setAssignTechnicianId}
                staffs={staffs}
                onCloseAssign={() => { setAssignModal(null); setAssignTechnicianId(''); }}
                onSubmitAssign={submitAssignTechnician}
                managerOverrideModal={managerOverrideModal}
                managerOverrideNote={managerOverrideNote}
                onManagerOverrideNoteChange={setManagerOverrideNote}
                onCloseManagerOverride={() => { setManagerOverrideModal(null); setManagerOverrideNote(''); }}
                onSubmitManagerOverride={submitManagerOverride}
            />
            <RepairEditorModal
                showModal={showModal}
                editingTicket={editingTicket}
                isInboundIntakeUpdate={editingTicket?.appointmentIntakeMethod === 'send_to_store'
                    && dynamicStatuses.find(status => status.id === editingTicket.status)?.allowedFeatures?.includes('requireInboundArrival') === true
                    && !editingTicket.inboundShipping?.intakeCompletedAt}
                isInboundFreightLocked={editingTicket?.appointmentIntakeMethod === 'send_to_store'
                    && dynamicStatuses.find(status => status.id === editingTicket.status)?.allowedFeatures?.includes('requireInboundArrival') === true
                    && editingTicket.inboundShipping?.status === 'received'}
                canSelectInitialParts={!editingTicket || canSelectInitialPartsWhenEditingRepair(
                    editingTicket,
                    getWorkflowForTicketFromLists(editingTicket, dynamicStatuses, warrantyStatuses)
                        .find(status => status.id === editingTicket.status),
                )}
                formData={formData}
                setFormData={setFormData}
                dynamicStatuses={dynamicStatuses}
                canOverrideTerminalStatus={!!canOverrideTerminalStatus}
                staffs={staffs}
                preMediaFiles={preMediaFiles}
                postMediaFiles={postMediaFiles}
                onRemoveMedia={handleRemoveRepairMedia}
                setShowPreMediaManager={setShowPreMediaManager}
                setShowPostMediaManager={setShowPostMediaManager}
                paymentLabels={paymentLabels}
                services={services}
                isSubmitting={repairSaving}
                onClose={handleCloseRepairEditor}
                onSubmit={handleSubmit}
            />
            <RepairPrintTemplates
                ticket={printTicket}
                mode={printMode}
                receiptConfig={receiptConfig}
                warrantyType={printWarrantyType}
                getWarrantyConfigForType={getWarrantyConfigForType}
            />
            <RepairHandoverModal
                modal={handoverModal}
                note={handoverNote}
                onNoteChange={setHandoverNote}
                paymentConfirmed={paymentConfirmed}
                onPaymentConfirmedChange={setPaymentConfirmed}
                additionalFees={handoverAdditionalFees}
                onAdditionalFeesChange={setHandoverAdditionalFees}
                laborCost={handoverLaborCost}
                onLaborCostChange={setHandoverLaborCost}
                onClose={() => {
                    setHandoverModal(null);
                    setHandoverNote('');
                    setPaymentConfirmed(false);
                    setHandoverAdditionalFees('');
                    setHandoverLaborCost('');
                }}
                onConfirm={handleHandover}
            />
            <RepairDetailModal
                ticket={viewingTicket}
                dynamicStatuses={dynamicStatuses}
                onConfirmReturnedPart={handleConfirmReturnedPart}
                onHandoverPart={handleHandoverPart}
                onRecordCustomerDecision={handleRecordCustomerDecision}
                onInboundShippingPaid={(ticketId, inboundShipping) => {
                    setTickets(current => current.map(item => item.id === ticketId ? { ...item, inboundShipping } : item));
                    setViewingTicket(current => current?.id === ticketId ? { ...current, inboundShipping } : current);
                }}
                onEditTicket={ticket => {
                    setViewingTicket(null);
                    handleOpenModal(ticket);
                }}
                onClose={() => setViewingTicket(null)}
            />
            <RepairWarrantyModal
                ticket={warrantyModal}
                history={warrantyHistory}
                selectedIndexes={warrantySelectedIndexes}
                onSelectedIndexesChange={setWarrantySelectedIndexes}
                creating={warrantyCreating}
                onClose={() => setWarrantyModal(null)}
                onCreate={handleCreateWarrantyTicket}
            />
            <RepairMediaManagers
                showPreMediaManager={showPreMediaManager}
                setShowPreMediaManager={setShowPreMediaManager}
                showPostMediaManager={showPostMediaManager}
                setShowPostMediaManager={setShowPostMediaManager}
                onPreMediaSelected={urls => handleSelectRepairMedia('pre_repair', urls)}
                onPostMediaSelected={urls => handleSelectRepairMedia('post_repair', urls)}
                uploadContext={activeMediaUploadContext}
                onPreMediaUploaded={(urls, uploadContext) => {
                    handleBackgroundRepairMediaUploaded('pre_repair', urls, uploadContext);
                }}
                onPostMediaUploaded={(urls, uploadContext) => {
                    handleBackgroundRepairMediaUploaded('post_repair', urls, uploadContext);
                }}
            />
        </div >
    );
}
