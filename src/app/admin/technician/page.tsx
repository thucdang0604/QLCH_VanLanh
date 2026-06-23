'use client';

import { useState, useEffect } from 'react';
import {
    Wrench, Smartphone, Eye,
    CheckCircle2, Loader2, X,
    User as UserIcon, ArrowRightLeft, ShieldAlert
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { isChecklistComplete, areAllPartsReady } from '@/lib/workflowFeatures';
import type { RepairTicket, Product, WorkflowNode } from '@/lib/types';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { PART_CATEGORY_LABEL, isPartCategory } from '@/lib/constants';
import { REPAIR_PART_STATUS, REPAIR_STATUS, isPendingRepairPart, isRepairPartStatus, isRepairStatus } from '@/lib/repairStatus';
import { isRepairManager } from '@/lib/repairAccess';
import { normalizeRepairWorkflow, normalizeWarrantyWorkflow } from '@/lib/repairWorkflowConfig';
import { isSelectedRepairPart } from '@/lib/repairStatus';
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


const checklistLabels: Record<string, string> = {
    body: 'Vỏ máy', screen: 'Màn hình', touch: 'Cảm ứng', camera: 'Camera',
    speaker: 'Loa/Mic', connectivity: 'Kết nối', battery: 'Pin', biometric: 'FaceID/Vân tay',
};
const CHECKLIST_VALUES = ['OK', 'Trầy', 'Nứt', 'Móp', 'Lỗi', 'Không có'];

type RepairTimelineEntry = NonNullable<RepairTicket['statusTimeline']>[number];

function getTimelineTimestamp(entry: RepairTimelineEntry): Date {
    const value = entry.timestamp ?? entry.at;
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        return value.toDate();
    }
    return value ? new Date(value as string | number | Date) : new Date(0);
}

function getTimelineTitle(entry: RepairTimelineEntry, workflow: WorkflowNode[]): string {
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
        default:
            return workflow.find(status => status.id === entry.status)?.label || entry.status;
    }
}

function isTechnicianHandoffStatus(status: WorkflowNode | undefined): boolean {
    return status?.allowedFeatures?.includes('requirePaymentGate') === true;
}

function isTicketWaitingForCustomerHandoff(ticket: RepairTicket, workflow: WorkflowNode[]): boolean {
    const status = workflow.find(item => item.id === ticket.status);
    return isTechnicianHandoffStatus(status) || isRepairStatus(ticket.status, REPAIR_STATUS.CUSTOMER_HANDOVER);
}

function getTechnicianQueryableStatusIds(repairStatuses: WorkflowNode[], warrantyStatuses: WorkflowNode[]): string[] {
    return Array.from(new Set([...repairStatuses, ...warrantyStatuses]
        .filter(status => !status.isTerminal && !isTechnicianHandoffStatus(status))
        .map(status => status.id)
        .filter(Boolean)));
}

function getTicketCreatedAtMillis(ticket: RepairTicket): number {
    const createdAt = ticket.createdAt as unknown as { toMillis?: () => number } | number | undefined;
    return typeof createdAt === 'number' ? createdAt : createdAt?.toMillis?.() || 0;
}

function sortTicketsByCreatedAtDesc(ticketsToSort: RepairTicket[]): RepairTicket[] {
    return [...ticketsToSort].sort((a, b) => getTicketCreatedAtMillis(b) - getTicketCreatedAtMillis(a));
}

type PartSearchProduct = Product & {
    code?: string;
    model?: string;
    searchKeywords?: string[];
};

function normalizePartSearch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim();
}

function productMatchesPartSearch(product: PartSearchProduct, normalizedQuery: string): boolean {
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return false;

    const haystack = normalizePartSearch([
        product.name,
        product.code,
        product.sku,
        product.productCode,
        product.barcode,
        ...(product.qrCodes || []),
        product.brand,
        product.model,
        product.partType,
        product.category,
        ...(product.categoryIds || []),
        ...(product.searchKeywords || []),
    ].filter(Boolean).join(' '));

    return terms.every(term => haystack.includes(term));
}

