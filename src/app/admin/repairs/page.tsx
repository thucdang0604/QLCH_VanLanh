'use client';
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Wrench, Plus, Search, Printer,
    CheckCircle2, Clock, Smartphone, User, FileText,
    Save,
    DollarSign, AlertTriangle, ArrowRight,
    ClipboardList, TrendingUp, Loader2, Eye, Upload, Image as ImageIcon, Video, Camera,
    Ban, RotateCcw, AlertCircle, Package, Trash2
} from 'lucide-react';
import {
    collection, query, where, getDocs, addDoc, updateDoc,
    doc, serverTimestamp, orderBy, deleteDoc, onSnapshot, Timestamp, getDoc,
    limit, startAfter, DocumentSnapshot, runTransaction
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import type { RepairTicket, RepairStatus, PaymentStatus, DeviceChecklist, WorkflowNode, GiftItem, Product, RepairIssue, TaxonomyNode } from '@/lib/types';
import { PART_CATEGORY_LABEL, isPartCategory } from '@/lib/constants';
import { uploadMedia } from '@/lib/storage';
import { isChecklistComplete, isYouTubeUrl, getYouTubeEmbedUrl, areAllPartsReady } from '@/lib/workflowFeatures';
import { REPAIR_STATUS, isPendingRepairPart, isRejectedRepairPart, isRepairStatus, isWarrantyEligibleRepairPart } from '@/lib/repairStatus';
import { normalizeVietnamPhone } from '@/lib/phone';
import PrintableReceipt from '@/components/admin/PrintableReceipt';
import PrintableRepairInvoice from '@/components/admin/PrintableRepairInvoice';
import PrintableWarranty from '@/components/admin/PrintableWarranty';
import type { ReceiptConfig } from '@/components/admin/PrintableReceipt';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import Modal from '@/components/admin/Modal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import MediaManager from '@/components/admin/MediaManager';
import CurrencyInput from '@/components/admin/CurrencyInput';
// Removal of hardcoded TERMINAL_STATUSES since we use Workflow settings now.
const paymentLabels: Record<PaymentStatus, { label: string; color: string }> = {
    unpaid: { label: 'Chưa thanh toán', color: 'text-red-600 bg-red-50' },
    deposit: { label: 'Đã đặt cọc', color: 'text-yellow-600 bg-yellow-50' },
    paid: { label: 'Đã thanh toán', color: 'text-green-600 bg-green-50' },
    pay_later: { label: 'Thanh toán sau', color: 'text-purple-600 bg-purple-50' },
    refunded: { label: 'Đã hoàn tiền', color: 'text-orange-600 bg-orange-50' },
    warranty: { label: 'Bảo hành', color: 'text-blue-600 bg-blue-50' },
};
const formatPrice = (p: number) => p > 0 ? p.toLocaleString('vi-VN') + 'đ' : '—';
// ── Appointment type (local) ──
interface Appointment {
    id: string;
    fullName: string;
    phone: string;
    date: string;
    timeSlot: string;
    store: string;
    status: string;
    serviceName?: string;
    serviceId?: string;
}
// ── Service type (local) ──
interface ServiceModel {
    id: string;
    name?: string;
    category?: string;
    price?: number | string;
    price_promo?: number | string;
    price_original?: number | string;
    device_model?: string;
    isActive?: boolean;
    [key: string]: unknown;
}

type RepairPermissionUser = {
    role?: string | null;
    permissions?: string[] | null;
};

function canOverrideRepairTerminalStatus(user: RepairPermissionUser | null | undefined) {
    return user?.role?.toLowerCase() === 'admin' || user?.permissions?.includes('admin_only');
}

// ══════════════════════════════════════════════════════════════════════════════
export default function RepairPage() {
    const { user } = useAuth();
    const canOverrideTerminalStatus = canOverrideRepairTerminalStatus(user);
    const { config } = useConfig();
    const searchParams = useSearchParams();
    // Data
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isSearchingDB, setIsSearchingDB] = useState(false);
    const [staffs, setStaffs] = useState<{ uid: string; displayName: string }[]>([]);
    const [services, setServices] = useState<ServiceModel[]>([]);
    const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig | undefined>(undefined);
    type WarrantyPrintType = 'warrantyDevice' | 'warrantyRepair' | 'warrantyAccessory';
    const [printWarrantyType, setPrintWarrantyType] = useState<WarrantyPrintType | null>(null);
    // Media upload states
    const [preMediaFiles, setPreMediaFiles] = useState<string[]>([]);
    const [postMediaFiles, setPostMediaFiles] = useState<string[]>([]);
    const [showPreMediaManager, setShowPreMediaManager] = useState(false);
    const [showPostMediaManager, setShowPostMediaManager] = useState(false);
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [techFilter, setTechFilter] = useState<string>('all');
    const [ticketTypeFilter, setTicketTypeFilter] = useState<'all' | 'repair' | 'warranty'>('all');
    // Modals
    const [showModal, setShowModal] = useState(false);
    const [editingTicket, setEditingTicket] = useState<RepairTicket | null>(null);
    const [printMode, setPrintMode] = useState<'receipt' | 'invoice' | 'warranty' | null>(null);
    const [printTicket, setPrintTicket] = useState<RepairTicket | null>(null);
    // Delivery / Cancel note modal
    const [noteModal, setNoteModal] = useState<{ ticket: RepairTicket; targetStatus: RepairStatus } | null>(null);
    const [deliveryNote, setDeliveryNote] = useState('');
    // Handover modal (Payment Gate)
    const [handoverModal, setHandoverModal] = useState<{ ticket: RepairTicket; action: 'done' | 'out' | 'refund', targetStatus?: string } | null>(null);
    const [handoverNote, setHandoverNote] = useState('');
    const [paymentConfirmed, setPaymentConfirmed] = useState(false);
    const [handoverAdditionalFees, setHandoverAdditionalFees] = useState<string>('');
    const [handoverDiscountAmount, setHandoverDiscountAmount] = useState<string>('');
    // Gift product selection (replaces old handoverGiftDiscount text input)
    const [handoverGiftItems, setHandoverGiftItems] = useState<GiftItem[]>([]);
    const [giftProducts, setGiftProducts] = useState<Product[] | null>(null);
    const [giftSearchTerm, setGiftSearchTerm] = useState('');
    // Detail Modal (Eye Icon)
    const [viewingTicket, setViewingTicket] = useState<RepairTicket | null>(null);
    // Warranty Modal
    const [warrantyModal, setWarrantyModal] = useState<RepairTicket | null>(null);
    const [warrantyHistory, setWarrantyHistory] = useState<RepairTicket[]>([]);
    const [warrantySelectedIndexes, setWarrantySelectedIndexes] = useState<number[]>([]);
    const [warrantyCreating, setWarrantyCreating] = useState(false);
    // Technician Assignment / Transfer Modal
    const [assignModal, setAssignModal] = useState<{ ticket: RepairTicket } | null>(null);
    const [assignTechnicianId, setAssignTechnicianId] = useState('');
    // Manager Override Modal
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
    // Form
    const emptyForm = {
        appointmentId: '',
        customerName: '',
        customerPhone: '',
        deviceModel: '',
        deviceImei: '',
        devicePasscode: '',
        deviceColor: '',
        // Checklist kiểm tra đầu vào
        checkBody: 'OK',
        checkScreen: 'OK',
        checkTouch: 'OK',
        checkCamera: 'OK',
        checkSpeaker: 'OK',
        checkConnectivity: 'OK',
        checkBattery: 'OK',
        checkBiometric: 'OK',
        // Lịch sử máy
        hasPriorRepair: false,
        hasWaterDamage: false,
        hasNonGenuineParts: false,
        // Issue
        issueDescription: '',
        techNotes: '',
        issues: [] as RepairIssue[],
        // Payment split
        partsCost: '' as string | number,
        depositAmount: '' as string | number,
        paymentStatus: 'unpaid' as PaymentStatus,
        technicianId: '',
        status: REPAIR_STATUS.INTAKE as RepairStatus,
        estimatedReturnDate: '',
        selectedServiceName: '',
        selectedCategoryPath: [] as string[],
    };
    const [formData, setFormData] = useState(emptyForm);

    // Auto-lookup customer by phone
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

    const mapWarrantyTypeToPrintType = (type: WarrantyPrintType): 'device' | 'repair' | 'accessory' => {
        if (type === 'warrantyDevice') return 'device';
        if (type === 'warrantyRepair') return 'repair';
        return 'accessory';
    };

    const resolveWarrantyTypeFromPath = (nodes: TaxonomyNode[], categoryPath: string[]): WarrantyPrintType | null => {
        let currentLevel = nodes;
        let foundWarrantyType: TaxonomyNode['warrantyType'];

        for (const pathId of categoryPath) {
            const node = currentLevel.find(n => n.id === pathId);
            if (!node) break;
            if (node.warrantyType) foundWarrantyType = node.warrantyType;
            currentLevel = node.children || [];
        }

        return foundWarrantyType && foundWarrantyType !== 'none' ? foundWarrantyType : null;
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
    // ── Realtime Tickets & Statuses ──
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
        // Fetch receipt config
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
            // Try fetching by phone OR imei OR ticket ID
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

            // Try retrieving ticket directly by id if it looks like one
            try {
                const docSnap = await getDoc(doc(db, 'repairs', s));
                if (docSnap.exists()) {
                    combined.push({ id: docSnap.id, ...docSnap.data() } as RepairTicket);
                }
            } catch {
                // Ignore
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
    // ── Fetch Staffs ──
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'admin'])));
                setStaffs(snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName || 'N/A' })));
            } catch (e) { console.error(e); }
        })();
    }, []);
    // ── Lazy load gift products (retail/accessories only, cached across modal opens) ──
    useEffect(() => {
        if (handoverModal && giftProducts === null) {
            getDocs(query(
                collection(db, 'products'),
                where('status', '==', 'active'),
                limit(200)
            )).then(snap => {
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
                setGiftProducts(all.filter(p => !isPartCategory(p.category, p.categoryIds)));
            }).catch(console.error);
        }
    }, [handoverModal, giftProducts]);
    // Fetch Appointments removed according to cost-saving dev feedback
    // ── Fetch Services for auto-fill ──
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'services'), orderBy('createdAt', 'desc')));
                setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) { console.error(e); }
        })();
    }, []);
    // ── Auto-fill from URL appointmentId ──
    useEffect(() => {
        const appointmentId = searchParams.get('appointmentId');
        if (!appointmentId || services.length === 0) return;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'appointments', appointmentId));
                if (!snap.exists()) return;
                const app = { id: snap.id, ...snap.data() } as Appointment;
                // Auto-fill customer info
                setFormData(prev => {
                    const updated = {
                        ...prev,
                        appointmentId: app.id,
                        customerName: app.fullName,
                        customerPhone: app.phone,
                        technicianId: user?.uid || prev.technicianId,
                        selectedServiceName: '',
                    };
                    // Auto-select service by serviceId
                    if (app.serviceId) {
                        const svc = services.find(s => s.id === app.serviceId);
                        if (svc) {
                            const price = Number(svc.price_promo || svc.price_original || svc.price) || 0;
                            updated.deviceModel = svc.device_model || updated.deviceModel;
                            updated.partsCost = price || updated.partsCost;
                            updated.selectedServiceName = svc.name || app.serviceName || '';
                        } else {
                            updated.selectedServiceName = app.serviceName || '';
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, services]);
    // ── Stats ──
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
    // ── Filter ──
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchTerm, statusFilter, techFilter, ticketTypeFilter]);
    // ── Quick status transition ──
    const handleQuickStatus = async (ticket: RepairTicket, nextStatus: string) => {
        const workflow = getWorkflowForTicket(ticket);
        const currentCfg = workflow.find(s => s.id === ticket.status);
        // Block terminal states
        if (currentCfg?.isTerminal) {
            toastError('Phiếu đã đóng, không thể thay đổi trạng thái!');
            return;
        }
        // Align with technician flow: require tech notes after inspection before moving forward.
        if (isRepairStatus(ticket.status, REPAIR_STATUS.INSPECTION) && nextStatus !== REPAIR_STATUS.INSPECTION) {
            if (!ticket.issue?.notes || ticket.issue.notes.trim().length === 0) {
                toastError('Vui lòng nhập ghi chú kỹ thuật (mục "Ghi chú kỹ thuật") trước khi chuyển trạng thái tiếp theo.');
                return;
            }
        }
        // Align with technician flow: warn (but allow) transitions without parts selection.
        if (currentCfg?.allowedFeatures?.includes('allowPartsSelection')) {
            const partsCount = (ticket.parts || []).length;
            if (partsCount === 0) {
                toastWarning('Chưa chọn linh kiện cho phiếu này. Nếu ca sửa không cần linh kiện, bạn vẫn có thể tiếp tục chuyển trạng thái.');
            }
        }
        // ── Checklist requirement check (Feature 1) ──
        if (currentCfg?.allowedFeatures?.includes('requireChecklist')) {
            if (!isChecklistComplete(ticket.deviceInfo?.checklist as Record<string, unknown> | undefined)) {
                toastError('Trạng thái hiện tại yêu cầu hoàn thành Checklist (8 mục) trước khi chuyển tiếp. Vui lòng mở phiếu để điền checklist.');
                return;
            }
        }
        // ── Payment requirement check (Intercept before normal transition) ──
        if (currentCfg?.allowedFeatures?.includes('requirePaymentGate')) {
            setHandoverAdditionalFees(ticket.payment?.additionalFees?.toString() || '');
            setHandoverDiscountAmount(ticket.payment?.discountAmount?.toString() || '');
            if (nextStatus === 'refund') {
                setHandoverModal({ ticket, action: 'refund', targetStatus: nextStatus });
                return;
            } else if (nextStatus === 'out') {
                setHandoverModal({ ticket, action: 'out', targetStatus: nextStatus });
                return;
            } else {
                setHandoverModal({ ticket, action: 'done', targetStatus: nextStatus });
                return;
            }
        }
        // ── Check requirePartsReady ──
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
        // ── Check requireAssignedTechnician ──
        const nextCfg = workflow.find(s => s.id === nextStatus);
        if (nextCfg?.allowedFeatures?.includes('requireAssignedTechnician') && !ticket.staff?.assignedTechnician) {
            toastError('Cần phân công Kỹ thuật viên trước khi thực hiện bước này!');
            setAssignModal({ ticket });
            return;
        }

        // ── KTV & Manager Override Check ──
        if (ticket.staff?.assignedTechnician) {
            const isAssignedKTV = ticket.staff.assignedTechnician === user?.uid;
            const isManager = user?.role === 'admin' || user?.permissions?.includes('manage_staff') || user?.permissions?.includes('manage_settings');

            if (!isAssignedKTV) {
                if (isManager) {
                    // Open Manager Override Bottom Sheet
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

    // ── Handover handler (Any status → terminal action) ──
    const handleHandover = async () => {
        if (!handoverModal) return;
        const { ticket, action, targetStatus } = handoverModal;
        const targetStatusId = action === 'done' ? (targetStatus || 'done') : action;
        const parsedAdditionalFees = Number(handoverAdditionalFees.replace(/[^0-9-]/g, '')) || 0;
        const parsedDiscountAmount = Number(handoverDiscountAmount.replace(/[^0-9-]/g, '')) || 0;
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
                    discountAmount: parsedDiscountAmount,
                    giftItems: handoverGiftItems,
                    operationKey: crypto.randomUUID(),
                    ticketVersion: ticket.version
                })
            });
            const data = await res.json();
            if (!res.ok) {
                toastError(data.error || 'Lỗi xử lý bàn giao');
                return;
            }
            setHandoverModal(null);
            setHandoverNote('');
            setPaymentConfirmed(false);
            setHandoverAdditionalFees('');
            setHandoverDiscountAmount('');
            setHandoverGiftItems([]);
            toastSuccess('Bàn giao thành công!');
        } catch (e: unknown) {
            console.error(e);
            toastError(e instanceof Error ? e.message : 'Lỗi xử lý bàn giao!');
        }
    };
    // ── Create Warranty Ticket ──
    const handleCreateWarrantyTicket = async (originalTicket: RepairTicket, claimedPartIndexes: number[]) => {
        if (claimedPartIndexes.length === 0) {
            toastWarning('Vui lòng chọn ít nhất 1 linh kiện cần bảo hành.');
            return;
        }
        setWarrantyCreating(true);
        try {
            // Chống tạo trùng: kiểm tra đã có phiếu warranty đang active cho cùng originalTicketId chưa
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
    // ── Open Create/Edit modal ──
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
    // ── Submit ──
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
                // FIRST: Update payment via server API because client writes to payment are blocked
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
                        }
                    })
                });

                const paymentDataResp = await paymentRes.json();
                if (!paymentRes.ok) {
                    throw new Error(paymentDataResp.error || 'Lỗi cập nhật chi phí');
                }
                // THEN: Update the rest of the ticket via client transaction
                const ticketRef = doc(db, 'repairs', editingTicket.id);
                await runTransaction(db, async (transaction) => {
                    const freshDoc = await transaction.get(ticketRef);
                    if (!freshDoc.exists()) throw new Error('Phiếu sửa chữa không còn tồn tại!');
                    const freshVersion = freshDoc.data()?.version || 0;

                    if (freshVersion > (editingTicket.version || 0) + 1) {
                        throw new Error('Phiếu đã được cập nhật bởi người khác. Vui lòng tải lại trang.');
                    }
                    // For updates, we DO NOT send payment, status, statusTimeline, parts, partsLockedAt
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
                // CREATE new ticket
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
                        amount: Number(formData.partsCost) || 0,
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
                const data = await res.json();
                const newTicketId = data.id;

                if (formData.appointmentId) {
                    await updateDoc(doc(db, 'appointments', formData.appointmentId), {
                        status: 'completed',
                        updatedAt: serverTimestamp(),
                    });
                }
            }

            // --- Customer Sync ---
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
    // ── Delete ──
    const handleDelete = async (id: string) => {
        if (!confirm('Xóa phiếu này?')) return;
        try { await deleteDoc(doc(db, 'repairs', id)); } catch (e) { console.error(e); }
    };
    // ── Print ──
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
        // Chờ render template trước khi gọi print (một số máy render chậm)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(() => window.print(), 200);
            });
        });
    };
    // ══════════════════════════════  RENDER  ═════════════════════════════════
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
        );
    }
    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Sửa chữa</h1>
                    <p className="text-gray-500">Theo dõi phiếu sửa chữa — chuyển trạng thái nhanh</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/25 font-semibold"
                >
                    <Plus size={20} /> Tạo phiếu mới
                </button>
            </div>
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
                {[
                    { label: 'Tổng phiếu', value: stats.total, icon: ClipboardList, color: 'text-blue-600 bg-blue-50' },
                    { label: 'Đang xử lý', value: stats.processing, icon: Wrench, color: 'text-orange-600 bg-orange-50' },
                    { label: 'Hoàn thành', value: stats.completed, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
                    { label: 'Doanh thu', value: formatPrice(stats.revenue), icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
                ].map((s, i) => (
                    <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                                <s.icon size={20} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                                <p className="text-lg font-bold text-gray-900">{s.value}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {/* ── Filters ── */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-5 gap-4 print:hidden">
                <div className="relative md:col-span-2 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Tìm tên, SĐT, IMEI, Model..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 h-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        />
                    </div>
                    {searchTerm.trim().length > 0 && filtered.length === 0 && (
                        <button
                            onClick={searchInDatabase}
                            disabled={isSearchingDB}
                            className="px-4 py-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap"
                        >
                            {isSearchingDB ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                            <span className="hidden sm:inline">Tìm Server</span>
                        </button>
                    )}
                </div>
                <select
                    value={ticketTypeFilter}
                    onChange={e => {
                        setTicketTypeFilter(e.target.value as 'all' | 'repair' | 'warranty');
                        setStatusFilter('all'); // reset status when changing type
                    }}
                    aria-label="Loại phiếu"
                    title="Loại phiếu"
                    className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white">
                    <option value="all">Tất cả loại phiếu</option>
                    <option value="repair">Phiếu sửa chữa</option>
                    <option value="warranty">Phiếu bảo hành</option>
                </select>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    aria-label="Lọc theo trạng thái"
                    title="Lọc theo trạng thái"
                    className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white">
                    <option value="all">Tất cả trạng thái</option>
                    {(ticketTypeFilter === 'all' ? dynamicStatuses : (ticketTypeFilter === 'warranty' ? warrantyStatuses : dynamicStatuses)).map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                </select>
                <select
                    value={techFilter}
                    onChange={e => setTechFilter(e.target.value)}
                    aria-label="Lọc theo kỹ thuật viên"
                    title="Lọc theo kỹ thuật viên"
                    className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white">
                    <option value="all">Tất cả KTV</option>
                    {staffs.map(s => (
                        <option key={s.uid} value={s.uid}>{s.displayName}</option>
                    ))}
                </select>
            </div>
            {/* ── Table / Cards ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
                {/* Mobile View */}
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
                                {/* Actions Area */}
                                <div className="pt-2 flex flex-col gap-2 border-t border-gray-100">
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        {/* Status actions */}
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
                                        {/* Nút Kích hoạt Bảo hành */}
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
                {/* Desktop View */}
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
                                                {/* ═══ STATUS ACTIONS (ternary: terminal / normal) ═══ */}
                                                {st?.isTerminal ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[11px] font-semibold border border-gray-200">
                                                        🔒 Đã đóng ({st.label})
                                                    </span>
                                                ) : (
                                                    st.allowedNext?.map((nextId: string) => {
                                                        const nextCfg = workflow.find(ds => ds.id === nextId);
                                                        if (!nextCfg) return null;

                                                        // Choose icons and colors dynamically based on target ID semantics if possible, or fallback
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
                                                {/* Eye / View Details */}
                                                <button onClick={() => setViewingTicket(ticket)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Xem chi tiết">
                                                    <Eye size={16} />
                                                </button>
                                                {/* Assign Tech */}
                                                <button onClick={() => setAssignModal({ ticket })}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Gán/Chuyển KTV">
                                                    <User size={16} />
                                                </button>
                                                {/* ═══ ALWAYS VISIBLE: Print / Video / Edit ═══ */}
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
                                                {/* Nút Kích hoạt Bảo hành — chỉ hiện khi phiếu done và có linh kiện còn hạn BH */}
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
                                                {/* Upload Video/Image hoặc Dán Link YouTube Bàn Giao */}
                                                {['done', 'out', 'refund'].includes(ticket.status) && (
                                                    ticket.postRepairMedia?.length > 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-2 py-1 rounded-lg font-semibold flex items-center gap-1">
                                                                <CheckCircle2 size={10} /> {ticket.postRepairMedia.length} media
                                                            </span>
                                                            {/* Allow adding more */}
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
                                                {/* Edit — admin luôn sửa được; staff chỉ sửa phiếu chưa đóng */}
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
                <PaginationBar
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalFiltered={totalFiltered}
                    totalAll={tickets.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    entityLabel="phiếu"
                />

                {hasMore && !searchTerm && (
                    <div className="p-4 border-t border-gray-100 flex justify-center">
                        <button
                            onClick={loadMoreData}
                            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            Tải thêm lịch sử cũ
                        </button>
                    </div>
                )}
            </div>
            {/* ══════════  Delivery/Cancel Note Modal  ══════════ */}
            {noteModal && (
                <Modal
                    isOpen={true}
                    onClose={() => { setNoteModal(null); setDeliveryNote(''); }}
                    size="md"
                >
                    <div className="p-5 pb-8 md:p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${noteModal.targetStatus === 'refund' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">
                                    {noteModal.targetStatus === 'refund' ? 'Xác nhận Hoàn phí' : 'Bàn giao máy'}
                                </h3>
                                <p className="text-sm text-gray-500">#{noteModal.ticket.id.slice(-6).toUpperCase()} — {noteModal.ticket.customer.name}</p>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {noteModal.targetStatus === 'refund' ? 'Lý do hoàn phí *' : 'Ghi chú bàn giao *'}
                            </label>
                            <textarea
                                rows={3}
                                required
                                value={deliveryNote}
                                onChange={e => setDeliveryNote(e.target.value)}
                                placeholder={noteModal.targetStatus === 'refund'
                                    ? 'Nhập lý do hoàn phí...'
                                    : 'Tình trạng máy khi trả, đã test chức năng...'}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => { setNoteModal(null); setDeliveryNote(''); }}
                                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                                Đóng
                            </button>
                            <button onClick={handleSubmit}
                                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg ${noteModal.targetStatus === 'refund' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>
                                {noteModal.targetStatus === 'refund' ? 'Xác nhận hoàn phí' : 'Xác nhận trả máy'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
            {/* ══════════  Create/Edit Modal  ══════════ */}
            {showModal && (
                <Modal
                    isOpen={true}
                    onClose={() => setShowModal(false)}
                    title={editingTicket ? 'Cập nhật phiếu' : 'Tạo phiếu sửa chữa'}
                    size="4xl"
                    priority="high"
                >
                    <div className="flex-1 overflow-y-auto w-full">
                        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-6">
                            {/* ── Customer ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><User size={18} className="text-orange-500" /> Khách hàng</legend>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <InputField label="Tên *" value={formData.customerName} onChange={v => setFormData(p => ({ ...p, customerName: v }))} required />
                                    <InputField label="Số điện thoại *" value={formData.customerPhone} onChange={v => setFormData(p => ({ ...p, customerPhone: v }))} type="tel" required />
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Device ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><Smartphone size={18} className="text-orange-500" /> Thiết bị</legend>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <InputField label="Model *" value={formData.deviceModel} onChange={v => setFormData(p => ({ ...p, deviceModel: v }))} required />
                                    <InputField label="IMEI / Serial" value={formData.deviceImei} onChange={v => setFormData(p => ({ ...p, deviceImei: v }))} />
                                    <InputField label="Mật khẩu màn hình" value={formData.devicePasscode} onChange={v => setFormData(p => ({ ...p, devicePasscode: v }))} placeholder="Để trống nếu không có" />
                                    <InputField label="Màu sắc" value={formData.deviceColor} onChange={v => setFormData(p => ({ ...p, deviceColor: v }))} />
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Issue ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><Wrench size={18} className="text-orange-500" /> Chi tiết sửa chữa</legend>
                                {/* Service selector with auto-fill */}
                                <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                                    <label className="block text-sm font-medium text-orange-800 mb-2">Chọn nhóm dịch vụ (Category)</label>

                                    {/* Display legacy or auto-filled service if not yet classified in the new taxonomy */}
                                    {formData.selectedServiceName && formData.selectedCategoryPath.length === 0 && (
                                        <div className="flex items-center justify-between bg-orange-100/50 px-3 py-2 rounded-lg border border-orange-200 mb-3 text-sm">
                                            <span className="text-orange-800">
                                                Dịch vụ hiện tại: <strong className="font-semibold">{formData.selectedServiceName}</strong> (Chưa phân loại)
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, selectedServiceName: '' }))}
                                                className="text-xs text-orange-600 hover:text-orange-800 underline font-medium"
                                            >
                                                Xóa
                                            </button>
                                        </div>
                                    )}
                                    <CategoryTaxonomySelector
                                        type="service"
                                        value={formData.selectedCategoryPath}
                                        onChange={(ids, catName, subCatName) => {
                                            setFormData(p => ({
                                                ...p,
                                                selectedCategoryPath: ids,
                                                selectedServiceName: subCatName || catName || '',
                                            }));
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Danh sách lỗi / vấn đề</label>
                                    {formData.issues.map((issue, idx) => (
                                        <div key={issue.id} className="flex items-center gap-2 mb-2">
                                            <span className="text-xs text-gray-400 w-5 text-center">{idx + 1}</span>
                                            <input
                                                type="text"
                                                placeholder="Tên lỗi (VD: Thay màn hình)"
                                                value={issue.label}
                                                onChange={e => setFormData(p => ({
                                                    ...p,
                                                    issues: p.issues.map(i => i.id === issue.id ? { ...i, label: e.target.value } : i)
                                                }))}
                                                className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20"
                                            />
                                            <CurrencyInput
                                                placeholder="Giá dự kiến"
                                                value={issue.estimatedPrice || ''}
                                                onChange={v => setFormData(p => ({
                                                    ...p,
                                                    issues: p.issues.map(i => i.id === issue.id ? { ...i, estimatedPrice: v } : i)
                                                }))}
                                                className="w-28 px-3 py-1.5 border rounded-lg text-sm text-right focus:ring-2 focus:ring-orange-500/20"
                                            />
                                            <button type="button" onClick={() => setFormData(p => ({ ...p, issues: p.issues.filter(i => i.id !== issue.id) }))}
                                                className="p-1 text-red-400 hover:text-red-600" title="Xóa">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <button type="button"
                                        onClick={() => setFormData(p => ({
                                            ...p,
                                            issues: [...p.issues, { id: crypto.randomUUID(), label: '', estimatedPrice: 0, status: 'pending' }]
                                        }))}
                                        className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-800 font-medium mt-1">
                                        <Plus size={14} /> Thêm lỗi
                                    </button>
                                </div>
                                {/* Fallback textarea nếu không dùng issues */}
                                {formData.issues.length === 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả lỗi *</label>
                                        <textarea rows={3} required value={formData.issueDescription}
                                            onChange={e => setFormData(p => ({ ...p, issueDescription: e.target.value }))}
                                            aria-label="Mô tả lỗi"
                                            title="Mô tả lỗi"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú kỹ thuật</label>
                                    <textarea rows={2} value={formData.techNotes}
                                        onChange={e => setFormData(p => ({ ...p, techNotes: e.target.value }))}
                                        aria-label="Ghi chú kỹ thuật"
                                        title="Ghi chú kỹ thuật"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Checklist kiểm tra đầu vào ── */}
                            {(() => {
                                const st = dynamicStatuses.find(s => s.id === formData.status);
                                return st?.allowedFeatures?.includes('requireChecklist');
                            })() && (
                                    <fieldset className="space-y-3">
                                        <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                            <CheckCircle2 size={18} className="text-orange-500" /> Kiểm tra đầu vào
                                        </legend>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {[
                                                { key: 'checkBody', label: 'Vỏ máy' },
                                                { key: 'checkScreen', label: 'Màn hình' },
                                                { key: 'checkTouch', label: 'Cảm ứng' },
                                                { key: 'checkCamera', label: 'Camera' },
                                                { key: 'checkSpeaker', label: 'Loa/Mic' },
                                                { key: 'checkConnectivity', label: 'Kết nối' },
                                                { key: 'checkBattery', label: 'Pin' },
                                                { key: 'checkBiometric', label: 'FaceID/Vân tay' },
                                            ].map(item => (
                                                <div key={item.key} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{item.label}</label>
                                                    <select
                                                        value={
                                                            ['OK', 'Trầy', 'Nứt', 'Móp', 'Lỗi', 'Không có'].find(
                                                                v => v.toLowerCase() === ((formData as Record<string, unknown>)[item.key] as string)?.toLowerCase()
                                                            ) || ((formData as Record<string, unknown>)[item.key] as string) || 'OK'
                                                        }
                                                        onChange={e => setFormData(p => ({ ...p, [item.key]: e.target.value }))}
                                                        aria-label={`Checklist: ${item.label}`}
                                                        title={`Checklist: ${item.label}`}
                                                        className={`w-full text-xs px-2 py-1.5 border rounded-md bg-white ${(formData as Record<string, unknown>)[item.key]?.toString().toLowerCase() === 'ok' ? 'border-green-300 text-green-700'
                                                            : (formData as Record<string, unknown>)[item.key]?.toString().toLowerCase() === 'lỗi' ? 'border-red-300 text-red-700'
                                                                : ((formData as Record<string, unknown>)[item.key] && (formData as Record<string, unknown>)[item.key] !== '') ? 'border-orange-300 text-orange-700'
                                                                    : 'border-gray-300 text-gray-700'
                                                            }`}
                                                    >
                                                        <option value="OK">✅ OK</option>
                                                        <option value="Trầy">⚠️ Trầy</option>
                                                        <option value="Nứt">⚠️ Nứt</option>
                                                        <option value="Móp">⚠️ Móp</option>
                                                        <option value="Lỗi">❌ Lỗi</option>
                                                        <option value="Không có">➖ Không có</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </fieldset>
                                )}
                            <hr className="border-gray-100" />
                            {/* ── Tình trạng & Lịch sử máy ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                    <AlertTriangle size={18} className="text-orange-500" /> Tình trạng & Lịch sử máy
                                </legend>
                                <div className="space-y-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
                                    <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={formData.hasPriorRepair} onChange={e => setFormData(p => ({ ...p, hasPriorRepair: e.target.checked }))} className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                                        <span>Máy đã từng sửa trước đó</span>
                                    </label>
                                    <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={formData.hasWaterDamage} onChange={e => setFormData(p => ({ ...p, hasWaterDamage: e.target.checked }))} className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                                        <span>Máy từng vào nước / oxy hóa</span>
                                    </label>
                                    <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={formData.hasNonGenuineParts} onChange={e => setFormData(p => ({ ...p, hasNonGenuineParts: e.target.checked }))} className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                                        <span>Máy đã thay linh kiện không chính hãng</span>
                                    </label>
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Media Upload: Ảnh/Video lúc nhận máy ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                    <ImageIcon size={18} className="text-orange-500" /> Ảnh/Video lúc nhận máy
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {preMediaFiles.map((url, i) => (
                                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border group">
                                            {url.includes('.mp4') || url.includes('.webm') || url.includes('video') ? (
                                                <video src={url} className="w-full h-full object-cover" muted playsInline />
                                            ) : (
                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                            )}
                                            <button type="button" onClick={() => setPreMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setShowPreMediaManager(true)}
                                        className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-orange-400 hover:bg-orange-50 transition-colors">
                                        <Upload size={18} className="text-gray-400" />
                                        <span className="text-[10px] text-gray-400 mt-0.5">Thêm</span>
                                    </button>
                                </div>
                            </fieldset>
                            {/* ── Media Upload: Ảnh/Video sau sửa (chỉ hiển khi Done/Out/Hoàn Phí) ── */}
                            {['done', 'out', 'refund'].includes(formData.status) && (
                                <>
                                    <hr className="border-gray-100" />
                                    <fieldset className="space-y-3">
                                        <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                            <Video size={18} className="text-green-500" /> Ảnh/Video sau sửa chữa
                                        </legend>
                                        <div className="flex flex-wrap gap-2">
                                            {postMediaFiles.map((url, i) => (
                                                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border group">
                                                    {url.includes('.mp4') || url.includes('.webm') || url.includes('video') ? (
                                                        <video src={url} className="w-full h-full object-cover" muted playsInline />
                                                    ) : (
                                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                    <button type="button" onClick={() => setPostMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => setShowPostMediaManager(true)}
                                                className="w-20 h-20 border-2 border-dashed border-green-300 rounded-lg flex flex-col items-center justify-center hover:border-green-400 hover:bg-green-50 transition-colors">
                                                <Upload size={18} className="text-gray-400" />
                                                <span className="text-[10px] text-gray-400 mt-0.5">Thêm</span>
                                            </button>
                                        </div>
                                    </fieldset>
                                </>
                            )}
                            <hr className="border-gray-100" />
                            {/* ── Payment & Timing & Assignment ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><DollarSign size={18} className="text-orange-500" /> Thanh toán & Phân công</legend>
                                <div className="grid md:grid-cols-3 gap-4">

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Đặt cọc (VNĐ)</label>
                                        <input type="text" value={formData.depositAmount ? Number(formData.depositAmount).toLocaleString('vi-VN') : ''}
                                            onChange={e => {
                                                const val = Number(e.target.value.replace(/\D/g, '')) || 0;
                                                setFormData(p => {
                                                    let autoStatus = p.paymentStatus;
                                                    if (autoStatus !== 'paid' && autoStatus !== 'refunded') {
                                                        autoStatus = val > 0 ? 'deposit' : 'unpaid';
                                                    }
                                                    return { ...p, depositAmount: val || '', paymentStatus: autoStatus };
                                                });
                                            }}
                                            placeholder="0"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái TT</label>
                                        <div className={`w-full px-4 py-2 border rounded-lg font-bold text-sm flex items-center ${paymentLabels[formData.paymentStatus]?.color || 'bg-gray-50 text-gray-700'}`}>
                                            {paymentLabels[formData.paymentStatus]?.label || formData.paymentStatus}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái phiếu</label>
                                        <select value={formData.status}
                                            onChange={e => setFormData(p => ({ ...p, status: e.target.value as RepairStatus }))}
                                            disabled={!!editingTicket && !canOverrideTerminalStatus}
                                            aria-label="Trạng thái phiếu"
                                            title="Trạng thái phiếu"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 bg-white disabled:bg-gray-100 disabled:opacity-70 disabled:cursor-not-allowed">
                                            {dynamicStatuses.map(s => (
                                                <option key={s.id} value={s.id}>{s.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {(() => {
                                        const st = dynamicStatuses.find(s => s.id === formData.status);
                                        return st?.allowedFeatures?.includes('allowAssignTech');
                                    })() && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Kỹ thuật viên</label>
                                                <select value={formData.technicianId}
                                                    onChange={e => setFormData(p => ({ ...p, technicianId: e.target.value }))}
                                                    aria-label="Chọn kỹ thuật viên"
                                                    title="Chọn kỹ thuật viên"
                                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 bg-white">
                                                    <option value="">— Chọn —</option>
                                                    {staffs.map(s => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ngày trả dự kiến</label>
                                        <input type="date" title="Ngày trả dự kiến" value={formData.estimatedReturnDate}
                                            onChange={e => setFormData(p => ({ ...p, estimatedReturnDate: e.target.value }))}
                                            aria-label="Ngày trả dự kiến"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                </div>
                            </fieldset>
                            <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white pb-2">
                                {editingTicket && (
                                    <button type="button" title="Xóa phiếu" onClick={() => handleDelete(editingTicket.id)}
                                        className="mr-auto px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                                        Xóa phiếu
                                    </button>
                                )}
                                <button type="button" title="Hủy bỏ" onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Hủy bỏ</button>
                                <button type="submit" title="Lưu phiếu"
                                    className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 flex items-center gap-2">
                                    <Save size={18} /> Lưu phiếu
                                </button>
                            </div>
                        </form>
                    </div>
                </Modal>
            )}
            {/* ══════════  Print Templates  ══════════ */}
            {printTicket && printMode === 'receipt' && (
                <PrintableReceipt ticket={printTicket} receiptConfig={receiptConfig} />
            )}
            {printTicket && printMode === 'invoice' && (
                <PrintableRepairInvoice ticket={printTicket} receiptConfig={receiptConfig} />
            )}
            {printTicket && printMode === 'warranty' && printWarrantyType && receiptConfig && (() => {
                const warrantyConfig = getWarrantyConfigForType(printWarrantyType);
                if (!warrantyConfig) return null;
                const payload = {
                    customerName: printTicket.customer.name,
                    customerPhone: printTicket.customer.phone,
                    deviceModel: printTicket.deviceInfo?.model || '—',
                    deviceColor: printTicket.deviceInfo?.color,
                    deviceImei: printTicket.deviceInfo?.imei,
                    devicePasscode: printTicket.deviceInfo?.passcode,
                    services: (printTicket.issues?.map((i: { label: string }) => i.label).join(', ')) || printTicket.issue?.description,
                    totalCost: Number(printTicket.payment?.amount || 0),
                    createdAt: printTicket.createdAt
                };
                return (
                    <PrintableWarranty
                        payload={payload}
                        globalConfig={receiptConfig}
                        warrantyConfig={warrantyConfig}
                        type={mapWarrantyTypeToPrintType(printWarrantyType)}
                    />
                );
            })()}
            {/* ═══ Handover Confirmation Modal (Enhanced with full breakdown) ═══ */}
            {handoverModal && (() => {
                const t = handoverModal.ticket;
                const deposit = t.payment?.depositAmount || 0;
                const hasValidParts = (t.parts || []).filter(p => !isRejectedRepairPart(p)).length > 0;
                const computedPartsCost = (t.parts || [])
                    .filter(p => !isRejectedRepairPart(p) && !p.isWarrantyCovered)
                    .reduce((sum, p) => {
                        const qty = Math.max(1, Number(p?.quantity) || 1);
                        const unit = Number(p?.unitPriceAtUse ?? p?.price ?? 0) || 0;
                        return sum + unit * qty;
                    }, 0);
                const partsCost = hasValidParts ? computedPartsCost : (Number(t.payment?.partsCost) || 0);
                const laborCost = Number(t.payment?.laborCost) || 0;
                const additionalFees = Number(handoverAdditionalFees.replace(/[^0-9-]/g, '')) || 0;
                const discountAmount = Number(handoverDiscountAmount.replace(/[^0-9-]/g, '')) || 0;
                const giftDiscount = handoverGiftItems.reduce((sum, g) => sum + g.price * g.quantity, 0);
                const total = partsCost + laborCost + additionalFees - discountAmount;
                const remaining = total - deposit;
                const action = handoverModal.action;
                const parts = t.parts || [];
                const filteredGiftProducts = (giftProducts || []).filter(p =>
                    p.name.toLowerCase().includes(giftSearchTerm.toLowerCase())
                );
                const titles: Record<string, string> = {
                    done: '✅ Hoàn Tất Đơn — Xác nhận Thanh Toán',
                    out: '↩️ Trả Máy — Xác nhận Hoàn/Thu phí',
                    refund: '🔴 Hoàn Phí — Xác nhận Hoàn tiền',
                };
                const colors: Record<string, string> = {
                    done: 'bg-emerald-500 hover:bg-emerald-600',
                    out: 'bg-gray-500 hover:bg-gray-600',
                    refund: 'bg-red-500 hover:bg-red-600',
                };
                // For "out" action: calculate refund or charge
                const outRefundAmount = action === 'out' && deposit > 0 ? deposit : 0;
                const outChargeAmount = action === 'out' && additionalFees > 0 ? (additionalFees - deposit > 0 ? additionalFees - deposit - discountAmount : 0) : 0; // Simplified
                return (
                    <Modal
                        isOpen={true}
                        onClose={() => { setHandoverModal(null); setHandoverNote(''); setPaymentConfirmed(false); setHandoverAdditionalFees(''); setHandoverDiscountAmount(''); setHandoverGiftItems([]); setGiftSearchTerm(''); }}
                        size="lg"
                        priority="high"
                    >
                        {/* Custom colored header */}
                        <div className={`px-6 py-4 text-white sticky top-0 z-10 ${action === 'done' ? 'bg-emerald-600' : action === 'refund' ? 'bg-red-600' : 'bg-gray-600'}`}>
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                {action === 'done' ? <CheckCircle2 size={20} /> : action === 'refund' ? <RotateCcw size={20} /> : <Ban size={20} />}
                                {titles[action]}
                            </h2>
                            <p className="text-sm opacity-80 mt-0.5">
                                #{t.id.slice(-6).toUpperCase()} • <b>{t.customer.name}</b> • {t.deviceInfo?.model}
                            </p>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {/* ── Service Info ── */}
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                                <p className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-1"><Wrench size={12} /> Thông tin dịch vụ</p>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Dịch vụ:</span>
                                        <span className="font-medium">{t.issues && t.issues.length > 0 ? t.issues.map(i => i.label).join(' | ') : typeof t.issue === 'string' ? t.issue : t.issue?.description || t.deviceInfo?.model || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Thiết bị:</span>
                                        <span className="font-medium">{t.deviceInfo?.model || '—'}</span>
                                    </div>
                                    {t.staff?.assignedTechnicianName && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">KTV phụ trách:</span>
                                            <span className="font-medium text-orange-600">{t.staff.assignedTechnicianName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* ── Parts Used ── */}
                            {parts.length > 0 && (
                                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                                    <p className="text-xs font-bold text-purple-700 uppercase mb-2 flex items-center gap-1"><ClipboardList size={12} /> Linh kiện đã sử dụng</p>
                                    <div className="space-y-1.5">
                                        {parts.filter((p: NonNullable<RepairTicket['parts']>[number]) => !isRejectedRepairPart(p)).map((p: NonNullable<RepairTicket['parts']>[number], i: number) => (
                                            <div key={i} className="flex justify-between text-sm">
                                                <span className="text-gray-700">
                                                    {p.productName || p.name || p.partName || PART_CATEGORY_LABEL} <span className="text-xs text-gray-400">×{p.quantity || 1}</span>
                                                    {p.quality && <span className="text-xs ml-1 px-1 bg-blue-100 text-blue-600 rounded">{p.quality}</span>}
                                                </span>
                                                <span className="font-medium">{formatPrice((Number(p.unitPriceAtUse ?? p.price ?? 0) || 0) * (p.quantity || 1))}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* ── Financial Breakdown ── */}
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-200">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1"><DollarSign size={12} /> Chi tiết thanh toán</p>

                                {partsCost > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Chi phí linh kiện:</span>
                                        <span className="font-medium">{formatPrice(partsCost)}</span>
                                    </div>
                                )}
                                {laborCost > 0 && (
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="text-gray-500">Tiền công sửa chữa:</span>
                                        <span className="font-medium">{formatPrice(laborCost)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm items-center py-1">
                                    <span className="text-gray-500">Phụ phí (nếu có):</span>
                                    <input
                                        type="text"
                                        value={handoverAdditionalFees ? Number(handoverAdditionalFees.replace(/[^0-9-]/g, '')).toLocaleString('vi-VN') : ''}
                                        onChange={e => setHandoverAdditionalFees(e.target.value)}
                                        placeholder="0"
                                        className="w-32 px-3 py-1 text-right border rounded-lg focus:ring-1 focus:ring-orange-500 text-gray-900 font-medium bg-white"
                                    />
                                </div>
                                <div className="flex justify-between text-sm items-center py-1">
                                    <span className="text-gray-500">Giảm giá:</span>
                                    <input
                                        type="text"
                                        value={handoverDiscountAmount ? Number(handoverDiscountAmount.replace(/[^0-9-]/g, '')).toLocaleString('vi-VN') : ''}
                                        onChange={e => setHandoverDiscountAmount(e.target.value)}
                                        placeholder="0"
                                        className="w-32 px-3 py-1 text-right border rounded-lg focus:ring-1 focus:ring-green-500 text-green-600 font-medium bg-white"
                                    />
                                </div>
                                {/* ── Gift Product Selector ── */}
                                <div className="py-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-gray-500 text-sm">🎁 Quà tặng (khấu trừ):</span>
                                        {giftDiscount > 0 && <span className="text-pink-600 font-medium text-sm">-{giftDiscount.toLocaleString('vi-VN')}đ</span>}
                                    </div>
                                    {/* Search input */}
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={giftSearchTerm}
                                            onChange={e => setGiftSearchTerm(e.target.value)}
                                            placeholder="Tìm sản phẩm tặng kèm..."
                                            className="w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-pink-500 bg-white pr-8"
                                        />
                                        <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        {/* Dropdown results */}
                                        {giftSearchTerm.trim() && filteredGiftProducts.length > 0 && (
                                            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                                {filteredGiftProducts.slice(0, 8).map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            const existing = handoverGiftItems.find(g => g.productId === p.id);
                                                            if (existing) {
                                                                setHandoverGiftItems(prev => prev.map(g => g.productId === p.id ? { ...g, quantity: g.quantity + 1 } : g));
                                                            } else {
                                                                setHandoverGiftItems(prev => [...prev, {
                                                                    productId: p.id,
                                                                    productName: p.name,
                                                                    price: p.price_promo || p.price_original,
                                                                    quantity: 1
                                                                }]);
                                                            }
                                                            setGiftSearchTerm('');
                                                        }}
                                                        className="w-full text-left px-3 py-2 hover:bg-pink-50 text-sm flex justify-between items-center transition-colors"
                                                    >
                                                        <span className="truncate mr-2">{p.name}</span>
                                                        <span className="text-pink-600 font-medium whitespace-nowrap">{(p.price_promo || p.price_original).toLocaleString('vi-VN')}đ</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {giftSearchTerm.trim() && filteredGiftProducts.length === 0 && giftProducts !== null && (
                                            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-gray-400 text-center">
                                                Không tìm thấy sản phẩm
                                            </div>
                                        )}
                                    </div>
                                    {/* Selected gift items list */}
                                    {handoverGiftItems.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {handoverGiftItems.map((g, i) => (
                                                <div key={g.productId} className="flex items-center justify-between bg-pink-50 rounded-lg px-3 py-1.5 text-sm">
                                                    <span className="truncate mr-2 text-gray-700">
                                                        {g.productName} <span className="text-xs text-gray-400">×{g.quantity}</span>
                                                    </span>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-pink-600 font-medium">{(g.price * g.quantity).toLocaleString('vi-VN')}đ</span>
                                                        <button
                                                            type="button"
                                                            title="Xóa sản phẩm tặng kèm"
                                                            onClick={() => setHandoverGiftItems(prev => prev.filter((_, idx) => idx !== i))}
                                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <Ban size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-between text-sm border-t pt-2">
                                    <span className="text-gray-700 font-semibold">Tổng cộng:</span>
                                    <span className="font-bold text-lg">{formatPrice(total)}</span>
                                </div>
                                {deposit > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Đã đặt cọc:</span>
                                        <span className="font-semibold text-yellow-600">-{formatPrice(deposit)}</span>
                                    </div>
                                )}
                                {/* ── Action-specific bottom section ── */}
                                {action === 'done' && remaining > 0 && (
                                    <div className="flex justify-between items-center text-sm border-t border-emerald-200 pt-3 mt-2 font-bold bg-emerald-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                                        <span className="text-gray-700">💰 SỐ TIỀN KHÁCH CẦN THANH TOÁN:</span>
                                        <span className="text-red-600 text-xl">{formatPrice(remaining)}</span>
                                    </div>
                                )}
                                {action === 'done' && remaining === 0 && (
                                    <div className="flex justify-between items-center text-sm border-t border-emerald-200 pt-3 mt-2 font-bold bg-emerald-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                                        <span className="text-gray-700">✅ Cần thu khách:</span>
                                        <span className="text-emerald-600 text-xl">{formatPrice(0)}</span>
                                    </div>
                                )}
                                {action === 'done' && remaining < 0 && (
                                    <div className="flex justify-between items-center text-sm border-t border-orange-200 pt-3 mt-2 font-bold bg-orange-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                                        <span className="text-orange-700">🔄 Cọc dư — Cần hoàn khách:</span>
                                        <span className="text-orange-600 text-xl">{formatPrice(Math.abs(remaining))}</span>
                                    </div>
                                )}
                                {action === 'out' && deposit > 0 && (
                                    <div className="flex justify-between items-center text-sm border-t border-orange-200 pt-3 mt-2 font-bold bg-orange-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                                        <span className="text-orange-700">🔄 TIỀN CỬA HÀNG HOÀN LẠI KHÁCH:</span>
                                        <span className="text-orange-600 text-xl">{formatPrice(outRefundAmount)}</span>
                                    </div>
                                )}
                                {action === 'out' && additionalFees > 0 && deposit === 0 && (
                                    <div className="flex justify-between items-center text-sm border-t border-yellow-200 pt-3 mt-2 font-bold bg-yellow-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                                        <span className="text-yellow-700">⚠️ KHÁCH CẦN THANH TOÁN PHÍ PHÁT SINH:</span>
                                        <span className="text-yellow-600 text-xl">{formatPrice(outChargeAmount)}</span>
                                    </div>
                                )}
                                {action === 'out' && deposit === 0 && additionalFees === 0 && (
                                    <div className="text-sm text-gray-500 border-t pt-2 mt-2 italic flex items-center justify-center gap-2">
                                        <Ban size={16} />
                                        Trả lại máy, không thu/hoàn phí.
                                    </div>
                                )}
                                {action === 'refund' && (
                                    <div className="flex justify-between items-center text-sm border-t border-red-200 pt-3 mt-2 font-bold bg-red-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                                        <span className="text-red-700">🔴 SỐ TIỀN CẦN HOÀN TRẢ KHÁCH:</span>
                                        <span className="text-red-600 text-xl">{formatPrice(deposit > 0 ? deposit : 0)}</span>
                                    </div>
                                )}
                            </div>
                            {/* Financial Checkbox for tra_may */}
                            {action === 'done' && remaining > 0 && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <div className="mt-0.5 bg-white border rounded">
                                            <input type="checkbox" checked={paymentConfirmed} onChange={e => setPaymentConfirmed(e.target.checked)} className="w-5 h-5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500" />
                                        </div>
                                        <span className="text-sm font-semibold text-yellow-800 leading-snug">
                                            Tôi xác nhận đã thu đủ số tiền <span className="text-red-600 underline decoration-2 underline-offset-2">{formatPrice(remaining)}</span> còn lại từ khách hàng.
                                        </span>
                                    </label>
                                </div>
                            )}
                            {/* Financial Checkbox for out with refund */}
                            {action === 'out' && outRefundAmount > 0 && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <div className="mt-0.5 bg-white border rounded">
                                            <input type="checkbox" checked={paymentConfirmed} onChange={e => setPaymentConfirmed(e.target.checked)} className="w-5 h-5 text-orange-600 rounded border-gray-300 focus:ring-orange-500" />
                                        </div>
                                        <span className="text-sm font-semibold text-orange-800 leading-snug">
                                            Tôi xác nhận đã hoàn trả <span className="text-orange-600 underline decoration-2 underline-offset-2">{formatPrice(outRefundAmount)}</span> tiền cọc cho khách hàng.
                                        </span>
                                    </label>
                                </div>
                            )}
                            {/* Financial Checkbox for hoan_phi */}
                            {action === 'refund' && deposit > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <div className="mt-0.5 bg-white border rounded">
                                            <input type="checkbox" checked={paymentConfirmed} onChange={e => setPaymentConfirmed(e.target.checked)} className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500" />
                                        </div>
                                        <span className="text-sm font-semibold text-red-800 leading-snug">
                                            Tôi xác nhận đã hoàn trả <span className="text-red-600 underline decoration-2 underline-offset-2">{formatPrice(deposit)}</span> cho khách hàng.
                                        </span>
                                    </label>
                                </div>
                            )}
                            {/* Note */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {action === 'refund' ? 'Lý do hoàn phí *' : action === 'out' ? 'Lý do trả máy *' : 'Ghi chú bàn giao'}
                                </label>
                                <textarea value={handoverNote} onChange={e => setHandoverNote(e.target.value)}
                                    rows={2} placeholder={action === 'refund' ? 'Máy bảo hành, không tìm được linh kiện...' : action === 'out' ? 'Không sửa được, trả máy cho khách...' : 'VD: Máy đã sửa xong, giao cho khách lúc 15h...'}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-sm" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white">
                            <button onClick={() => { setHandoverModal(null); setHandoverNote(''); setPaymentConfirmed(false); setHandoverAdditionalFees(''); setHandoverDiscountAmount(''); }}
                                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button title="Xác nhận bàn giao" onClick={handleHandover}
                                disabled={
                                    (action === 'done' && remaining > 0 && !paymentConfirmed) ||
                                    (action === 'out' && outRefundAmount > 0 && !paymentConfirmed) ||
                                    (action === 'refund' && deposit > 0 && !paymentConfirmed) ||
                                    ((action === 'refund' || action === 'out') && !handoverNote.trim())
                                }
                                className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 ${colors[action]} disabled:opacity-50 disabled:cursor-not-allowed`}>
                                <CheckCircle2 size={16} />
                                {action === 'done' ? 'Xác nhận Hoàn Tất Đơn' : action === 'refund' ? 'Xác nhận Hoàn Phí' : 'Xác nhận Trả Máy'}
                            </button>
                        </div>
                    </Modal>
                );
            })()}
            {/* ══════════  Detail View Modal (Eye Icon)  ══════════ */}
            {viewingTicket && (
                <Modal
                    isOpen={true}
                    onClose={() => setViewingTicket(null)}
                    title={`${viewingTicket.deviceInfo?.model || 'Thiết bị'} — #${viewingTicket.id.slice(-6).toUpperCase()}`}
                    size="lg"
                    priority="high"
                >
                    <div className="p-5 space-y-4">
                        {/* Status */}
                        {(() => {
                            const st = dynamicStatuses.find(s => s.id === viewingTicket.status) || { id: viewingTicket.status, label: viewingTicket.status, color: 'text-gray-700 bg-gray-50 border-gray-200' };
                            return (
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${st.color}`}>
                                    {st.label}
                                </div>
                            );
                        })()}
                        {/* Issue & Tech Notes */}
                        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                            {viewingTicket.issues && viewingTicket.issues.length > 0 ? (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Danh sách lỗi</p>
                                    <div className="space-y-1">
                                        {viewingTicket.issues.map((iss, idx) => (
                                            <div key={iss.id || idx} className="flex justify-between text-sm">
                                                <span className="text-gray-800">{idx + 1}. {iss.label}</span>
                                                {iss.estimatedPrice > 0 && <span className="text-gray-500 text-xs">~{iss.estimatedPrice.toLocaleString('vi-VN')}đ</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : viewingTicket.issue?.description && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Lỗi / Yêu cầu</p>
                                    <p className="text-sm text-gray-800">{viewingTicket.issue.description}</p>
                                </div>
                            )}
                            {viewingTicket.issue?.notes && (
                                <div className="pt-2 border-t border-gray-200">
                                    <p className="text-xs font-semibold text-orange-600 mb-1 flex items-center gap-1"><Wrench size={12} /> Ghi chú kỹ thuật</p>
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{viewingTicket.issue.notes}</p>
                                </div>
                            )}
                        </div>
                        {/* Parts Used */}
                        {viewingTicket.parts && viewingTicket.parts.length > 0 && (
                            <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                                <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1"><ClipboardList size={12} /> Linh kiện đã sử dụng</p>
                                <div className="space-y-1.5">
                                    {viewingTicket.parts.map((p: NonNullable<RepairTicket['parts']>[number], i: number) => (
                                        <div key={i} className="flex justify-between text-[13px]">
                                            <span className="text-gray-700 font-medium">
                                                {p.productName || p.name || p.partName || PART_CATEGORY_LABEL} <span className="text-xs text-gray-400 font-normal">×{p.quantity || 1}</span>
                                                {p.quality && <span className="text-xs ml-1 px-1 bg-blue-100 text-blue-600 rounded font-normal">{p.quality}</span>}
                                                {p.supplierName && <span className="text-xs ml-1 px-1 bg-gray-100 text-gray-500 rounded font-normal" title="Nhà cung cấp">🏭 {p.supplierName}</span>}
                                            </span>
                                            <span className="font-semibold text-gray-800">{formatPrice((Number(p.unitPriceAtUse ?? p.price ?? 0) || 0) * (p.quantity || 1))}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Checklist */}
                        {viewingTicket.deviceInfo?.checklist && (
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><CheckCircle2 size={12} /> Checklist kiểm tra</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(viewingTicket.deviceInfo.checklist)
                                        .filter(([k]) => !['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts'].includes(k))
                                        .map(([key, val]) => (
                                            <div key={key} className={`text-[11px] rounded-lg px-2.5 py-2 border font-medium flex items-center justify-between ${val?.toString().toLowerCase() === 'ok' ? 'bg-green-50 border-green-200 text-green-700' :
                                                val?.toString().toLowerCase() === 'lỗi' ? 'bg-red-50 border-red-200 text-red-600' :
                                                    val && val !== 'N/A' && val !== '—' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                                        'bg-gray-50 border-gray-200 text-gray-500'
                                                }`}>
                                                <span className="opacity-70">{
                                                    key === 'body' ? 'Vỏ máy' :
                                                        key === 'screen' ? 'Màn hình' :
                                                            key === 'touch' ? 'Cảm ứng' :
                                                                key === 'camera' ? 'Camera' :
                                                                    key === 'speaker' ? 'Loa/Mic' :
                                                                        key === 'connectivity' ? 'Kết nối' :
                                                                            key === 'battery' ? 'Pin' :
                                                                                key === 'biometric' ? 'FaceID/Vân tay' : key
                                                }:</span>
                                                <span>{val as string || '—'}</span>
                                            </div>
                                        ))}
                                </div>
                                {/* Lịch sử máy */}
                                <div className="mt-3">
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><AlertCircle size={12} /> Lịch sử máy</p>
                                    <div className="flex flex-wrap gap-2 text-[11px]">
                                        <span className={`px-2 py-1 rounded-md border ${viewingTicket.deviceInfo.checklist.hasPriorRepair ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                            {viewingTicket.deviceInfo.checklist.hasPriorRepair ? '☑' : '☐'} Đã từng sửa
                                        </span>
                                        <span className={`px-2 py-1 rounded-md border ${viewingTicket.deviceInfo.checklist.hasWaterDamage ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                            {viewingTicket.deviceInfo.checklist.hasWaterDamage ? '☑' : '☐'} Từng vào nước
                                        </span>
                                        <span className={`px-2 py-1 rounded-md border ${viewingTicket.deviceInfo.checklist.hasNonGenuineParts ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                            {viewingTicket.deviceInfo.checklist.hasNonGenuineParts ? '☑' : '☐'} Kém/Lô
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Pre-repair Media */}
                        {viewingTicket.preRepairMedia?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><ImageIcon size={12} /> Ảnh/Video nhận máy</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {viewingTicket.preRepairMedia.map((url, i) => (
                                        <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border">
                                            {url.includes('.mp4') || url.includes('video') ? (
                                                <video src={url} controls className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={url} alt={`Pre-repair ${i + 1}`} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Post-repair Media */}
                        {viewingTicket.postRepairMedia?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Video size={12} /> Video / Media bàn giao</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {viewingTicket.postRepairMedia.map((url, i) => (
                                        <div key={i} className="rounded-lg overflow-hidden bg-gray-100 border">
                                            {isYouTubeUrl(url) ? (
                                                <div className="aspect-video">
                                                    <iframe src={getYouTubeEmbedUrl(url) || ''} title={`YouTube ${i + 1}`}
                                                        className="w-full h-full" frameBorder="0"
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                                </div>
                                            ) : url.includes('.mp4') || url.includes('video') ? (
                                                <video src={url} controls className="w-full" />
                                            ) : (
                                                <img src={url} alt={`Post-repair ${i + 1}`} className="w-full object-cover" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Timeline */}
                        {viewingTicket.statusTimeline?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Clock size={12} /> Lịch sử trạng thái</p>
                                <div className="space-y-1">
                                    {viewingTicket.statusTimeline.map((entry, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                            <span className="font-medium text-gray-700">
                                                {dynamicStatuses.find(s => s.id === entry.status)?.label || entry.status}
                                            </span>
                                            <span className="text-gray-400">
                                                {new Date(entry.timestamp || Date.now()).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {entry.durationInMinutes && (
                                                <span className="text-gray-300">({entry.durationInMinutes} phút)</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </Modal>
            )}
            {/* ═══ WARRANTY MODAL ═══ */}
            {warrantyModal && (() => {
                const wt = warrantyModal;
                const activeParts = (wt.parts || [])
                    .map((p, idx) => ({ ...p, _origIdx: idx }))
                    .filter(p =>
                        isWarrantyEligibleRepairPart(p) &&
                        p.warrantyMonths && p.warrantyMonths > 0 &&
                        p.warrantyExpiresAt && (
                            typeof p.warrantyExpiresAt === 'number'
                                ? p.warrantyExpiresAt
                                : (p.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0
                        ) > Date.now()
                    );
                return (
                    <Modal
                        isOpen={true}
                        onClose={() => setWarrantyModal(null)}
                        title={`Kích hoạt Bảo hành — #${wt.id.slice(-6).toUpperCase()}`}
                        size="lg"
                        priority="high"
                    >
                        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                            {warrantyHistory.length > 0 && (
                                <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-sm font-semibold text-amber-800 mb-1 flex items-center gap-1">
                                        <AlertCircle size={14} /> Chú ý: Đơn này đã từng được bảo hành {warrantyHistory.length} lần
                                    </p>
                                    <ul className="text-xs text-amber-700 list-disc list-inside space-y-1">
                                        {warrantyHistory.map((h, i) => {
                                            const d = h.timing?.receivedAt || h.createdAt;
                                            const dateStr = d && typeof d === 'object' && 'toDate' in d ? (d as { toDate: () => Date }).toDate().toLocaleString('vi-VN') : '—';
                                            return <li key={h.id}>Lần {i + 1}: Phiếu #{h.id.slice(-6).toUpperCase()} ({dateStr})</li>;
                                        })}
                                    </ul>
                                </div>
                            )}
                            <p className="text-sm text-gray-600 font-medium">Chọn linh kiện đang bị lỗi cần bảo hành:</p>
                            {activeParts.length === 0 ? (
                                <p className="text-sm text-gray-400 italic">Không có linh kiện nào còn hạn bảo hành.</p>
                            ) : (
                                activeParts.map(p => {
                                    const exTs = typeof p.warrantyExpiresAt === 'number'
                                        ? p.warrantyExpiresAt
                                        : (p.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
                                    const exStr = exTs ? new Date(exTs).toLocaleDateString('vi-VN') : '—';
                                    const checked = warrantySelectedIndexes.includes(p._origIdx);
                                    return (
                                        <label key={p._origIdx}
                                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                                            <input type="checkbox" checked={checked}
                                                onChange={() => setWarrantySelectedIndexes(prev =>
                                                    checked ? prev.filter(i => i !== p._origIdx) : [...prev, p._origIdx]
                                                )}
                                                className="w-4 h-4 text-emerald-600 rounded" />
                                            <div className="flex-1">
                                                <p className="font-semibold text-sm text-gray-900">{p.productName}</p>
                                                <p className="text-xs text-gray-500">
                                                    {p.partType || '—'} · BH {p.warrantyMonths} tháng · Hết hạn: {exStr}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button onClick={() => setWarrantyModal(null)}
                                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button
                                onClick={() => handleCreateWarrantyTicket(wt, warrantySelectedIndexes)}
                                disabled={warrantyCreating || warrantySelectedIndexes.length === 0}
                                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                                {warrantyCreating ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                Tạo Phiếu Bảo Hành ({warrantySelectedIndexes.length})
                            </button>
                        </div>
                    </Modal>
                );
            })()}
            {/* ═══ PRE MEDIA MANAGER MODAL ═══ */}
            <MediaManager
                isOpen={showPreMediaManager}
                onClose={() => setShowPreMediaManager(false)}
                title="Chọn Ảnh/Video lúc nhận máy"
                multiple={true}
                onSelectMultiple={(urls) => {
                    setPreMediaFiles(prev => [...prev, ...urls]);
                }}
            />
            {/* ═══ POST MEDIA MANAGER MODAL ═══ */}
            <MediaManager
                isOpen={showPostMediaManager}
                onClose={() => setShowPostMediaManager(false)}
                title="Chọn Ảnh/Video sau sửa chữa"
                multiple={true}
                onSelectMultiple={(urls) => {
                    setPostMediaFiles(prev => [...prev, ...urls]);
                }}
            />
            {/* ═══ KTV ASSIGN MODAL ═══ */}
            {assignModal && (
                <Modal
                    isOpen={true}
                    onClose={() => { setAssignModal(null); setAssignTechnicianId(''); }}
                    title={`Phân công KTV — #${assignModal.ticket.id.slice(-6).toUpperCase()}`}
                    size="sm"
                    mobileSheet={true}
                >
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Chọn Kỹ thuật viên</label>
                            <select
                                title="Chọn KTV"
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                                value={assignTechnicianId}
                                onChange={e => setAssignTechnicianId(e.target.value)}
                            >
                                <option value="">-- Chọn KTV --</option>
                                {staffs.map(tech => (
                                    <option key={tech.uid} value={tech.uid}>{tech.displayName}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                            <button onClick={() => { setAssignModal(null); setAssignTechnicianId(''); }} className="px-4 py-2 text-sm bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={submitAssignTechnician} disabled={!assignTechnicianId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">Lưu phân công</button>
                        </div>
                    </div>
                </Modal>
            )}
            {/* ═══ MANAGER OVERRIDE MODAL ═══ */}
            {managerOverrideModal && (
                <Modal
                    isOpen={true}
                    onClose={() => { setManagerOverrideModal(null); setManagerOverrideNote(''); }}
                    title={`Quản lý Ghi đè — #${managerOverrideModal.ticket.id.slice(-6).toUpperCase()}`}
                    size="sm"
                    mobileSheet={true}
                >
                    <div className="p-4 space-y-4">
                        <div className="bg-orange-50 border border-orange-200 text-orange-800 p-3 rounded-lg text-sm">
                            <p className="font-semibold mb-1 flex items-center gap-1"><AlertCircle size={14} /> Chuyển trạng thái bắt buộc</p>
                            <p className="text-xs">Bạn đang thực hiện ghi đè chuyển trạng thái của phiếu do KTV khác phụ trách. Vui lòng nhập lý do cụ thể.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Lý do (Ghi chú kỹ thuật) <span className="text-red-500">*</span></label>
                            <textarea
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                                rows={3}
                                value={managerOverrideNote}
                                onChange={e => setManagerOverrideNote(e.target.value)}
                                placeholder="Nhập lý do chuyển trạng thái..."
                            />
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                            <button onClick={() => { setManagerOverrideModal(null); setManagerOverrideNote(''); }} className="px-4 py-2 text-sm bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={submitManagerOverride} disabled={!managerOverrideNote.trim()} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg disabled:opacity-50">Xác nhận chuyển</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div >
    );
}
// ── Reusable Input ──
function InputField({ label, value, onChange, type = 'text', placeholder, required }: {
    label: string; value: string; onChange: (v: string) => void;
    type?: string; placeholder?: string; required?: boolean;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)}
                placeholder={placeholder} required={required}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
        </div>
    );
}
