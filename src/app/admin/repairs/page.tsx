'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Wrench, Printer,
    CheckCircle2, Clock, Smartphone, User, FileText,
    ArrowRight,
    Loader2, Eye, Camera,
    Ban, RotateCcw, AlertCircle, Package
} from 'lucide-react';
import {
    collection, query, where, getDocs, updateDoc,
    doc, serverTimestamp, orderBy, deleteDoc, onSnapshot, Timestamp, getDoc,
    limit, startAfter, DocumentSnapshot, runTransaction
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import type { RepairTicket, RepairStatus, PaymentStatus, DeviceChecklist, WorkflowNode, RepairIssue } from '@/lib/types';
import { uploadMedia } from '@/lib/storage';
import { isChecklistComplete, isYouTubeUrl, areAllPartsReady } from '@/lib/workflowFeatures';
import { REPAIR_STATUS, isPendingRepairPart, isRepairStatus, isWarrantyEligibleRepairPart } from '@/lib/repairStatus';
import { normalizeVietnamPhone } from '@/lib/phone';
import type { ReceiptConfig } from '@/components/admin/PrintableReceipt';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
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
import { RepairPaginationFooter } from '@/features/repairs/RepairPaginationFooter';
import { RepairMediaManagers } from '@/features/repairs/RepairMediaManagers';
const paymentLabels: Record<PaymentStatus, { label: string; color: string }> = {
    unpaid: { label: 'Chưa thanh toán', color: 'text-red-600 bg-red-50' },
    deposit: { label: 'Đã đặt cọc', color: 'text-yellow-600 bg-yellow-50' },
    paid: { label: 'Đã thanh toán', color: 'text-green-600 bg-green-50' },
    pay_later: { label: 'Thanh toán sau', color: 'text-purple-600 bg-purple-50' },
    refunded: { label: 'Đã hoàn tiền', color: 'text-orange-600 bg-orange-50' },
    warranty: { label: 'Bảo hành', color: 'text-blue-600 bg-blue-50' },
};
const formatPrice = formatRepairPrice;

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
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [techFilter, setTechFilter] = useState<string>('all');
    const [ticketTypeFilter, setTicketTypeFilter] = useState<'all' | 'repair' | 'warranty'>('all');
    const [showModal, setShowModal] = useState(false);
    const [editingTicket, setEditingTicket] = useState<RepairTicket | null>(null);
    const [printMode, setPrintMode] = useState<'receipt' | 'invoice' | 'warranty' | null>(null);
    const [printTicket, setPrintTicket] = useState<RepairTicket | null>(null);

    const [noteModal, setNoteModal] = useState<{ ticket: RepairTicket; targetStatus: RepairStatus } | null>(null);
    const [deliveryNote, setDeliveryNote] = useState('');
    const [posRedirectModal, setPosRedirectModal] = useState<{ ticket: RepairTicket } | null>(null);
    const [handoverModal, setHandoverModal] = useState<{ ticket: RepairTicket; action: 'out' | 'refund', targetStatus?: string } | null>(null);
    const [handoverNote, setHandoverNote] = useState('');
    const [paymentConfirmed, setPaymentConfirmed] = useState(false);
    const [handoverAdditionalFees, setHandoverAdditionalFees] = useState<string>('');
    const [handoverLaborCost, setHandoverLaborCost] = useState<string>('');
    const [viewingTicket, setViewingTicket] = useState<RepairTicket | null>(null);
    const [warrantyModal, setWarrantyModal] = useState<RepairTicket | null>(null);
    const [warrantyHistory, setWarrantyHistory] = useState<RepairTicket[]>([]);
    const [warrantySelectedIndexes, setWarrantySelectedIndexes] = useState<number[]>([]);
    const [warrantyCreating, setWarrantyCreating] = useState(false);
    const [assignModal, setAssignModal] = useState<{ ticket: RepairTicket } | null>(null);
    const [assignTechnicianId, setAssignTechnicianId] = useState('');
    const [managerOverrideModal, setManagerOverrideModal] = useState<{ ticket: RepairTicket; targetStatus: string } | null>(null);
    const [managerOverrideNote, setManagerOverrideNote] = useState('');

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
    const emptyForm: RepairEditorFormData = {
        appointmentId: '',
        customerName: '',
        customerPhone: '',
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
        issueDescription: '',
        techNotes: '',
        issues: [] as RepairIssue[],
        partsCost: '' as string | number,
        laborCost: '' as string | number,
        depositAmount: '' as string | number,
        paymentStatus: 'unpaid' as PaymentStatus,
        technicianId: '',
        status: REPAIR_STATUS.INTAKE as RepairStatus,
        estimatedReturnDate: '',
        selectedServiceName: '',
        selectedCategoryPath: [] as string[],
    };
    const [formData, setFormData] = useState(emptyForm);

    useEffect(() => {
        const phone = formData.customerPhone.trim();
        if (phone.length >= 10 && !editingTicket && showModal) {
            const fetchCustomer = async () => {
                try {
                    const snap = await getDoc(doc(db, 'customers', phone));
                    if (snap.exists()) {
                        const fetchedName = snap.data().name || snap.data().displayName || '';
                        if (fetchedName) {
                            setFormData(p => {
                                if (!p.customerName) {
                                    return { ...p, customerName: fetchedName };
                                }
                                return p;
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

    const [dynamicStatuses, setDynamicStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);
    const [, setStatusLoading] = useState(true);
    const getWorkflowForTicket = (ticket: RepairTicket): WorkflowNode[] => {
        return ticket.ticketType === 'warranty' ? warrantyStatuses : dynamicStatuses;
    };

    const getWarrantyTypeForTicket = (ticket: RepairTicket): WarrantyPrintType | null => {
        const categoryPath = ticket.categoryPath || [];
        if (categoryPath.length === 0) return null;

        const taxonomyRoots = [
            ...(config.taxonomy?.service || []),
            ...(config.taxonomy?.retail || []),
            ...(config.taxonomy?.component || []),
        ];

        return resolveWarrantyTypeFromPath(taxonomyRoots, categoryPath);
    };

    const getWarrantyConfigForType = (type: WarrantyPrintType | null): WarrantyTemplateConfig | undefined => {
        return type && receiptConfig ? receiptConfig[type] : undefined;
    };
    useEffect(() => {
        const q = query(collection(db, 'repairs'), orderBy('createdAt', 'desc'), limit(50));
        const unsubTickets = onSnapshot(q, (snap) => {
            setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket)));
            setLastDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === 50);
            setLoading(false);
        }, (err) => {
            console.error('Repairs listener error:', err);
            setLoading(false);
        });
        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setDynamicStatuses(data.repairStatuses ?? data.statuses ?? []);
                setWarrantyStatuses(data.warrantyStatuses ?? []);
            }
            setStatusLoading(false);
        });
        getDoc(doc(db, 'system_config', 'receipt')).then(snap => {
            if (snap.exists()) setReceiptConfig(snap.data() as ReceiptConfig);
        }).catch(console.error);
        return () => {
            unsubTickets();
            unsubStatuses();
        };
    }, []);
    const loadMoreData = async () => {
        if (!lastDoc || !hasMore) return;
        setLoading(true);
        const q = query(collection(db, 'repairs'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(50));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket));
            setTickets(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newItems = data.filter(d => !existingIds.has(d.id));
                return [...prev, ...newItems];
            });
            setLastDoc(snap.docs[snap.docs.length - 1]);
            setHasMore(snap.docs.length === 50);
        } else {
            setHasMore(false);
        }
        setLoading(false);
    };
    const searchInDatabase = async () => {
        if (!searchTerm.trim()) {
            toastWarning('Vui lòng nhập số điện thoại, IMEI hoặc mã phiếu để tìm trên máy chủ.');
            return;
        }
        setIsSearchingDB(true);
        try {
            const s = searchTerm.trim();
            const queries = [
                getDocs(query(collection(db, 'repairs'), where('customer.phone', '==', s))),
                getDocs(query(collection(db, 'repairs'), where('deviceInfo.imei', '==', s)))
            ];
            const snaps = await Promise.all(queries);
            let combined: RepairTicket[] = [];

            snaps.forEach(snap => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket));
                combined = [...combined, ...data];
            });

            try {
                const docSnap = await getDoc(doc(db, 'repairs', s));
                if (docSnap.exists()) {
                    combined.push({ id: docSnap.id, ...docSnap.data() } as RepairTicket);
                }
            } catch {
            }

            if (combined.length > 0) {
                setTickets(prev => {
                    const map = new Map(prev.map(p => [p.id, p]));
                    combined.forEach(c => map.set(c.id, c));
                    return Array.from(map.values()).sort((a, b) => {
                        const tA = (a.createdAt as unknown as Timestamp)?.toMillis?.() || 0;
                        const tB = (b.createdAt as unknown as Timestamp)?.toMillis?.() || 0;
                        return tB - tA;
                    });
                });
                toastSuccess('Đã tìm thấy dữ liệu trên máy chủ!');
            } else {
                toastWarning('Không tìm thấy dữ liệu trên máy chủ!');
            }
        } catch (e) {
            console.error('Lỗi tìm kiếm DB', e);
            toastError('Lỗi tìm kiếm!');
        }
        setIsSearchingDB(false);
    };
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'admin'])));
                setStaffs(snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName || 'N/A' })));
            } catch (e) { console.error(e); }
        })();
    }, []);
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'services'), orderBy('createdAt', 'desc')));
                setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) { console.error(e); }
        })();
    }, []);
    useEffect(() => {
        const appointmentId = searchParams.get('appointmentId');
        if (!appointmentId || services.length === 0) return;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'appointments', appointmentId));
                if (!snap.exists()) return;
                const app = { id: snap.id, ...snap.data() } as Appointment;
                setFormData(prev => {
                    const updated = {
                        ...prev,
                        appointmentId: app.id,
                        customerName: app.fullName,
                        customerPhone: app.phone,
                        technicianId: user?.uid || prev.technicianId,
                        selectedServiceName: '',
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
                setShowModal(true);
            } catch (e) {
                console.error('Error auto-filling from appointment:', e);
            }
        })();
    }, [searchParams, services, user?.uid]);
    const isTerminal = (ticket: RepairTicket) => {
        const workflow = getWorkflowForTicket(ticket);
        return workflow.find(s => s.id === ticket.status)?.isTerminal ?? false;
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
            t.customer.phone.includes(s) ||
            t.deviceInfo?.imei?.includes(s) ||
            t.deviceInfo?.model?.toLowerCase().includes(s);
        const matchStatus = statusFilter === 'all' || t.status === statusFilter;
        const matchTech = techFilter === 'all' || t.staff?.assignedTechnician === techFilter;
        const matchType = ticketTypeFilter === 'all' || (ticketTypeFilter === 'warranty' ? t.ticketType === 'warranty' : t.ticketType !== 'warranty');
        return matchSearch && matchStatus && matchTech && matchType;
    });
    const { paginatedData: paginatedTickets, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filtered, 20);
    useEffect(() => { resetPage(); }, [searchTerm, statusFilter, techFilter, ticketTypeFilter, resetPage]);
    const handleQuickStatus = async (ticket: RepairTicket, nextStatus: string) => {
        const workflow = getWorkflowForTicket(ticket);
        const currentCfg = workflow.find(s => s.id === ticket.status);
        if (currentCfg?.isTerminal) {
            toastError('Phiếu đã đóng, không thể thay đổi trạng thái!');
            return;
        }
        if (isRepairStatus(ticket.status, REPAIR_STATUS.INSPECTION) && nextStatus !== REPAIR_STATUS.INSPECTION) {
            if (!ticket.issue?.notes || ticket.issue.notes.trim().length === 0) {
                toastError('Vui lòng nhập ghi chú kỹ thuật (mục "Ghi chú kỹ thuật") trước khi chuyển trạng thái tiếp theo.');
                return;
            }
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
        if (currentCfg?.allowedFeatures?.includes('requirePaymentGate')) {
            const defaultLaborCost = ticket.payment?.laborCost !== undefined
                ? ticket.payment.laborCost
                : Math.max(0, (ticket.issues || []).reduce((sum, i) => sum + (Number(i.estimatedPrice) || 0), 0) - (Number(ticket.payment?.partsCost) || 0));
            if (nextStatus === 'refund') {
                setHandoverLaborCost(defaultLaborCost.toString() || '');
                setHandoverModal({ ticket, action: 'refund', targetStatus: nextStatus });
                return;
            } else if (nextStatus === 'out') {
                setHandoverLaborCost(defaultLaborCost.toString() || '');
                setHandoverModal({ ticket, action: 'out', targetStatus: nextStatus });
                return;
            } else {
                setPosRedirectModal({ ticket });
                return;
            }
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
        const nextCfg = workflow.find(s => s.id === nextStatus);
        if (nextCfg?.allowedFeatures?.includes('requireAssignedTechnician') && !ticket.staff?.assignedTechnician) {
            toastError('Cần phân công Kỹ thuật viên trước khi thực hiện bước này!');
            setAssignModal({ ticket });
            return;
        }

        if (ticket.staff?.assignedTechnician) {
            const isAssignedKTV = ticket.staff.assignedTechnician === user?.uid;
            const isManager = user?.role === 'admin' || user?.permissions?.includes('manage_staff') || user?.permissions?.includes('manage_settings');

            if (!isAssignedKTV) {
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
        if (claimedPartIndexes.length === 0) {
            toastWarning('Vui lòng chọn ít nhất 1 linh kiện cần bảo hành.');
            return;
        }
        setWarrantyCreating(true);
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
                setWarrantyCreating(false);
                return;
            }
            const warrantyTicketData = {
                ticketType: 'warranty' as const,
                warrantyClaim: {
                    originalTicketId: originalTicket.id,
                    claimedPartIndexes,
                },
                customer: originalTicket.customer,
                deviceInfo: {
                    model: originalTicket.deviceInfo?.model || '',
                    passcode: '',
                    imei: originalTicket.deviceInfo?.imei || '',
                    color: originalTicket.deviceInfo?.color || '',
                },
                issue: { description: 'Bảo hành linh kiện', notes: '' },
                preRepairMedia: [],
                postRepairMedia: [],
                payment: {
                    status: 'warranty' as const,
                    partsCost: 0,
                    amount: 0,
                    depositAmount: 0,
                },
                staff: {
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || 'Admin',
                    assignedTechnician: '',
                    assignedTechnicianName: '',
                },
                status: warrantyStatuses[0]?.id || 'bh_tiep_nhan',
                statusTimeline: [{ status: warrantyStatuses[0]?.id || 'bh_tiep_nhan', timestamp: Date.now() }],
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
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Lỗi khi tạo phiếu bảo hành');
            }
            toastSuccess('Đã tạo phiếu bảo hành thành công!');
            setWarrantyModal(null);
            setWarrantySelectedIndexes([]);
        } catch (err) {
            console.error('Error creating warranty ticket:', err);
            toastError('Không thể tạo phiếu bảo hành. Vui lòng thử lại.');
        } finally {
            setWarrantyCreating(false);
        }
    };
    const handleOpenModal = (ticket?: RepairTicket) => {
        if (ticket) {
            const cl = ticket.deviceInfo?.checklist;
            setFormData({
                appointmentId: ticket.appointmentId || '',
                customerName: ticket.customer.name,
                customerPhone: ticket.customer.phone,
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
                issueDescription: ticket.issue?.description || '',
                techNotes: ticket.issue?.notes || '',
                issues: ticket.issues && ticket.issues.length > 0
                    ? ticket.issues
                    : ticket.issue?.description
                        ? [{ id: crypto.randomUUID(), label: ticket.issue.description, estimatedPrice: 0, status: 'pending' as const }]
                        : [],
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
            setEditingTicket(null);
            setFormData({ ...emptyForm, technicianId: '' });
            setPreMediaFiles([]);
            setPostMediaFiles([]);
        }
        setShowModal(true);
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.customerPhone) {
            const normalizedPhone = normalizeVietnamPhone(formData.customerPhone);
            if (!normalizedPhone) {
                alert('Số điện thoại không hợp lệ. Vui lòng nhập đúng định dạng số điện thoại Việt Nam.');
                return;
            }
            formData.customerPhone = normalizedPhone.local; // store normalized
        }

        const tech = staffs.find(s => s.uid === formData.technicianId);
        try {
            if (editingTicket) {
                const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
                const paymentRes = await fetch('/api/repairs/payment-edit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        ticketId: editingTicket.id,
                        ticketVersion: editingTicket.version || 0,
                        idempotencyKey: crypto.randomUUID(),
                        paymentData: {
                            deposit: Number(formData.depositAmount) || 0,
                            laborCost: Number(formData.laborCost) || 0,
                        }
                    })
                });

                const paymentDataResp = await paymentRes.json();
                if (!paymentRes.ok) {
                    throw new Error(paymentDataResp.error || 'Lỗi cập nhật chi phí');
                }
                const ticketRef = doc(db, 'repairs', editingTicket.id);
                await runTransaction(db, async (transaction) => {
                    const freshDoc = await transaction.get(ticketRef);
                    if (!freshDoc.exists()) throw new Error('Phiếu sửa chữa không còn tồn tại!');
                    const freshVersion = freshDoc.data()?.version || 0;

                    if (freshVersion > (editingTicket.version || 0) + 1) {
                        throw new Error('Phiếu đã được cập nhật bởi người khác. Vui lòng tải lại trang.');
                    }
                    const updateData = {
                        appointmentId: formData.appointmentId || null,
                        categoryPath: formData.selectedCategoryPath,
                        serviceName: formData.selectedServiceName,
                        customer: { name: formData.customerName, phone: formData.customerPhone },
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
                            } as DeviceChecklist,
                        },
                        preRepairMedia: preMediaFiles,
                        postRepairMedia: postMediaFiles,
                        issue: {
                            description: formData.issues.length > 0
                                ? formData.issues.map(i => i.label).join(' | ')
                                : formData.issueDescription,
                            notes: formData.techNotes
                        },
                        issues: formData.issues.length > 0 ? formData.issues : null,
                        timing: {
                            receivedAt: editingTicket?.timing?.receivedAt || serverTimestamp(),
                            estimatedReturnAt: formData.estimatedReturnDate
                                ? Timestamp.fromDate(new Date(formData.estimatedReturnDate))
                                : null,
                        },
                        staff: {
                            createdBy: editingTicket?.staff?.createdBy || user?.uid || '',
                            createdByName: editingTicket?.staff?.createdByName || user?.displayName || 'Admin',
                            assignedTechnician: formData.technicianId,
                            assignedTechnicianName: tech?.displayName || '',
                        },
                        updatedAt: serverTimestamp(),
                        version: freshVersion + 1,
                    };
                    transaction.update(ticketRef, updateData);
                });
            } else {
                const ticketData: Record<string, unknown> = {
                    appointmentId: formData.appointmentId || null,
                    categoryPath: formData.selectedCategoryPath,
                    serviceName: formData.selectedServiceName,
                    customer: { name: formData.customerName, phone: formData.customerPhone },
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
                        } as DeviceChecklist,
                    },
                    preRepairMedia: preMediaFiles,
                    postRepairMedia: postMediaFiles,
                    statusTimeline: [{ status: formData.status, timestamp: Date.now() }],
                    issue: {
                        description: formData.issues.length > 0
                            ? formData.issues.map(i => i.label).join(' | ')
                            : formData.issueDescription,
                        notes: formData.techNotes
                    },
                    issues: formData.issues.length > 0 ? formData.issues : undefined,
                    timing: {
                        receivedAt: serverTimestamp(),
                        estimatedReturnAt: formData.estimatedReturnDate
                            ? Timestamp.fromDate(new Date(formData.estimatedReturnDate))
                            : null,
                    },
                    payment: {
                        status: formData.paymentStatus,
                        partsCost: Number(formData.partsCost) || 0,
                        laborCost: Number(formData.laborCost) || 0,
                        amount: Number(formData.partsCost) + Number(formData.laborCost) || 0,
                        depositAmount: Number(formData.depositAmount) || 0,
                    },
                    staff: {
                        createdBy: user?.uid || '',
                        createdByName: user?.displayName || 'Admin',
                        assignedTechnician: formData.technicianId,
                        assignedTechnicianName: tech?.displayName || '',
                    },
                    status: formData.status,
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                    version: 1,
                };
                const depositAmt = Number(formData.depositAmount) || 0;
                if (depositAmt > 0) {
                    ticketData.paymentHistory = [{
                        type: depositAmt >= (Number(formData.partsCost) || 0) ? 'full' : 'deposit',
                        amount: depositAmt,
                        timestamp: Date.now(),
                        note: depositAmt >= (Number(formData.partsCost) || 0)
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

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Lỗi khi tạo phiếu sửa chữa');
                }
                if (formData.appointmentId) {
                    await updateDoc(doc(db, 'appointments', formData.appointmentId), {
                        status: 'completed',
                        updatedAt: serverTimestamp(),
                    });
                }
            }

            if (formData.customerPhone) {
                fetch('/api/customers/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formData.customerName,
                        phone: formData.customerPhone,
                        forceUpdateName: true
                    })
                }).catch(err => console.error('Failed to sync customer', err));
            }

            setShowModal(false);
            toastSuccess(editingTicket ? 'Cập nhật thành công!' : 'Tạo phiếu thành công!');
        } catch (err: unknown) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Có lỗi xảy ra!');
        }
    };
    const handleDelete = async (id: string) => {
        if (!confirm('Xóa phiếu này?')) return;
        try { await deleteDoc(doc(db, 'repairs', id)); } catch (e) { console.error(e); }
    };
    const openPrint = (ticket: RepairTicket, mode: 'receipt' | 'invoice' | 'warranty', warrantyType: WarrantyPrintType | null = null) => {
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
            <RepairPageHeader onCreate={() => handleOpenModal()} />
            <RepairStatsGrid stats={stats} />
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
                techFilter={techFilter}
                onTechFilterChange={setTechFilter}
                dynamicStatuses={dynamicStatuses}
                warrantyStatuses={warrantyStatuses}
                staffs={staffs}
            />
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
                <div className="block md:hidden divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                        <div className="px-6 py-12 text-center text-gray-400">
                            <Wrench size={40} className="mx-auto mb-2 opacity-30" />
                            <p>Không có phiếu sửa chữa nào.</p>
                        </div>
                    ) : paginatedTickets.map(ticket => {
                        const workflow = getWorkflowForTicket(ticket);
                        const st = workflow.find(s => s.id === ticket.status) || { id: ticket.status, label: ticket.status, color: 'bg-gray-100 text-gray-700 border-gray-200', allowedNext: [] };
                        const StIcon = Clock; // Fallback
                        const pay = paymentLabels[ticket.payment?.status || 'unpaid'];

                        return (
                            <div key={ticket.id} className={`p-4 space-y-3 bg-white hover:bg-gray-50 transition-colors ${ticket.payment?.status === 'unpaid' ? 'bg-red-50/50' : ''}`}>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-sm font-bold text-gray-900">#{ticket.id.slice(-6).toUpperCase()}</span>
                                            {ticket.ticketType === 'warranty' && (
                                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold">BẢO HÀNH</span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">{ticket.customer.name}</p>
                                        <p className="text-xs text-gray-500">{ticket.customer.phone}</p>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold flex-shrink-0 rounded-full border ${st.color}`}>
                                        <StIcon size={12} /> {st.label}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
                                    <div className="col-span-2 flex items-center gap-1.5">
                                        <Smartphone size={14} className="text-gray-400" />
                                        <span className="font-medium text-sm text-gray-800">{ticket.deviceInfo?.model}</span>
                                    </div>
                                    <div className="col-span-2 pb-1 text-xs text-gray-600 truncate max-w-full italic">
                                        {ticket.issues && ticket.issues.length > 0
                                            ? ticket.issues.map(i => i.label).join(', ')
                                            : ticket.issue?.description}
                                    </div>
                                    {(() => {
                                        const pendingParts = (ticket.parts || []).filter(isPendingRepairPart);
                                        if (pendingParts.length > 0) {
                                            return (
                                                <div className="mt-1 col-span-2 inline-flex w-fit items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-medium border border-orange-200">
                                                    <Package size={10} />
                                                    <span>Chờ {pendingParts.length} linh kiện</span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase font-medium">Thanh toán</p>
                                        <span className={`inline-flex px-1.5 py-0.5 rounded mt-0.5 text-[10px] font-semibold ${pay.color}`}>
                                            {pay.label}
                                        </span>
                                    </div>
                                    <div className="text-right flex flex-col items-end justify-center">
                                        <p className="text-[10px] text-gray-500 uppercase font-medium">KTV</p>
                                        <p className="text-xs font-medium text-gray-700 mt-0.5 truncate">{ticket.staff?.assignedTechnicianName || '—'}</p>
                                        {ticket.pendingTechnicianTransfer?.status === 'pending' && (
                                            <span className="text-[9px] text-orange-600 bg-orange-50 px-1 py-0.5 mt-1 rounded border border-orange-100 flex items-center gap-1 w-max">
                                                <AlertCircle size={8} /> Đang chuyển KTV
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="pt-2 flex flex-col gap-2 border-t border-gray-100">
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        {st?.isTerminal ? (
                                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-semibold border border-gray-200">
                                                🔒 {st.label}
                                            </span>
                                        ) : (
                                            st.allowedNext?.map((nextId: string) => {
                                                const nextCfg = workflow.find(ds => ds.id === nextId);
                                                if (!nextCfg) return null;
                                                let btnClass = 'bg-orange-50 text-orange-700 border-orange-200';
                                                let icon = <ArrowRight size={12} />;
                                                if (nextId === 'refund') { btnClass = 'bg-red-50 text-red-600 border-red-200'; icon = <RotateCcw size={12} />; }
                                                else if (nextId === 'out' || nextId.includes('tra_may_khong_sua')) { btnClass = 'bg-gray-50 text-gray-700 border-gray-200'; icon = <Ban size={12} />; }
                                                else if (nextId === 'done') { btnClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'; icon = <CheckCircle2 size={12} />; }
                                                return (
                                                    <button key={nextId} onClick={() => handleQuickStatus(ticket, nextId)}
                                                        className={`flex whitespace-nowrap items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border ${btnClass}`}>
                                                        {icon} {nextCfg.label}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={() => setViewingTicket(ticket)} className="flex-1 py-2 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg border border-gray-200 flex items-center justify-center gap-1 active:bg-gray-100">
                                            <Eye size={14} /> Chi tiết
                                        </button>
                                        {(!(st?.isTerminal) || canOverrideTerminalStatus) && (
                                            <button onClick={() => handleOpenModal(ticket)} className="flex-1 py-2 bg-orange-50 text-orange-600 text-xs font-medium rounded-lg border border-orange-200 flex items-center justify-center gap-1 active:bg-orange-100">
                                                <Wrench size={14} /> Sửa
                                            </button>
                                        )}
                                        <button onClick={() => setAssignModal({ ticket })} className="flex-1 py-2 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg border border-blue-200 flex items-center justify-center gap-1 active:bg-blue-100">
                                            <User size={14} /> KTV
                                        </button>
                                        {isRepairStatus(ticket.status, REPAIR_STATUS.DONE) && ticket.ticketType !== 'warranty' && (ticket.parts || []).some(p => isWarrantyEligibleRepairPart(p) && p.warrantyMonths && p.warrantyMonths > 0 && p.warrantyExpiresAt && (typeof p.warrantyExpiresAt === 'number' ? p.warrantyExpiresAt : (p.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0) > Date.now()) && (
                                            <button onClick={() => { setWarrantyModal(ticket); setWarrantySelectedIndexes([]); }} className="w-full py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 mt-1">
                                                <AlertCircle size={14} /> Kích hoạt bảo hành
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                        <thead>
                            <tr className="bg-gray-50 border-b text-xs uppercase text-gray-500 font-semibold">
                                <th className="px-4 py-3">Mã</th>
                                <th className="px-4 py-3">Khách hàng</th>
                                <th className="px-4 py-3">Thiết bị</th>
                                <th className="px-4 py-3">Trạng thái</th>
                                <th className="px-4 py-3">Thanh toán</th>
                                <th className="px-4 py-3">KTV</th>
                                <th className="px-4 py-3 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                                        <Wrench size={40} className="mx-auto mb-2 opacity-30" />
                                        Không có phiếu sửa chữa nào.
                                    </td>
                                </tr>
                            ) : paginatedTickets.map(ticket => {
                                const workflow = getWorkflowForTicket(ticket);
                                const st = workflow.find(s => s.id === ticket.status) || { id: ticket.status, label: ticket.status, color: 'bg-gray-100 text-gray-700 border-gray-200', allowedNext: [] };
                                const StIcon = Clock; // Fallback generic icon
                                const pay = paymentLabels[ticket.payment?.status || 'unpaid'];
                                return (
                                    <tr key={ticket.id} className={`hover:bg-gray-50/50 transition-colors ${ticket.payment?.status === 'unpaid' ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <span>#{ticket.id.slice(-6).toUpperCase()}</span>
                                                {ticket.ticketType === 'warranty' && (
                                                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold">BH</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900 text-sm">{ticket.customer.name}</p>
                                            <p className="text-xs text-gray-500">{ticket.customer.phone}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <Smartphone size={14} className="text-gray-400" />
                                                <span className="font-medium text-sm text-gray-900">{ticket.deviceInfo?.model}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 truncate max-w-[180px]">{ticket.issues && ticket.issues.length > 0 ? ticket.issues.map(i => i.label).join(', ') : ticket.issue?.description}</p>
                                            {(() => {
                                                const pendingParts = (ticket.parts || []).filter(isPendingRepairPart);
                                                if (pendingParts.length > 0) {
                                                    return (
                                                        <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-medium border border-orange-200">
                                                            <Package size={10} />
                                                            <span>Chờ {pendingParts.length} linh kiện</span>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.color}`}>
                                                <StIcon size={12} /> {st.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${pay.color}`}>
                                                {pay.label}
                                            </span>
                                            {ticket.payment?.amount > 0 && (
                                                <p className="text-xs text-gray-500 mt-0.5">{formatPrice(ticket.payment.amount)}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-gray-700">{ticket.staff?.assignedTechnicianName || '—'}</p>
                                            {ticket.pendingTechnicianTransfer?.status === 'pending' && (
                                                <span className="text-[9px] text-orange-600 bg-orange-50 px-1 py-0.5 mt-1 rounded border border-orange-100 flex items-center gap-1 w-max">
                                                    <AlertCircle size={8} /> Đang đề nghị chuyển
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1 flex-wrap">
                                                {st?.isTerminal ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[11px] font-semibold border border-gray-200">
                                                        🔒 Đã đóng ({st.label})
                                                    </span>
                                                ) : (
                                                    st.allowedNext?.map((nextId: string) => {
                                                        const nextCfg = workflow.find(ds => ds.id === nextId);
                                                        if (!nextCfg) return null;

                                                        let btnClass = 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200';
                                                        let icon = <ArrowRight size={12} />;
                                                        if (nextId === 'refund') {
                                                            btnClass = 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100';
                                                            icon = <RotateCcw size={12} />;
                                                        } else if (nextId === 'out' || nextId.includes('tra_may_khong_sua')) {
                                                            btnClass = 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
                                                            icon = <Ban size={12} />;
                                                        } else if (nextId === 'done') {
                                                            btnClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
                                                            icon = <CheckCircle2 size={12} />;
                                                        }
                                                        return (
                                                            <button key={nextId} onClick={() => handleQuickStatus(ticket, nextId)}
                                                                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${btnClass}`}
                                                                title={`Chuyển → ${nextCfg.label}`}>
                                                                {icon}
                                                                {nextCfg.label}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                                <button onClick={() => setViewingTicket(ticket)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Xem chi tiết">
                                                    <Eye size={16} />
                                                </button>
                                                <button onClick={() => setAssignModal({ ticket })}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Gán/Chuyển KTV">
                                                    <User size={16} />
                                                </button>
                                                <button onClick={() => openPrint(ticket, 'receipt')}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="In phiếu tiếp nhận">
                                                    <Printer size={16} />
                                                </button>
                                                {isRepairStatus(ticket.status, REPAIR_STATUS.DONE) && (
                                                    <button onClick={() => openPrint(ticket, 'invoice')}
                                                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="In hóa đơn">
                                                        <FileText size={16} />
                                                    </button>
                                                )}
                                                {(() => {
                                                    const warrantyType = getWarrantyTypeForTicket(ticket);
                                                    if (!getWarrantyConfigForType(warrantyType)) return null;
                                                    return (
                                                        <button onClick={() => openPrint(ticket, 'warranty', warrantyType)}
                                                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-colors"
                                                            title="In phiếu bảo hành">
                                                            In BH
                                                        </button>
                                                    );
                                                })()}
                                                {isRepairStatus(ticket.status, REPAIR_STATUS.DONE) && ticket.ticketType !== 'warranty' && (ticket.parts || []).some(p =>
                                                    isWarrantyEligibleRepairPart(p) && p.warrantyMonths && p.warrantyMonths > 0 &&
                                                    p.warrantyExpiresAt && (
                                                        typeof p.warrantyExpiresAt === 'number'
                                                            ? p.warrantyExpiresAt
                                                            : (p.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0
                                                    ) > Date.now()
                                                ) && (
                                                        <button onClick={() => { setWarrantyModal(ticket); setWarrantySelectedIndexes([]); }}
                                                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                                            title="Tạo phiếu bảo hành">
                                                            <AlertCircle size={12} /> Bảo hành
                                                        </button>
                                                    )}
                                                {['done', 'out', 'refund'].includes(ticket.status) && (
                                                    ticket.postRepairMedia?.length > 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-2 py-1 rounded-lg font-semibold flex items-center gap-1">
                                                                <CheckCircle2 size={10} /> {ticket.postRepairMedia.length} media
                                                            </span>
                                                            <label className="cursor-pointer p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Thêm Video/Ảnh">
                                                                <Camera size={14} />
                                                                <input
                                                                    type="file"
                                                                    accept="video/*,image/*"
                                                                    className="hidden"
                                                                    aria-label="Thêm video/ảnh bàn giao"
                                                                    title="Thêm video/ảnh bàn giao"
                                                                    onChange={async (e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (!file) return;
                                                                        try {
                                                                            const url = await uploadMedia(file, 'repairs/handover');
                                                                            const existing = ticket.postRepairMedia || [];
                                                                            await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                                postRepairMedia: [...existing, url],
                                                                                updatedAt: serverTimestamp(),
                                                                            });
                                                                        } catch (err) {
                                                                            console.error('Upload error:', err);
                                                                            toastError('Lỗi upload: ' + (err as Error).message);
                                                                        }
                                                                    }} />
                                                            </label>
                                                            <button
                                                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Dán link YouTube"
                                                                onClick={async () => {
                                                                    const link = prompt('Dán link YouTube tại đây:\n\nVD: https://youtu.be/xxxxx hoặc https://youtube.com/watch?v=xxxxx');
                                                                    if (!link?.trim()) return;
                                                                    if (!isYouTubeUrl(link)) {
                                                                        toastError('Link không hợp lệ. Vui lòng dán link YouTube.');
                                                                        return;
                                                                    }
                                                                    try {
                                                                        const existing = ticket.postRepairMedia || [];
                                                                        await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                            postRepairMedia: [...existing, link.trim()],
                                                                            updatedAt: serverTimestamp(),
                                                                        });
                                                                    } catch (err) {
                                                                        console.error('YouTube link error:', err);
                                                                        toastError('Lỗi: ' + (err as Error).message);
                                                                    }
                                                                }}
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.6 3.5 12 3.5 12 3.5s-7.6 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.8.6 9.4.6 9.4.6s7.6 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" /></svg>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <label className="cursor-pointer p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Upload Video/Ảnh Bàn Giao">
                                                                <Camera size={16} />
                                                                <input
                                                                    type="file"
                                                                    accept="video/*,image/*"
                                                                    className="hidden"
                                                                    aria-label="Upload video/ảnh bàn giao"
                                                                    title="Upload video/ảnh bàn giao"
                                                                    onChange={async (e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (!file) return;
                                                                        try {
                                                                            const url = await uploadMedia(file, 'repairs/handover');
                                                                            const existing = ticket.postRepairMedia || [];
                                                                            await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                                postRepairMedia: [...existing, url],
                                                                                updatedAt: serverTimestamp(),
                                                                            });
                                                                        } catch (err) {
                                                                            console.error('Upload error:', err);
                                                                            toastError('Lỗi upload: ' + (err as Error).message);
                                                                        }
                                                                    }} />
                                                            </label>
                                                            <button
                                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Dán link YouTube (tiết kiệm dung lượng)"
                                                                onClick={async () => {
                                                                    const link = prompt('🎬 Dán link YouTube tại đây:\n\nVD: https://youtu.be/xxxxx hoặc https://youtube.com/watch?v=xxxxx\n\n💡 Sử dụng YouTube tiết kiệm chi phí lưu trữ!');
                                                                    if (!link?.trim()) return;
                                                                    if (!isYouTubeUrl(link)) {
                                                                        toastError('Link không hợp lệ. Vui lòng dán link YouTube.');
                                                                        return;
                                                                    }
                                                                    try {
                                                                        const existing = ticket.postRepairMedia || [];
                                                                        await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                            postRepairMedia: [...existing, link.trim()],
                                                                            updatedAt: serverTimestamp(),
                                                                        });
                                                                    } catch (err) {
                                                                        console.error('YouTube link error:', err);
                                                                        toastError('Lỗi: ' + (err as Error).message);
                                                                    }
                                                                }}
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.6 3.5 12 3.5 12 3.5s-7.6 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.8.6 9.4.6 9.4.6s7.6 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" /></svg>
                                                            </button>
                                                        </div>
                                                    )
                                                )}
                                                {(!(st?.isTerminal) || canOverrideTerminalStatus) && (
                                                    <button onClick={() => handleOpenModal(ticket)}
                                                        className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg" title="Sửa">
                                                        <Wrench size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <RepairPaginationFooter
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalFiltered={totalFiltered}
                    totalAll={tickets.length}
                    hasMore={hasMore}
                    searchTerm={searchTerm}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    onLoadMore={loadMoreData}
                />
            </div>
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
                formData={formData}
                setFormData={setFormData}
                dynamicStatuses={dynamicStatuses}
                canOverrideTerminalStatus={!!canOverrideTerminalStatus}
                staffs={staffs}
                preMediaFiles={preMediaFiles}
                setPreMediaFiles={setPreMediaFiles}
                postMediaFiles={postMediaFiles}
                setPostMediaFiles={setPostMediaFiles}
                setShowPreMediaManager={setShowPreMediaManager}
                setShowPostMediaManager={setShowPostMediaManager}
                paymentLabels={paymentLabels}
                onClose={() => setShowModal(false)}
                onSubmit={handleSubmit}
                onDelete={handleDelete}
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
                setPreMediaFiles={setPreMediaFiles}
                setPostMediaFiles={setPostMediaFiles}
            />
        </div >
    );
}
