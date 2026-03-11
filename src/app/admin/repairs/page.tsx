'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Wrench, Plus, Search, Printer,
    CheckCircle2, Clock, Smartphone, User, FileText,
    X, Save, Calendar,
    DollarSign, AlertTriangle, ArrowRight,
    ClipboardList, TrendingUp, Loader2, Eye, Upload, Image as ImageIcon, Video, Camera,
    Ban, RotateCcw, AlertCircle
} from 'lucide-react';
import {
    collection, query, where, getDocs, addDoc, updateDoc,
    doc, serverTimestamp, orderBy, deleteDoc, onSnapshot, Timestamp, getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import type { RepairTicket, RepairStatus, PaymentStatus, DeviceChecklist, StatusTimelineEntry, WorkflowNode } from '@/lib/types';
import { uploadImage, uploadMedia } from '@/lib/storage';
import PrintableReceipt from '@/components/admin/PrintableReceipt';
import type { ReceiptConfig } from '@/components/admin/PrintableReceipt';

// ── Terminal Statuses (Cố định cho doanh thu) ──
const TERMINAL_STATUSES: RepairStatus[] = ['da_tra_may', 'out', 'hoan_phi'];

const paymentLabels: Record<PaymentStatus, { label: string; color: string }> = {
    unpaid: { label: 'Chưa thanh toán', color: 'text-red-600 bg-red-50' },
    deposit: { label: 'Đã đặt cọc', color: 'text-yellow-600 bg-yellow-50' },
    paid: { label: 'Đã thanh toán', color: 'text-green-600 bg-green-50' },
    pay_later: { label: 'Thanh toán sau', color: 'text-purple-600 bg-purple-50' },
    refunded: { label: 'Đã hoàn tiền', color: 'text-orange-600 bg-orange-50' },
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

// ══════════════════════════════════════════════════════════════════════════════
export default function RepairPage() {
    const { user } = useAuth();
    useConfig();
    const searchParams = useSearchParams();

    // Data
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [staffs, setStaffs] = useState<{ uid: string; displayName: string }[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [services, setServices] = useState<ServiceModel[]>([]);
    const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig | undefined>(undefined);

    // Media upload states
    const [preMediaFiles, setPreMediaFiles] = useState<string[]>([]);
    const [postMediaFiles, setPostMediaFiles] = useState<string[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [techFilter, setTechFilter] = useState<string>('all');

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [editingTicket, setEditingTicket] = useState<RepairTicket | null>(null);
    const [, setPrintMode] = useState<'receipt' | 'invoice' | null>(null);
    const [printTicket, setPrintTicket] = useState<RepairTicket | null>(null);

    // Delivery / Cancel note modal
    const [noteModal, setNoteModal] = useState<{ ticket: RepairTicket; targetStatus: RepairStatus } | null>(null);
    const [deliveryNote, setDeliveryNote] = useState('');

    // Handover modal (Done → 3 actions)
    const [handoverModal, setHandoverModal] = useState<{ ticket: RepairTicket; action: 'tra_may' | 'out' | 'hoan_phi' } | null>(null);
    const [handoverNote, setHandoverNote] = useState('');
    const [paymentConfirmed, setPaymentConfirmed] = useState(false);

    // Detail Modal (Eye Icon)
    const [viewingTicket, setViewingTicket] = useState<RepairTicket | null>(null);

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
        // Payment split
        partsCost: '' as string | number,
        laborCost: '' as string | number,
        depositAmount: '' as string | number,
        paymentStatus: 'unpaid' as PaymentStatus,
        technicianId: '',
        status: 'cho_tiep_nhan' as RepairStatus,
        estimatedReturnDate: '',
        selectedServiceName: '',
    };
    const [formData, setFormData] = useState(emptyForm);

    const [dynamicStatuses, setDynamicStatuses] = useState<WorkflowNode[]>([]);
    const [, setStatusLoading] = useState(true);


    const endGameTrigger = dynamicStatuses.length > 0 ? dynamicStatuses[dynamicStatuses.length - 1].id : 'done';

    // ── Realtime Tickets & Statuses ──
    useEffect(() => {
        const q = query(collection(db, 'repairs'), orderBy('createdAt', 'desc'));
        const unsubTickets = onSnapshot(q, (snap) => {
            setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket)));
            setLoading(false);
        }, (err) => {
            console.error('Repairs listener error:', err);
            setLoading(false);
        });

        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), (docSnap) => {
            if (docSnap.exists() && docSnap.data().statuses) {
                setDynamicStatuses(docSnap.data().statuses);
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

    // ── Fetch Staffs ──
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'admin'])));
                setStaffs(snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName || 'N/A' })));
            } catch (e) { console.error(e); }
        })();
    }, []);

    // ── Fetch Appointments (only pending/confirmed — exclude completed) ──
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'appointments'), orderBy('createdAt', 'desc')));
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
                setAppointments(all.filter(a => a.status === 'confirmed' || a.status === 'pending'));
            } catch (e) { console.error(e); }
        })();
    }, []);

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
    const stats = {
        total: tickets.length,
        processing: tickets.filter(t => !TERMINAL_STATUSES.includes(t.status) && t.status !== endGameTrigger).length,
        completed: tickets.filter(t => TERMINAL_STATUSES.includes(t.status) || t.status === endGameTrigger).length,
        revenue: tickets
            .filter(t => t.status === 'da_tra_may')
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
        return matchSearch && matchStatus && matchTech;
    });

    // ── Quick status transition ──
    const handleQuickStatus = async (ticket: RepairTicket, nextStatus: string) => {
        // Block terminal states
        if (TERMINAL_STATUSES.includes(ticket.status)) {
            alert('Phiếu đã đóng, không thể thay đổi trạng thái!');
            return;
        }

        // ── Payment warning for done ──
        if (nextStatus === endGameTrigger && ticket.payment?.status === 'unpaid') {
            const ok = window.confirm(
                'Đơn này chưa thanh toán. Bạn có muốn chuyển trạng thái thanh toán thành "Thanh toán sau" (Khách nợ) không?\n\n• OK = Chuyển trạng thái + đánh dấu thanh toán sau\n• Cancel = Hủy thao tác (giữ nguyên để thu tiền trước)'
            );
            if (!ok) return;
            try {
                await updateDoc(doc(db, 'repairs', ticket.id), {
                    status: nextStatus,
                    'payment.status': 'pay_later',
                    'timing.completedAt': serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    'staff.assignedTechnician': user?.uid || '',
                    'staff.assignedTechnicianName': user?.displayName || 'Admin',
                });
            } catch (e) {
                console.error(e);
                alert('Lỗi cập nhật trạng thái!');
            }
            return;
        }

        try {
            // Build statusTimeline entry
            const now = Date.now();
            const oldTimeline: StatusTimelineEntry[] = ticket.statusTimeline || [];
            const newEntry: StatusTimelineEntry = { status: nextStatus, timestamp: now };
            // Calculate duration of previous status
            if (oldTimeline.length > 0) {
                const lastEntry = oldTimeline[oldTimeline.length - 1];
                lastEntry.durationInMinutes = Math.round((now - lastEntry.timestamp) / 60000);
            }
            const updatedTimeline = [...oldTimeline, newEntry];

            const update: Record<string, unknown> = {
                status: nextStatus,
                statusTimeline: updatedTimeline,
                updatedAt: serverTimestamp(),
                'staff.assignedTechnician': user?.uid || '',
                'staff.assignedTechnicianName': user?.displayName || 'Admin',
            };
            if (nextStatus === endGameTrigger) {
                update['timing.completedAt'] = serverTimestamp();
            }
            await updateDoc(doc(db, 'repairs', ticket.id), update);
        } catch (e) {
            console.error(e);
            alert('Lỗi cập nhật trạng thái!');
        }
    };

    // ── Deliver / Cancel with note ──
    const handleNoteSubmit = async () => {
        if (!noteModal || !deliveryNote.trim()) {
            alert('Vui lòng nhập ghi chú bàn giao!');
            return;
        }
        // Forward-only + terminal validation
        if (TERMINAL_STATUSES.includes(noteModal.ticket.status)) {
            alert('Phiếu đã đóng, không thể thay đổi!');
            return;
        }
        try {
            // Build statusTimeline
            const now = Date.now();
            const oldTimeline: StatusTimelineEntry[] = noteModal.ticket.statusTimeline || [];
            const newEntry: StatusTimelineEntry = { status: noteModal.targetStatus, timestamp: now };
            if (oldTimeline.length > 0) {
                const lastEntry = oldTimeline[oldTimeline.length - 1];
                lastEntry.durationInMinutes = Math.round((now - lastEntry.timestamp) / 60000);
            }
            const updatedTimeline = [...oldTimeline, newEntry];

            const update: Record<string, unknown> = {
                status: noteModal.targetStatus,
                statusTimeline: updatedTimeline,
                deliveryNote: deliveryNote.trim(),
                updatedAt: serverTimestamp(),
            };
            if (noteModal.targetStatus === 'out') {
                update['timing.completedAt'] = serverTimestamp();
                if (noteModal.ticket.payment?.status === 'unpaid') {
                    update['payment.status'] = 'pay_later';
                }
            }
            await updateDoc(doc(db, 'repairs', noteModal.ticket.id), update);
            setNoteModal(null);
            setDeliveryNote('');
        } catch (e) {
            console.error(e);
            alert('Lỗi!');
        }
    };

    // ── Handover handler (Done → 3 actions) ──
    const handleHandover = async () => {
        if (!handoverModal) return;
        const { ticket, action } = handoverModal;

        // Validate: only from done status
        if (ticket.status !== endGameTrigger) {
            alert('Chỉ có thể bàn giao khi phiếu ở trạng thái hoàn thành sửa chữa!');
            setHandoverModal(null);
            setPaymentConfirmed(false);
            return;
        }

        try {
            const now = Date.now();
            const oldTimeline: StatusTimelineEntry[] = ticket.statusTimeline || [];
            if (oldTimeline.length > 0) {
                const lastEntry = oldTimeline[oldTimeline.length - 1];
                lastEntry.durationInMinutes = Math.round((now - lastEntry.timestamp) / 60000);
            }

            if (action === 'tra_may') {
                // Trả máy thành công → paid + da_tra_may
                const newTimeline = [...oldTimeline, { status: 'da_tra_may', timestamp: now }];
                await updateDoc(doc(db, 'repairs', ticket.id), {
                    status: 'da_tra_may',
                    'payment.status': 'paid',
                    statusTimeline: newTimeline,
                    deliveryNote: handoverNote.trim() || 'Trả máy thành công',
                    'timing.completedAt': serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            } else if (action === 'out') {
                // Out → trả máy, không thu tiền (chỉ khi chưa cọc)
                const newTimeline = [...oldTimeline, { status: 'out', timestamp: now }];
                await updateDoc(doc(db, 'repairs', ticket.id), {
                    status: 'out',
                    statusTimeline: newTimeline,
                    deliveryNote: handoverNote.trim() || 'Không sửa được, trả máy',
                    'timing.completedAt': serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            } else if (action === 'hoan_phi') {
                // Hoàn phí → refunded + hoan_phi
                const newTimeline = [...oldTimeline, { status: 'hoan_phi', timestamp: now }];
                await updateDoc(doc(db, 'repairs', ticket.id), {
                    status: 'hoan_phi',
                    'payment.status': 'refunded',
                    statusTimeline: newTimeline,
                    deliveryNote: handoverNote.trim() || 'Hoàn phí cho khách',
                    'timing.completedAt': serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }

            setHandoverModal(null);
            setHandoverNote('');
            setPaymentConfirmed(false);
        } catch (e) {
            console.error(e);
            alert('Lỗi xử lý bàn giao!');
        }
    };

    // ── Open Create/Edit modal ──
    const handleOpenModal = (ticket?: RepairTicket) => {
        if (ticket) {
            const cl = ticket.deviceInfo?.checklist;
            setEditingTicket(ticket);
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
                partsCost: ticket.payment?.partsCost || ticket.payment?.amount || '',
                laborCost: ticket.payment?.laborCost || '',
                depositAmount: ticket.payment?.depositAmount || '',
                paymentStatus: ticket.payment?.status || 'unpaid',
                technicianId: ticket.staff?.assignedTechnician || '',
                status: ticket.status,
                estimatedReturnDate: '',
                selectedServiceName: '',
            });
            setPreMediaFiles(ticket.preRepairMedia || []);
            setPostMediaFiles(ticket.postRepairMedia || []);
        } else {
            setEditingTicket(null);
            setFormData({ ...emptyForm, technicianId: user?.uid || '' });
            setPreMediaFiles([]);
            setPostMediaFiles([]);
        }
        setShowModal(true);
    };

    // ── Auto-fill from appointment ──
    const handleAppointmentSelect = (appId: string) => {
        const app = appointments.find(a => a.id === appId);
        if (app) {
            setFormData(prev => {
                const updated = {
                    ...prev,
                    appointmentId: app.id,
                    customerName: app.fullName,
                    customerPhone: app.phone,
                    selectedServiceName: '',
                };

                // Auto-select service if appointment has serviceId
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
        }
    };

    // ── Submit ──
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const tech = staffs.find(s => s.uid === formData.technicianId);

        const ticketData: Record<string, unknown> = {
            appointmentId: formData.appointmentId || null,
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
            statusTimeline: editingTicket?.statusTimeline || [{ status: formData.status, timestamp: Date.now() }],
            issue: { description: formData.issueDescription, notes: formData.techNotes },
            timing: {
                receivedAt: editingTicket?.timing?.receivedAt || serverTimestamp(),
                estimatedReturnAt: formData.estimatedReturnDate
                    ? Timestamp.fromDate(new Date(formData.estimatedReturnDate))
                    : null,
            },
            payment: {
                status: formData.paymentStatus,
                partsCost: Number(formData.partsCost) || 0,
                laborCost: Number(formData.laborCost) || 0,
                amount: (Number(formData.partsCost) || 0) + (Number(formData.laborCost) || 0),
                depositAmount: Number(formData.depositAmount) || 0,
            },
            staff: {
                createdBy: editingTicket?.staff?.createdBy || user?.uid || '',
                createdByName: editingTicket?.staff?.createdByName || user?.displayName || 'Admin',
                assignedTechnician: formData.technicianId,
                assignedTechnicianName: tech?.displayName || '',
            },
            status: formData.status,
            updatedAt: serverTimestamp(),
        };

        try {
            if (editingTicket) {
                await updateDoc(doc(db, 'repairs', editingTicket.id), ticketData);
            } else {
                await addDoc(collection(db, 'repairs'), { ...ticketData, createdAt: serverTimestamp() });
                // Auto-complete the linked appointment
                if (formData.appointmentId) {
                    await updateDoc(doc(db, 'appointments', formData.appointmentId), {
                        status: 'completed',
                        updatedAt: serverTimestamp(),
                    });
                }
            }
            setShowModal(false);
        } catch (err) {
            console.error(err);
            alert('Có lỗi xảy ra!');
        }
    };

    // ── Delete ──
    const handleDelete = async (id: string) => {
        if (!confirm('Xóa phiếu này?')) return;
        try { await deleteDoc(doc(db, 'repairs', id)); } catch (e) { console.error(e); }
    };

    // ── Print ──
    const openPrint = (ticket: RepairTicket, mode: 'receipt' | 'invoice') => {
        setPrintTicket(ticket);
        setPrintMode(mode);
        setTimeout(() => window.print(), 400);
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
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
                <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Tìm tên, SĐT, IMEI, Model..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 h-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white">
                    <option value="all">Tất cả trạng thái</option>
                    {dynamicStatuses.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                </select>
                <select value={techFilter} onChange={e => setTechFilter(e.target.value)}
                    className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white">
                    <option value="all">Tất cả KTV</option>
                    {staffs.map(s => (
                        <option key={s.uid} value={s.uid}>{s.displayName}</option>
                    ))}
                </select>
            </div>

            {/* ── Table ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
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
                            ) : filtered.map(ticket => {
                                const st = dynamicStatuses.find(s => s.id === ticket.status) || { id: ticket.status, label: ticket.status, color: 'bg-gray-100 text-gray-700 border-gray-200', allowedNext: [] };
                                const StIcon = Clock; // Fallback generic icon
                                const pay = paymentLabels[ticket.payment?.status || 'unpaid'];
                                return (
                                    <tr key={ticket.id} className={`hover:bg-gray-50/50 transition-colors ${ticket.payment?.status === 'unpaid' ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                            #{ticket.id.slice(-6).toUpperCase()}
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
                                            <p className="text-xs text-gray-500 truncate max-w-[180px]">{ticket.issue?.description}</p>
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
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1 flex-wrap">
                                                {/* ═══ STATUS ACTIONS (ternary: terminal / done / normal) ═══ */}
                                                {TERMINAL_STATUSES.includes(ticket.status) ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[11px] font-semibold border border-gray-200">
                                                        🔒 Đã đóng ({st.label})
                                                    </span>
                                                ) : ticket.status === endGameTrigger ? (
                                                    <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                                                        <button onClick={() => setHandoverModal({ ticket, action: 'tra_may' })}
                                                            className="px-2 py-1.5 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                                                            ✅ Trả Máy
                                                        </button>
                                                        <button onClick={() => setHandoverModal({ ticket, action: 'out' })}
                                                            disabled={(ticket.payment?.depositAmount || 0) > 0 || ticket.payment?.status === 'paid'}
                                                            className="px-2 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                            title={(ticket.payment?.depositAmount || 0) > 0 || ticket.payment?.status === 'paid' ? 'Khách đã cọc, chọn Hoàn Phí' : 'Trả máy — không sửa được'}>
                                                            ⚪ Out
                                                        </button>
                                                        <button onClick={() => setHandoverModal({ ticket, action: 'hoan_phi' })}
                                                            disabled={(ticket.payment?.depositAmount || 0) === 0 && ticket.payment?.status === 'unpaid'}
                                                            className="px-2 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                            title={(ticket.payment?.depositAmount || 0) === 0 && ticket.payment?.status === 'unpaid' ? 'Chưa có tiền để hoàn, chọn Out' : 'Hoàn tiền cho khách'}>
                                                            🔴 Hoàn Phí
                                                        </button>
                                                    </div>
                                                ) : (
                                                    st.allowedNext?.map((nextId: string) => {
                                                        const nextCfg = dynamicStatuses.find(ds => ds.id === nextId);
                                                        if (!nextCfg) return null;
                                                        return (
                                                            <button key={nextId} onClick={() => handleQuickStatus(ticket, nextId)}
                                                                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${nextId === 'hoan_phi' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : nextId === 'out' ? 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100' : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200'}`}
                                                                title={`Chuyển → ${nextCfg.label}`}>
                                                                {nextId === 'hoan_phi' ? <X size={12} /> : <ArrowRight size={12} />}
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

                                                {/* ═══ ALWAYS VISIBLE: Print / Video / Edit ═══ */}
                                                <button onClick={() => openPrint(ticket, 'receipt')}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="In phiếu tiếp nhận">
                                                    <Printer size={16} />
                                                </button>
                                                {['done', 'da_tra_may', 'out'].includes(ticket.status) && (
                                                    <button onClick={() => openPrint(ticket, 'invoice')}
                                                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="In hóa đơn">
                                                        <FileText size={16} />
                                                    </button>
                                                )}
                                                {/* Upload Video Bàn Giao — luôn cho phép */}
                                                {['done', 'da_tra_may', 'out', 'hoan_phi'].includes(ticket.status) && (
                                                    ticket.postRepairMedia?.length > 0 ? (
                                                        <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-2 py-1 rounded-lg font-semibold flex items-center gap-1">
                                                            <CheckCircle2 size={10} /> Đã hoàn tất
                                                        </span>
                                                    ) : (
                                                        <label className="cursor-pointer p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Upload Video Bàn Giao">
                                                            <Camera size={16} />
                                                            <input type="file" accept="video/*,image/*" className="hidden"
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
                                                                        alert('Lỗi upload: ' + (err as Error).message);
                                                                    }
                                                                }} />
                                                        </label>
                                                    )
                                                )}
                                                {/* Edit — admin luôn sửa được; staff chỉ sửa phiếu chưa đóng */}
                                                {(!TERMINAL_STATUSES.includes(ticket.status) || user?.role?.toLowerCase() === 'admin' || user?.permissions?.includes('admin_only') || user?.email?.includes('admin')) && (
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
            </div>

            {/* ══════════  Delivery/Cancel Note Modal  ══════════ */}
            {noteModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${noteModal.targetStatus === 'hoan_phi' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">
                                    {noteModal.targetStatus === 'hoan_phi' ? 'Xác nhận Hoàn phí' : 'Bàn giao máy'}
                                </h3>
                                <p className="text-sm text-gray-500">#{noteModal.ticket.id.slice(-6).toUpperCase()} — {noteModal.ticket.customer.name}</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {noteModal.targetStatus === 'hoan_phi' ? 'Lý do hoàn phí *' : 'Ghi chú bàn giao *'}
                            </label>
                            <textarea
                                rows={3}
                                required
                                value={deliveryNote}
                                onChange={e => setDeliveryNote(e.target.value)}
                                placeholder={noteModal.targetStatus === 'hoan_phi'
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
                            <button onClick={handleNoteSubmit}
                                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg ${noteModal.targetStatus === 'hoan_phi' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>
                                {noteModal.targetStatus === 'hoan_phi' ? 'Xác nhận hoàn phí' : 'Xác nhận trả máy'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════  Create/Edit Modal  ══════════ */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between z-10">
                            <h3 className="font-bold text-lg text-gray-900">
                                {editingTicket ? 'Cập nhật phiếu' : 'Tạo phiếu sửa chữa'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* ── Appointment selector (only for new tickets) ── */}
                            {!editingTicket && (
                                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-blue-800 mb-2">
                                        <Calendar size={16} /> Tạo từ lịch hẹn (tùy chọn)
                                    </label>
                                    <select
                                        value={formData.appointmentId}
                                        onChange={e => handleAppointmentSelect(e.target.value)}
                                        className="w-full px-4 py-2 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-300/30"
                                    >
                                        <option value="">— Nhập tay —</option>
                                        {appointments.map(a => (
                                            <option key={a.id} value={a.id}>
                                                {a.fullName} — {a.phone} — {new Date(a.date).toLocaleDateString('vi-VN')}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

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
                                    {formData.selectedServiceName ? (
                                        /* Service pre-selected from appointment booking */
                                        <>
                                            <label className="block text-sm font-medium text-orange-800 mb-1">Dịch vụ đã chọn từ lịch hẹn</label>
                                            <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-lg border border-orange-200">
                                                <span className="inline-flex items-center gap-2 font-medium text-gray-900">
                                                    <Wrench size={16} className="text-orange-500" />
                                                    {formData.selectedServiceName}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(p => ({ ...p, selectedServiceName: '' }))}
                                                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                                                >
                                                    Đổi dịch vụ
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        /* No service pre-selected — let admin choose */
                                        <>
                                            <label className="block text-sm font-medium text-orange-800 mb-1">Chọn nhóm dịch vụ (Category)</label>
                                            <select
                                                value={formData.selectedServiceName}
                                                onChange={e => {
                                                    setFormData(p => ({
                                                        ...p,
                                                        selectedServiceName: e.target.value,
                                                    }));
                                                }}
                                                className="w-full px-4 py-2 border border-orange-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-300/30"
                                            >
                                                <option value="">— Chọn nhóm dịch vụ —</option>
                                                {Array.from(new Set(services.filter(s => s.isActive !== false && s.category).map(s => s.category as string))).map(cat => (
                                                    <option key={cat} value={cat}>
                                                        {cat}
                                                    </option>
                                                ))}
                                            </select>
                                        </>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả lỗi *</label>
                                    <textarea rows={3} required value={formData.issueDescription}
                                        onChange={e => setFormData(p => ({ ...p, issueDescription: e.target.value }))}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú kỹ thuật</label>
                                    <textarea rows={2} value={formData.techNotes}
                                        onChange={e => setFormData(p => ({ ...p, techNotes: e.target.value }))}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                            </fieldset>

                            <hr className="border-gray-100" />

                            {/* ── Checklist kiểm tra đầu vào ── */}
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
                                                value={(formData as Record<string, unknown>)[item.key] as string}
                                                onChange={e => setFormData(p => ({ ...p, [item.key]: e.target.value }))}
                                                className={`w-full text-xs px-2 py-1.5 border rounded-md bg-white ${(formData as Record<string, unknown>)[item.key] === 'OK' ? 'border-green-300 text-green-700'
                                                    : (formData as Record<string, unknown>)[item.key] === 'Lỗi' ? 'border-red-300 text-red-700'
                                                        : 'border-yellow-300 text-yellow-700'
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
                                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                                            <img src={url} alt="" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => setPreMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">×</button>
                                        </div>
                                    ))}
                                    <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors">
                                        <Upload size={18} className="text-gray-400" />
                                        <span className="text-[10px] text-gray-400 mt-0.5">Thêm</span>
                                        <input type="file" accept="image/*,video/*" multiple className="hidden"
                                            onChange={async (e) => {
                                                const files = Array.from(e.target.files || []);
                                                if (!files.length) return;
                                                setUploadingMedia(true);
                                                try {
                                                    const urls = await Promise.all(files.map(f => uploadImage(f, 'repairs/pre')));
                                                    setPreMediaFiles(prev => [...prev, ...urls]);
                                                } catch (err) { console.error(err); alert('Lỗi upload!'); }
                                                finally { setUploadingMedia(false); }
                                            }} />
                                    </label>
                                    {uploadingMedia && <Loader2 className="animate-spin text-orange-500" size={20} />}
                                </div>
                            </fieldset>

                            {/* ── Media Upload: Ảnh/Video sau sửa (chỉ hiển khi Done/Out/Hoàn Phí) ── */}
                            {['done', 'out', 'hoan_phi'].includes(formData.status) && (
                                <>
                                    <hr className="border-gray-100" />
                                    <fieldset className="space-y-3">
                                        <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                            <Video size={18} className="text-green-500" /> Ảnh/Video sau sửa chữa
                                        </legend>
                                        <div className="flex flex-wrap gap-2">
                                            {postMediaFiles.map((url, i) => (
                                                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                                    <button type="button" onClick={() => setPostMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">×</button>
                                                </div>
                                            ))}
                                            <label className="w-20 h-20 border-2 border-dashed border-green-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors">
                                                <Upload size={18} className="text-gray-400" />
                                                <span className="text-[10px] text-gray-400 mt-0.5">Thêm</span>
                                                <input type="file" accept="image/*,video/*" multiple className="hidden"
                                                    onChange={async (e) => {
                                                        const files = Array.from(e.target.files || []);
                                                        if (!files.length) return;
                                                        setUploadingMedia(true);
                                                        try {
                                                            const urls = await Promise.all(files.map(f => uploadImage(f, 'repairs/post')));
                                                            setPostMediaFiles(prev => [...prev, ...urls]);
                                                        } catch (err) { console.error(err); alert('Lỗi upload!'); }
                                                        finally { setUploadingMedia(false); }
                                                    }} />
                                            </label>
                                        </div>
                                    </fieldset>
                                </>
                            )}

                            <hr className="border-gray-100" />

                            {/* ── Payment & Timing & Assignment ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><DollarSign size={18} className="text-orange-500" /> Thanh toán & Phân công</legend>
                                <div className="grid md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tiền linh kiện (VNĐ)</label>
                                        <input type="number" value={formData.partsCost || ''}
                                            onChange={e => setFormData(p => ({ ...p, partsCost: Number(e.target.value) }))}
                                            placeholder="0"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tiền công thợ (VNĐ)</label>
                                        <input type="number" value={formData.laborCost || ''}
                                            onChange={e => setFormData(p => ({ ...p, laborCost: Number(e.target.value) }))}
                                            placeholder="0"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tổng cộng</label>
                                        <div className="w-full px-4 py-2 border rounded-lg bg-gray-50 font-bold text-orange-600">
                                            {((Number(formData.partsCost) || 0) + (Number(formData.laborCost) || 0)).toLocaleString('vi-VN')}đ
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Đặt cọc (VNĐ)</label>
                                        <input type="number" value={formData.depositAmount || ''}
                                            onChange={e => setFormData(p => ({ ...p, depositAmount: Number(e.target.value) }))}
                                            placeholder="0"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái TT</label>
                                        <select value={formData.paymentStatus}
                                            onChange={e => setFormData(p => ({ ...p, paymentStatus: e.target.value as PaymentStatus }))}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 bg-white">
                                            <option value="unpaid">Chưa thanh toán</option>
                                            <option value="deposit">Đã đặt cọc</option>
                                            <option value="paid">Đã thanh toán</option>
                                            <option value="pay_later">Thanh toán sau</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái phiếu</label>
                                        <select value={formData.status}
                                            onChange={e => setFormData(p => ({ ...p, status: e.target.value as RepairStatus }))}
                                            disabled={!!editingTicket && !(user?.role?.toLowerCase() === 'admin' || user?.permissions?.includes('admin_only') || user?.email?.includes('admin'))}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 bg-white disabled:bg-gray-100 disabled:opacity-70 disabled:cursor-not-allowed">
                                            {dynamicStatuses.map(s => (
                                                <option key={s.id} value={s.id}>{s.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Kỹ thuật viên</label>
                                        <select value={formData.technicianId}
                                            onChange={e => setFormData(p => ({ ...p, technicianId: e.target.value }))}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 bg-white">
                                            <option value="">— Chọn —</option>
                                            {staffs.map(s => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ngày trả dự kiến</label>
                                        <input type="date" value={formData.estimatedReturnDate}
                                            onChange={e => setFormData(p => ({ ...p, estimatedReturnDate: e.target.value }))}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                </div>
                            </fieldset>

                            <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white pb-2">
                                {editingTicket && (
                                    <button type="button" onClick={() => handleDelete(editingTicket.id)}
                                        className="mr-auto px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                                        Xóa phiếu
                                    </button>
                                )}
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Hủy bỏ</button>
                                <button type="submit"
                                    className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 flex items-center gap-2">
                                    <Save size={18} /> Lưu phiếu
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══════════  Print Template  ══════════ */}
            {printTicket && <PrintableReceipt ticket={printTicket} receiptConfig={receiptConfig} />}

            {/* ═══ Handover Confirmation Modal ═══ */}
            {handoverModal && (() => {
                const t = handoverModal.ticket;
                const deposit = t.payment?.depositAmount || 0;
                const total = t.payment?.amount || 0;
                const remaining = total - deposit;
                const action = handoverModal.action;

                const titles: Record<string, string> = {
                    tra_may: '✅ Xác nhận Trả Máy',
                    out: '⚪ Xác nhận Out (Không sửa được)',
                    hoan_phi: '🔴 Xác nhận Hoàn Phí',
                };
                const colors: Record<string, string> = {
                    tra_may: 'bg-emerald-500 hover:bg-emerald-600',
                    out: 'bg-gray-500 hover:bg-gray-600',
                    hoan_phi: 'bg-red-500 hover:bg-red-600',
                };

                return (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                            <div className={`px-6 py-4 rounded-t-2xl text-white ${action === 'tra_may' ? 'bg-emerald-600' : action === 'hoan_phi' ? 'bg-red-600' : 'bg-gray-600'}`}>
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    {action === 'tra_may' ? <CheckCircle2 size={20} /> : action === 'hoan_phi' ? <RotateCcw size={20} /> : <Ban size={20} />}
                                    {titles[action]}
                                </h2>
                                <p className="text-sm opacity-80 mt-0.5">
                                    Khách hàng: <b>{t.customer.name}</b> — Thiết bị: <b>{t.deviceInfo?.model}</b>
                                </p>
                            </div>

                            <div className="px-6 py-5 space-y-4">
                                {/* Payment Summary */}
                                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Tổng phí sửa chữa:</span>
                                        <span className="font-bold">{formatPrice(total)}</span>
                                    </div>
                                    {deposit > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Đã đặt cọc:</span>
                                            <span className="font-semibold text-yellow-600">-{formatPrice(deposit)}</span>
                                        </div>
                                    )}
                                    {action === 'tra_may' && remaining > 0 && (
                                        <div className="flex justify-between items-center text-sm border-t pt-3 mt-2 font-bold bg-emerald-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl border-emerald-100 border">
                                            <span className="text-gray-700">SỐ TIỀN CẦN THU THÊM:</span>
                                            <span className="text-red-600 text-xl">{formatPrice(remaining)}</span>
                                        </div>
                                    )}
                                    {action === 'tra_may' && remaining <= 0 && (
                                        <div className="flex justify-between items-center text-sm border-t pt-3 mt-2 font-bold bg-emerald-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl border-emerald-100 border">
                                            <span className="text-gray-700">✅ Đã thu đủ:</span>
                                            <span className="text-emerald-600 text-xl">{formatPrice(total)}</span>
                                        </div>
                                    )}
                                    {action === 'hoan_phi' && (
                                        <div className="flex justify-between items-center text-sm border-t pt-3 mt-2 font-bold bg-red-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                                            <span className="text-red-700">SỐ TIỀN CẦN HOÀN TRẢ KHÁCH:</span>
                                            <span className="text-red-600 text-xl">{formatPrice(deposit > 0 ? deposit : total)}</span>
                                        </div>
                                    )}
                                    {action === 'out' && (
                                        <div className="text-sm text-gray-500 border-t pt-2 mt-2 italic flex items-center justify-center gap-2">
                                            <Ban size={16} />
                                            Trả lại máy, không thu phí.
                                        </div>
                                    )}
                                </div>

                                {/* Financial Checkbox for tra_may */}
                                {action === 'tra_may' && remaining > 0 && (
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

                                {/* Note */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú bàn giao</label>
                                    <textarea value={handoverNote} onChange={e => setHandoverNote(e.target.value)}
                                        rows={2} placeholder="VD: Máy đã sửa xong, giao cho khách lúc 15h..."
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-sm" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 px-6 py-4 border-t">
                                <button onClick={() => { setHandoverModal(null); setHandoverNote(''); setPaymentConfirmed(false); }}
                                    className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>

                                <button onClick={handleHandover}
                                    disabled={action === 'tra_may' && remaining > 0 && !paymentConfirmed}
                                    className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 ${colors[action]} disabled:opacity-50 disabled:cursor-not-allowed`}>
                                    <CheckCircle2 size={16} />
                                    {action === 'tra_may' ? 'Xác nhận Bàn Giao' : action === 'hoan_phi' ? 'Xác nhận Hoàn phí' : 'Xác nhận Out'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {/* ══════════  Detail View Modal (Eye Icon)  ══════════ */}
            {viewingTicket && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden" onClick={() => setViewingTicket(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">{viewingTicket.deviceInfo?.model || 'Thiết bị'}</h2>
                                <p className="text-xs text-gray-500">#{viewingTicket.id.slice(-6).toUpperCase()} • {viewingTicket.customer?.name}</p>
                            </div>
                            <button onClick={() => setViewingTicket(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>

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
                                {viewingTicket.issue?.description && (
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

                            {/* Checklist */}
                            {viewingTicket.deviceInfo?.checklist && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><CheckCircle2 size={12} /> Checklist kiểm tra</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(viewingTicket.deviceInfo.checklist)
                                            .filter(([k]) => !['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts'].includes(k))
                                            .map(([key, val]) => (
                                                <div key={key} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 border">
                                                    <span className="text-gray-500">{
                                                        key === 'body' ? 'Vỏ máy' :
                                                            key === 'screen' ? 'Màn hình' :
                                                                key === 'touch' ? 'Cảm ứng' :
                                                                    key === 'camera' ? 'Camera' :
                                                                        key === 'speaker' ? 'Loa/Mic' :
                                                                            key === 'connectivity' ? 'Kết nối' :
                                                                                key === 'battery' ? 'Pin' :
                                                                                    key === 'biometric' ? 'FaceID/Vân tay' : key
                                                    }:</span>
                                                    <span className="ml-1 font-medium text-gray-800">{val as string || '—'}</span>
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
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Video size={12} /> Video bàn giao</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {viewingTicket.postRepairMedia.map((url, i) => (
                                            <div key={i} className="rounded-lg overflow-hidden bg-gray-100 border">
                                                {url.includes('.mp4') || url.includes('video') ? (
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
                                                    {new Date(entry.timestamp).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                    </div>
                </div>
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