export default function TechnicianPage() {
    const { user } = useAuth();
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
    const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [statusConfirmModal, setStatusConfirmModal] = useState<TechnicianStatusModal | null>(null);
    const [isStatusChanging, setIsStatusChanging] = useState(false);

    const [noteModalPayload, setNoteModalPayload] = useState<TechnicianNoteModal | null>(null);
    const [techNoteText, setTechNoteText] = useState('');

    const [partsVerificationModalPayload, setPartsVerificationModalPayload] = useState<TechnicianPartsVerificationModal | null>(null);
    const [partsVerificationSelections, setPartsVerificationSelections] = useState<Record<string, TechnicianPartVerificationSelection>>({});
    const [isPartsVerifying, setIsPartsVerifying] = useState(false);

    const [partSearchQuery, setPartSearchQuery] = useState('');
    const [partSearchResults, setPartSearchResults] = useState<Product[]>([]);
    const [isSearchingParts, setIsSearchingParts] = useState(false);
    const [selectedPartQuality, setSelectedPartQuality] = useState('Zin');
    const [customPartName, setCustomPartName] = useState('');

    const [dynamicStatuses, setDynamicStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);
    const [statusConfigLoaded, setStatusConfigLoaded] = useState(false);
    const [technicians, setTechnicians] = useState<{ uid: string; displayName: string }[]>([]);
    const [userNamesMap, setUserNamesMap] = useState<Record<string, string>>({});
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
        const timer = setTimeout(async () => {
            setIsSearchingParts(true);
            try {
                const normalizedQ = normalizePartSearch(partSearchQuery);

                if (!normalizedQ) {
                    setPartSearchResults([]);
                    return;
                }

                const snap = await getDocs(query(
                    collection(db, 'products'),
                    where('status', '==', 'active'),
                    where('searchKeywords', 'array-contains', normalizedQ),
                    limit(20)
                ));

                const results = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as Product))
                    .filter(p => isPartCategory(p.category, p.categoryIds));

                if (results.length < 10) {
                    const existingIds = new Set(results.map(p => p.id));
                    const fallbackSnap = await getDocs(query(
                        collection(db, 'products'),
                        where('status', '==', 'active'),
                        limit(300)
                    ));

                    fallbackSnap.docs
                        .map(d => ({ id: d.id, ...d.data() } as Product))
                        .filter(p => !existingIds.has(p.id))
                        .filter(p => isPartCategory(p.category, p.categoryIds))
                        .filter(p => productMatchesPartSearch(p, normalizedQ))
                        .forEach(p => results.push(p));
                }

                setPartSearchResults(results.slice(0, 10));
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearchingParts(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [partSearchQuery]);

    const handleAddPart = async (ticket: RepairTicket, product: Product) => {
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

    const handleRequestPart = async (ticket: RepairTicket, product: Product) => {
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

    const handleAddCustomPart = async (ticket: RepairTicket) => {
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
        if (!confirm('Bạn có chắc chắn muốn xóa linh kiện này khỏi phiếu?')) return;
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

    useEffect(() => {
        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setDynamicStatuses(normalizeRepairWorkflow(data.repairStatuses));
                setWarrantyStatuses(normalizeWarrantyWorkflow(data.warrantyStatuses));
            }
            setStatusConfigLoaded(true);
        });

        return () => unsubStatuses();
    }, []);

    useEffect(() => {
        if (!statusConfigLoaded) return;

        const statusIds = getTechnicianQueryableStatusIds(dynamicStatuses, warrantyStatuses);
        if (statusIds.length === 0 && dynamicStatuses.length + warrantyStatuses.length > 0) {
            setTickets([]);
            setLoading(false);
            return;
        }

        const ticketQuery = statusIds.length > 0 && statusIds.length <= 30
            ? query(collection(db, 'repairs'), where('status', 'in', statusIds), limit(100))
            : query(collection(db, 'repairs'), orderBy('createdAt', 'desc'), limit(100));

        const unsubTickets = onSnapshot(ticketQuery, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as RepairTicket[];
            setTickets(sortTicketsByCreatedAtDesc(data));
            setLoading(false);
        }, (error) => {
            console.error('Technician repairs listener error:', error);
            setLoading(false);
        });

        return () => unsubTickets();
    }, [dynamicStatuses, statusConfigLoaded, warrantyStatuses]);

    useEffect(() => {
        getDocs(query(collection(db, 'users'), where('role', '==', 'staff')))
            .then(snap => setTechnicians(snap.docs
                .filter(item => Array.isArray(item.data().permissions) && item.data().permissions.includes('manage_repairs'))
                .map(item => ({ uid: item.id, displayName: item.data().displayName || 'Kỹ thuật viên' }))))
            .catch(error => console.error('Load technicians error:', error));

        getDocs(collection(db, 'users'))
            .then(snap => {
                const map: Record<string, string> = {};
                snap.docs.forEach(doc => {
                    if (doc.data().displayName) map[doc.id] = doc.data().displayName;
                });
                setUserNamesMap(map);
            })
            .catch(error => console.error('Load users map error:', error));
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
            if (isRepairStatus(newStatus, REPAIR_STATUS.CUSTOMER_HANDOVER) || isTechnicianHandoffStatus(targetCfg)) {
                const selectedParts = (ticket.parts || []).filter(p => isSelectedRepairPart(p));
                if (selectedParts.length > 0) {
                    setPartsVerificationModalPayload({ ticketId, newStatus });
                    const initSelections: Record<string, 'use' | 'return'> = {};
                    selectedParts.forEach(p => initSelections[p.partLineId!] = 'use');
                    setPartsVerificationSelections(initSelections);
                    return;
                }
            }

            if (isRepairStatus(ticket.status, REPAIR_STATUS.INSPECTION) && newStatus !== REPAIR_STATUS.INSPECTION) {
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

            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());

            const rejectCommands = Object.entries(partsVerificationSelections)
                .filter(([, action]) => action === 'return')
                .map(([partLineId]) => ({
                    type: 'reject_request',
                    partLineId
                }));

            if (rejectCommands.length > 0) {
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
                        commands: rejectCommands
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Lỗi trả linh kiện Test');

                ticket.version = (ticket.version || 0) + 1;
            }

            await finalizeStatusChange(ticket, partsVerificationModalPayload.newStatus);
            setPartsVerificationModalPayload(null);
            setPartsVerificationSelections({});
        } catch (err: unknown) {
            toastError((err as Error)?.message || 'Lỗi xử lý xác nhận linh kiện');
        } finally {
            setIsPartsVerifying(false);
        }
    };

    const handleStatusChange = async (ticketId: string, newStatus: string) => {
        const ticket = tickets.find(t => t.id === ticketId);
        if (!ticket) return;
        const workflow = getWorkflowForTicket(ticket);
        const currentCfg = workflow.find(s => s.id === ticket.status);
        if (currentCfg?.isTerminal) {
            toastError('Phiếu đã đóng, không thể thay đổi trạng thái!');
            return;
        }

        setStatusConfirmModal({ ticketId, newStatus: String(newStatus) });
    };

    const finalizeStatusChange = async (ticket: RepairTicket, newStatus: string, newTechNote?: string) => {
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
                    source: 'technician'
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật trạng thái');

            toastSuccess('Cập nhật trạng thái thành công.');
            if (selectedTicket?.id === ticket.id) {
                setSelectedTicket({ ...ticket, status: newStatus, version: (ticket.version || 0) + 1 });
            }
        } catch (err: unknown) {
            console.error('Status update error:', err);
            toastError((err as Error)?.message || 'Lỗi khi cập nhật trạng thái.');
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
        if (!ticket.pendingTechnicianTransfer || !confirm('Hủy yêu cầu chuyển KTV đang chờ?')) return;
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



    const handleChecklistUpdate = async (ticketId: string, key: string, newValue: string) => {
        try {
            await updateDoc(doc(db, 'repairs', ticketId), {
                [`deviceInfo.checklist.${key}`]: newValue,
                updatedAt: serverTimestamp(),
            });
        } catch (err) {
            console.error('Checklist update error:', err);
        }
    };

    const handleHistoryToggle = async (ticketId: string, key: string, currentValue: boolean) => {
        try {
            await updateDoc(doc(db, 'repairs', ticketId), {
                [`deviceInfo.checklist.${key}`]: !currentValue,
                updatedAt: serverTimestamp(),
            });
        } catch (err) {
            console.error('History toggle error:', err);
        }
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
                activeRepairCount={tickets.filter(ticket => ticket.status === 'dang_sua_chua').length}
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
                        const isAssignedToMe = ticket.staff?.assignedTechnician === user?.uid;
                        const isIncomingTransferToMe = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                        const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                        const isReadOnly = isTerminal || isKtvLocked;
                        const pendingTransfer = ticket.pendingTechnicianTransfer?.status === 'pending'
                            ? ticket.pendingTechnicianTransfer
                            : null;
                        const actionWarnings = [
                            currentCfg?.allowedFeatures?.includes('requireChecklist') && !isChecklistComplete(ticket.deviceInfo?.checklist as Record<string, unknown> | undefined)
                                ? 'Hoàn thành checklist kiểm tra' : null,
                            currentCfg?.allowedFeatures?.includes('requireTechnicianNote') && !ticket.issue?.notes?.trim()
                                ? 'Nhập kết quả kiểm tra kỹ thuật' : null,
                            currentCfg?.allowedFeatures?.includes('allowPartsSelection') && (!ticket.parts || ticket.parts.length === 0)
                                ? 'Xác nhận ca sửa có cần linh kiện' : null,
                            currentCfg?.allowedFeatures?.includes('requirePartsReady') && !areAllPartsReady(ticket)
                                ? 'Chờ linh kiện sẵn sàng' : null,
                        ].filter((item): item is string => Boolean(item));
                        const canRequestTransfer = !isTerminal && !pendingTransfer && (isAssignedToMe || isRepairManager(user));

                        return (
                            <div
                                key={ticket.id}
                                className="bg-white rounded-lg border p-3 sm:p-4 hover:shadow-md transition-shadow relative"
                                title="Xem chi tiết"
                                onClick={() => setSelectedTicket(ticket)}
                            >
                                <div className="absolute top-2 right-2 flex items-center gap-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2 py-0.5 text-[10px] font-medium max-w-[140px]">
                                    <UserIcon size={10} className="flex-shrink-0" />
                                    <span className="truncate">{ticket.staff?.assignedTechnicianName || 'Chưa phân công'}</span>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 mt-4">
                                    <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center flex-shrink-0">
                                        <Smartphone size={20} className="text-gray-600" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p title="Máy" className="font-bold text-gray-900 text-lg sm:text-xl">{ticket.deviceInfo?.model || 'Thiết bị'}</p>
                                            <span className={`text-sm font-medium px-2.5 py-1 rounded-full border ${st.color}`}>
                                                {st.label}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1.5 flex items-center gap-1">
                                            <span title="Mã phiếu">#{ticket.id.slice(-6).toUpperCase()}</span>
                                            {ticket.ticketType === 'warranty' && (
                                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-bold">BH</span>
                                            )}
                                            <span title="Khách hàng">• {ticket.customer?.name}</span>
                                        </div>
                                        {ticket.issues && ticket.issues.length > 0 ? (
                                            <p title="Vấn đề" className="text-base sm:text-lg text-gray-700 mt-2 line-clamp-2">{ticket.issues.map(i => i.label).join(', ')}</p>
                                        ) : ticket.issue?.description && (
                                            <p className="text-base sm:text-lg text-gray-700 mt-2 line-clamp-2">{ticket.issue.description}</p>
                                        )}

                                        {(pendingTransfer || actionWarnings.length > 0) && (
                                            <div className="mt-3 space-y-2">
                                                {pendingTransfer && (
                                                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                                                        <p className="font-semibold flex items-center gap-2"><ArrowRightLeft size={16} /> Chờ {pendingTransfer.toTechnicianName} tiếp nhận</p>
                                                        <p className="mt-1 text-xs">Lý do: {pendingTransfer.reason || 'Không có lý do'}</p>
                                                        <p className="mt-1 text-xs text-blue-700">Người đề nghị: {pendingTransfer.requestedByName || pendingTransfer.requestedBy}</p>
                                                    </div>
                                                )}
                                                {actionWarnings.length > 0 && (
                                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                                        <p className="text-xs font-bold uppercase text-amber-800 flex items-center gap-1"><ShieldAlert size={14} /> Cần xử lý ở bước này</p>
                                                        <ul className="mt-1 space-y-1 text-sm text-amber-900">
                                                            {actionWarnings.map(item => <li key={item}>• {item}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {st?.allowedFeatures?.includes('allowPartsSelection') && (
                                            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                                                <span className="text-[10px] font-semibold text-gray-500 uppercase">Linh kiện:</span>
                                                {(!ticket.parts || ticket.parts.length === 0) && (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                                                        Chưa chọn linh kiện
                                                    </span>
                                                )}
                                                {ticket.parts && ticket.parts.length > 0 && (() => {
                                                    const maxShow = 3;
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

                                        {st?.allowedFeatures?.includes('requireChecklist') && (
                                            <div className="mt-3 border-t pt-3">
                                                <p className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1"><CheckCircle2 size={14} /> Checklist kiểm tra</p>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    {Object.keys(checklistLabels).map(key => {
                                                        const val = (ticket.deviceInfo?.checklist as Record<string, string> | undefined)?.[key] || '';
                                                        return (
                                                            <div key={key} className="flex flex-col">
                                                                <label className="text-base text-gray-600 mb-1 truncate">{checklistLabels[key]}</label>
                                                                <select
                                                                    value={val}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => handleChecklistUpdate(ticket.id, key, e.target.value)}
                                                                    disabled={isReadOnly}
                                                                    aria-label={`Checklist: ${checklistLabels[key]}`}
                                                                    title={`Checklist: ${checklistLabels[key]}`}
                                                                    className={`min-h-[56px] text-xl sm:text-2xl px-3 py-3 rounded-xl border cursor-pointer transition-all appearance-none text-center font-bold ${val === 'OK' ? 'bg-green-50 border-green-300 text-green-700' :
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
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {(['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts'] as const).map(key => {
                                                        const labels: Record<string, string> = { hasPriorRepair: 'Đã từng sửa', hasWaterDamage: 'Vào nước', hasNonGenuineParts: 'Kém/Lô' };
                                                        const val = !!(ticket.deviceInfo?.checklist as Record<string, boolean> | undefined)?.[key];
                                                        return (
                                                            <button key={key} onClick={(e) => { e.stopPropagation(); if (!isReadOnly) handleHistoryToggle(ticket.id, key, val); }}
                                                                disabled={isReadOnly}
                                                                className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${val ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold' : 'bg-gray-50 border-gray-200 text-gray-500'
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

                                    <div className="grid grid-cols-2 gap-2 w-full sm:w-56 sm:flex sm:flex-col flex-shrink-0 mt-3 sm:mt-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }}
                                            className="min-h-12 px-3 py-2 border border-gray-200 bg-white rounded-xl transition-colors flex items-center justify-center gap-2 text-base font-bold hover:bg-gray-50" title="Xem chi tiết"
                                        >
                                            <Eye size={20} className="text-gray-500" /> Chi tiết
                                        </button>

                                        {canRequestTransfer && (
                                            <button
                                                onClick={(event) => { event.stopPropagation(); setTransferModal({ ticket }); setTransferTechnicianId(''); setTransferReason(''); }}
                                                className="min-h-12 px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center gap-2 text-base font-bold hover:bg-blue-100"
                                            >
                                                <ArrowRightLeft size={20} /> Chuyển KTV
                                            </button>
                                        )}

                                        {pendingTransfer && (pendingTransfer.requestedBy === user?.uid || isRepairManager(user)) && (
                                            <button
                                                onClick={(event) => { event.stopPropagation(); handleTransferCancel(ticket); }}
                                                className="min-h-12 px-3 py-2 border border-red-200 bg-red-50 text-red-700 rounded-xl flex items-center justify-center gap-2 text-base font-bold hover:bg-red-100"
                                            >
                                                <X size={20} /> Hủy chuyển
                                            </button>
                                        )}

                                        {(() => {
                                            const isIncomingTransfer = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                                            if (isIncomingTransfer) {
                                                return (
                                                    <>
                                                        <button onClick={(e) => { e.stopPropagation(); handleTransferResponse(ticket, 'accepted'); }}
                                                            className="min-h-11 text-sm px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 w-full hover:bg-emerald-100">
                                                            <CheckCircle2 size={12} /> Nhận phiếu
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleTransferResponse(ticket, 'rejected'); }}
                                                            className="min-h-11 text-sm px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 w-full hover:bg-red-100">
                                                            <X size={12} /> Từ chối
                                                        </button>
                                                    </>
                                                );
                                            }

                                            return (
                                                <>
                                                    {(() => {
                                                        if (isReadOnly) return null;

                                                        const hasRequestedParts = ticket.parts?.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED) || isRepairPartStatus(p.status, REPAIR_PART_STATUS.ORDERED));
                                                        const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';

                                                        const useDynamic = st?.allowedFeatures?.includes('allowPartsSelection') && ticket.status !== targetStatusId;

                                                        if (useDynamic) {
                                                            const targetStatus = workflow.find(ds => ds.id === targetStatusId);
                                                            if (!targetStatus) return null;
                                                            return (
                                                                <button onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, targetStatus.id); }}
                                                                    className={`col-span-2 min-h-12 w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold text-base shadow-md hover:shadow-orange-500/25 active:scale-[0.98] transition-all flex items-center gap-2 justify-center`}>
                                                                    Chuyển → {hasRequestedParts ? 'Tìm linh kiện' : targetStatus.label}
                                                                </button>
                                                            );
                                                        }

                                                        if (st?.allowedNext && st.allowedNext.length > 0) {
                                                            return st.allowedNext.map((nextId: string) => {
                                                                const nextCfg = workflow.find(ds => ds.id === nextId);
                                                                if (!nextCfg) return null;
                                                                return (
                                                                    <button key={nextId} onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, nextId); }}
                                                                        className={`col-span-2 min-h-12 w-full py-3 text-white rounded-xl font-bold text-base shadow-md active:scale-[0.98] transition-all flex items-center gap-2 justify-center ${nextId === 'refund' ? 'bg-red-500 hover:bg-red-600' : nextId === 'out' ? 'bg-gray-700 hover:bg-gray-800' : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'}`}>
                                                                        Chuyển → {nextCfg.label}
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
                            </div>
                        );
                    })}
                </div>
            )}

            {viewMode === 'kanban' && (
                <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
                    {Array.from(new Map(
                        [...dynamicStatuses, ...warrantyStatuses]
                            .filter(s => !s.isTerminal && !isTechnicianHandoffStatus(s) && s.id !== 'cho_tiep_nhan' && s.id !== 'bh_tiep_nhan')
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
                                        const isAssignedToMe = ticket.staff?.assignedTechnician === user?.uid;
                                        const isIncomingTransferToMe = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                                        const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                                        const isReadOnly = isTerminal || isKtvLocked;

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
                                                {ticket.issues && ticket.issues.length > 0 ? (
                                                    <p className="text-sm text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-2 rounded">{ticket.issues.map(i => i.label).join(', ')}</p>
                                                ) : ticket.issue?.description && (
                                                    <p className="text-sm text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-2 rounded">{ticket.issue.description}</p>
                                                )}

                                                {st?.allowedFeatures?.includes('requireChecklist') && (
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
                                                                            onChange={e => handleChecklistUpdate(ticket.id, key, e.target.value)}
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
                                                                const hasRequestedParts = ticket.parts && ticket.parts.length > 0 && ticket.parts.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED));
                                                                const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';

                                                                const useDynamic = st?.allowedFeatures?.includes('allowPartsSelection') && ticket.status !== targetStatusId;

                                                                if (useDynamic) {
                                                                    const targetStatus = workflow.find(ds => ds.id === targetStatusId);
                                                                    if (!targetStatus) return null;
                                                                    return (
                                                                        <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                                            <button onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, targetStatus.id); }}
                                                                                className={`w-full justify-center flex items-center gap-2 text-sm px-4 py-3 rounded-xl font-bold transition-all bg-orange-500 text-white hover:bg-orange-600 shadow-md`}>
                                                                                Chuyển → {hasRequestedParts ? 'Tìm linh kiện' : targetStatus.label}
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (st?.allowedNext && st.allowedNext.length > 0) {
                                                                    return (
                                                                        <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                                            {st?.allowedNext?.map((nextId: string) => {
                                                                                const nextCfg = workflow.find(ds => ds.id === nextId);
                                                                                if (!nextCfg) return null;
                                                                                return (
                                                                                    <button key={nextId} onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, nextId); }}
                                                                                        className={`w-full justify-center flex items-center gap-2 text-sm px-4 py-3 rounded-xl font-bold transition-all shadow-md ${nextId === 'refund' ? 'bg-red-500 text-white hover:bg-red-600' : nextId === 'out' ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
                                                                                        Chuyển → {nextCfg.label}
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

            <TechnicianTicketDetailModal
                selectedTicket={selectedTicket}
                setSelectedTicket={setSelectedTicket}
                user={user}
                userNamesMap={userNamesMap}
                partSearchQuery={partSearchQuery}
                setPartSearchQuery={setPartSearchQuery}
                partSearchResults={partSearchResults}
                isSearchingParts={isSearchingParts}
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
                handleAddPart={handleAddPart}
                handleRequestPart={handleRequestPart}
                handleAddCustomPart={handleAddCustomPart}
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
                    try {
                        setIsStatusChanging(true);
                        setStatusConfirmModal(null);
                        await executeStatusChange(ticketId, newStatus);
                    } finally {
                        setIsStatusChanging(false);
                    }
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
