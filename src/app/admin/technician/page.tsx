'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
import {
    Wrench, Smartphone, Search, Eye, ChevronRight, Clock,
    CheckCircle2, Loader2, Image as ImageIcon, Video, AlertCircle, X, Package, Trash2,
    User as UserIcon, ArrowRightLeft, ShieldAlert
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { isChecklistComplete, isYouTubeUrl, getYouTubeEmbedUrl, areAllPartsReady } from '@/lib/workflowFeatures';
import type { RepairTicket, Product, WorkflowNode } from '@/lib/types';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { PART_CATEGORY_LABEL, isPartCategory } from '@/lib/constants';
import { REPAIR_PART_STATUS, REPAIR_STATUS, isPendingRepairPart, isRepairPartStatus, isRepairStatus } from '@/lib/repairStatus';
import Modal from '@/components/admin/Modal';
import { buildProductCodeFromId } from '@/lib/productCodes';
import { createProductWithCodes } from '@/lib/productCodeRegistry';
import { isRepairManager } from '@/lib/repairAccess';
import { normalizeRepairWorkflow, normalizeWarrantyWorkflow } from '@/lib/repairWorkflowConfig';


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

    // Status confirm modal state
    const [statusConfirmModal, setStatusConfirmModal] = useState<{ ticketId: string; newStatus: string } | null>(null);
    const [isStatusChanging, setIsStatusChanging] = useState(false);

    // Tech Note Modal State
    const [noteModalPayload, setNoteModalPayload] = useState<{ ticketId: string, newStatus: string, currentNote: string } | null>(null);
    const [techNoteText, setTechNoteText] = useState('');

    // Part Selection State
    const [partSearchQuery, setPartSearchQuery] = useState('');
    const [partSearchResults, setPartSearchResults] = useState<Product[]>([]);
    const [isSearchingParts, setIsSearchingParts] = useState(false);
    const [selectedPartQuality, setSelectedPartQuality] = useState('Zin');
    const [customPartName, setCustomPartName] = useState('');

    const [dynamicStatuses, setDynamicStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);
    const [technicians, setTechnicians] = useState<{ uid: string; displayName: string }[]>([]);
    const [userNamesMap, setUserNamesMap] = useState<Record<string, string>>({});
    const [transferModal, setTransferModal] = useState<{ ticket: RepairTicket } | null>(null);
    const [transferTechnicianId, setTransferTechnicianId] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [isTransferSubmitting, setIsTransferSubmitting] = useState(false);

    const getWorkflowForTicket = (ticket: RepairTicket): WorkflowNode[] => {
        return ticket.ticketType === 'warranty' ? warrantyStatuses : dynamicStatuses;
    };

    // (Handover moved to repairs/cashier page)

    // Search parts — server-side Firestore query (BUG-INV-003 fix)
    useEffect(() => {
        if (!partSearchQuery.trim()) {
            setPartSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingParts(true);
            try {
                // Normalize query the same way as generateSearchKeywords
                const normalizedQ = normalizePartSearch(partSearchQuery);

                if (!normalizedQ) {
                    setPartSearchResults([]);
                    return;
                }

                // Server-side: query only parts matching the keyword
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

    // Add part to ticket directly via API
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

    // Request part (out of stock) via API
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

    // Request custom part (not in inventory) via API
    const handleAddCustomPart = async (ticket: RepairTicket) => {
        if (!customPartName.trim()) return;

        try {
            const exactName = customPartName.trim();
            
            // Find existing proposed product with this name
            const productsRef = collection(db, 'products');
            const q = query(productsRef, where('name', '==', exactName), where('isProposed', '==', true));
            const querySnapshot = await getDocs(q);

            let productIdToUse = '';
            let productNameToUse = exactName;

            if (!querySnapshot.empty) {
                const existingDoc = querySnapshot.docs[0];
                productIdToUse = existingDoc.id;
                productNameToUse = existingDoc.data().name;
            } else {
                // If no proposed product, check if admin already imported it into inventory
                const qExist = query(productsRef, where('name', '==', exactName));
                const existSnap = await getDocs(qExist);
                if (!existSnap.empty) {
                    const existingDoc = existSnap.docs[0];
                    productIdToUse = existingDoc.id;
                    productNameToUse = existingDoc.data().name;
                } else {
                    // Create new proposed product
                    const newProdRef = doc(productsRef);
                    const productCode = buildProductCodeFromId(newProdRef.id, 'component');
                    await createProductWithCodes(newProdRef.id, {
                        sku: productCode,
                        barcode: productCode,
                        productCode,
                        name: exactName,
                        category: '',
                        categoryIds: [],
                        price_original: 0,
                        price_promo: 0,
                        costPrice: 0,
                        stock: 0,
                        status: 'hidden',
                        isProposed: true,
                    }, [productCode]);
                    productIdToUse = newProdRef.id;
                }
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
                        type: 'request_part',
                        productId: productIdToUse,
                        customName: productNameToUse,
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
        const unsubTickets = onSnapshot(query(collection(db, 'repairs'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as RepairTicket[];
            setTickets(data);
            setLoading(false);
        });

        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setDynamicStatuses(normalizeRepairWorkflow(data.repairStatuses));
                setWarrantyStatuses(normalizeWarrantyWorkflow(data.warrantyStatuses));
            }
        });

        return () => {
            unsubTickets();
            unsubStatuses();
        };
    }, [user?.uid, user?.role]);

    useEffect(() => {
        getDocs(query(collection(db, 'users'), where('role', '==', 'staff')))
            .then(snap => setTechnicians(snap.docs
                .filter(item => Array.isArray(item.data().permissions) && item.data().permissions.includes('manage_repairs'))
                .map(item => ({ uid: item.id, displayName: item.data().displayName || 'Kỹ thuật viên' }))))
            .catch(error => console.error('Load technicians error:', error));

        // Fetch user names map to resolve IDs in Timeline
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
            // Block terminal states
            if (currentCfg?.isTerminal) {
                toastError('Phiếu đã đóng, không thể thay đổi trạng thái!');
                return;
            }

            // Block KTV from changing status when ticket is waiting for handover (cashier's job)
            if (isRepairStatus(ticket.status, REPAIR_STATUS.CUSTOMER_HANDOVER)) {
                toastWarning('Phiếu đang chờ bàn giao cho khách. Vui lòng liên hệ thu ngân để xử lý.');
                return;
            }

            // Warn (but allow) transitioning without parts selection
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

            // ── Check requirePartsReady ──
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

            // ── Payment gate: KTV không xử lý bàn giao, chỉ chuyển trạng thái bình thường ──
            // (requirePaymentGate is handled by cashier in repairs/page.tsx)

            // --- INTERCEPT: Manager Override ---
            const isAssignedKTV = ticket.staff?.assignedTechnician === user?.uid;
            const isManager = isRepairManager(user);

            if (ticket.staff?.assignedTechnician && !isAssignedKTV && isManager) {
                // If it's a manager override, force them to enter a note/reason if they haven't already
                setTechNoteText(ticket.issue?.notes || '');
                setNoteModalPayload({ ticketId, newStatus, currentNote: ticket.issue?.notes || '' });
                return;
            }

            // --- INTERCEPT: If transitioning OUT of "dang_kiem_tra", require Tech Notes ---
            if (isRepairStatus(ticket.status, REPAIR_STATUS.INSPECTION) && newStatus !== REPAIR_STATUS.INSPECTION) {
                setTechNoteText(ticket.issue?.notes || '');
                setNoteModalPayload({ ticketId, newStatus, currentNote: ticket.issue?.notes || '' });
                return;
            }

            // Normal flow (if not intercepting)
            await finalizeStatusChange(ticket, newStatus, ticket.issue?.notes);

        } catch (err) {
            console.error('Status check error:', err);
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

            await finalizeStatusChange(ticket, noteModalPayload.newStatus, techNoteText);
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

    // (handleTechHandover removed — handover is managed by cashier in repairs/page.tsx)

    const formatPrice = (p: number) => p > 0 ? p.toLocaleString('vi-VN') + 'đ' : '—';



    // ── Inline checklist update ──
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
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Wrench className="text-orange-500" /> Khu vực Kỹ thuật viên
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {tickets.filter(t => t.status === 'dang_sua_chua').length} máy đang sửa •
                        {' '}{tickets.filter(t => isRepairStatus(t.status, REPAIR_STATUS.DONE)).length} máy chờ trả
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input title="Tìm máy, khách..." type="text" placeholder="Tìm máy, khách..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:border-orange-500 focus:outline-none" />
                    </div>
                    <div className="hidden sm:flex bg-gray-100 rounded-lg p-0.5">
                        <button title="Xem danh sách" onClick={() => setViewMode('list')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                            Danh sách
                        </button>
                        <button title="Xem kanban" onClick={() => setViewMode('kanban')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                            Kanban
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ LIST VIEW ═══ */}
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
                        const isTerminal = isRepairStatus(ticket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!currentCfg?.isTerminal;
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
                                {/* KTV Badge */}
                                <div className="absolute top-2 right-2 flex items-center gap-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2 py-0.5 text-[10px] font-medium max-w-[140px]">
                                    <UserIcon size={10} className="flex-shrink-0" />
                                    <span className="truncate">{ticket.staff?.assignedTechnicianName || 'Chưa phân công'}</span>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 mt-4">
                                    {/* Device Icon */}
                                    <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center flex-shrink-0">
                                        <Smartphone size={20} className="text-gray-600" />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p title="Máy" className="font-bold text-gray-900">{ticket.deviceInfo?.model || 'Thiết bị'}</p>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${st.color}`}>
                                                {st.label}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                            <span title="Mã phiếu">#{ticket.id.slice(-6).toUpperCase()}</span>
                                            {ticket.ticketType === 'warranty' && (
                                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold">BH</span>
                                            )}
                                            <span title="Khách hàng">• {ticket.customer?.name}</span>
                                        </div>
                                        {ticket.issues && ticket.issues.length > 0 ? (
                                            <p title="Vấn đề" className="text-sm text-gray-600 mt-1 line-clamp-1">{ticket.issues.map(i => i.label).join(', ')}</p>
                                        ) : ticket.issue?.description && (
                                            <p className="text-sm text-gray-600 mt-1 line-clamp-1">{ticket.issue.description}</p>
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

                                        {/* Parts summary badge row */}
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
                                                                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                                                        isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
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

                                        {/* Inline Checklist (editable dropdowns) - only when feature enabled */}
                                        {st?.allowedFeatures?.includes('requireChecklist') && (
                                        <div className="mt-3 border-t pt-2">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 flex items-center gap-1"><CheckCircle2 size={10} /> Checklist kiểm tra</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                {Object.keys(checklistLabels).map(key => {
                                                    const val = (ticket.deviceInfo?.checklist as Record<string, string> | undefined)?.[key] || '';
                                                    return (
                                                        <div key={key} className="flex flex-col">
                                                            <label className="text-[12px] text-gray-500 mb-0.5 truncate">{checklistLabels[key]}</label>
                                                            <select
                                                                value={val}
                                                                onClick={e => e.stopPropagation()}
                                                                onChange={e => handleChecklistUpdate(ticket.id, key, e.target.value)}
                                                                disabled={isReadOnly}
                                                                aria-label={`Checklist: ${checklistLabels[key]}`}
                                                                title={`Checklist: ${checklistLabels[key]}`}
                                                                className={`min-h-11 text-sm px-2 py-2 rounded-md border cursor-pointer transition-all appearance-none text-center font-medium ${
                                                                    val === 'OK' ? 'bg-green-50 border-green-300 text-green-700' :
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
                                            {/* Device history flags */}
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {(['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts'] as const).map(key => {
                                                    const labels: Record<string, string> = { hasPriorRepair: 'Đã từng sửa', hasWaterDamage: 'Vào nước', hasNonGenuineParts: 'Kém/Lô' };
                                                    const val = !!(ticket.deviceInfo?.checklist as Record<string, boolean> | undefined)?.[key];
                                                    return (
                                                        <button key={key} onClick={(e) => { e.stopPropagation(); if (!isReadOnly) handleHistoryToggle(ticket.id, key, val); }}
                                                            disabled={isReadOnly}
                                                            className={`text-xs px-1.5 py-0.5 rounded-md border transition-all ${isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${val ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'
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

                                    {/* Actions */}
                                    <div className="grid grid-cols-2 gap-2 w-full sm:w-40 sm:flex sm:flex-col flex-shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }}
                                            className="min-h-11 px-3 py-2 border bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium" title="Xem chi tiết"
                                        >
                                            <Eye size={16} className="text-gray-500" /> Chi tiết
                                        </button>

                                        {canRequestTransfer && (
                                            <button
                                                onClick={(event) => { event.stopPropagation(); setTransferModal({ ticket }); setTransferTechnicianId(''); setTransferReason(''); }}
                                                className="min-h-11 px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold"
                                            >
                                                <ArrowRightLeft size={16} /> Chuyển KTV
                                            </button>
                                        )}

                                        {pendingTransfer && (pendingTransfer.requestedBy === user?.uid || isRepairManager(user)) && (
                                            <button
                                                onClick={(event) => { event.stopPropagation(); handleTransferCancel(ticket); }}
                                                className="min-h-11 px-3 py-2 border border-red-200 bg-red-50 text-red-700 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold"
                                            >
                                                <X size={16} /> Hủy chuyển
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
                                                    {/* Dynamic Transition Button for Báo Giá */}
                                                    {!isReadOnly && st?.allowedFeatures?.includes('allowPartsSelection') ? (() => {
                                                        const hasRequestedParts = ticket.parts?.length === 0 || ticket.parts?.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED));
                                                        const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                                                        const targetStatus = workflow.find(ds => ds.id === targetStatusId);

                                                        if (!targetStatus) return null;
                                                        return (
                                                            <button onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, targetStatus.id); }}
                                                                className={`text-[10px] px-2 py-1 bg-white border rounded-lg font-medium transition-all flex items-center gap-1 w-full justify-between hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600`}>
                                                                {hasRequestedParts ? 'Tìm linh kiện' : targetStatus.label}
                                                                <ChevronRight size={10} />
                                                            </button>
                                                        );
                                                    })() : !isReadOnly && st.allowedNext?.map((nextId: string) => {
                                                        const nextCfg = workflow.find(ds => ds.id === nextId);
                                                        if (!nextCfg) return null;
                                                        return (
                                                            <button key={nextId} onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, nextId); }}
                                                                className={`text-[10px] px-2 py-1 bg-white border rounded-lg font-medium transition-all flex items-center gap-1 w-full justify-between ${nextId === 'refund' ? 'hover:bg-red-50 hover:border-red-300 hover:text-red-600' : nextId === 'out' ? 'hover:bg-gray-50 hover:border-gray-300 hover:text-gray-600' : 'hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600'}`}>
                                                                {nextCfg.label}
                                                                {nextId === 'refund' ? <X size={10} /> : <ChevronRight size={10} />}
                                                            </button>
                                                        );
                                                    })}
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

            {/* ═══ KANBAN VIEW ═══ */}
            {viewMode === 'kanban' && (
                <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
                    {Array.from(new Map(
                        [...dynamicStatuses, ...warrantyStatuses]
                            .filter(s => !s.isTerminal && s.id !== 'cho_tiep_nhan' && s.id !== 'bh_tiep_nhan')
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
                                        const isTerminal = isRepairStatus(ticket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!st?.isTerminal;
                                        const isAssignedToMe = ticket.staff?.assignedTechnician === user?.uid;
                                        const isIncomingTransferToMe = ticket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && ticket.pendingTechnicianTransfer?.status === 'pending';
                                        const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                                        const isReadOnly = isTerminal || isKtvLocked;

                                        return (
                                            <div key={ticket.id} className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow relative group">
                                                {/* KTV Badge */}
                                                <div className="flex items-center gap-1 text-[9px] font-medium text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-1.5 py-px mb-1.5 w-fit max-w-full">
                                                    <UserIcon size={9} className="flex-shrink-0" />
                                                    <span className="truncate">{ticket.staff?.assignedTechnicianName || 'Chưa phân công'}</span>
                                                </div>
                                                <div className="flex items-start justify-between mb-1">
                                                    <p className="font-semibold text-sm text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1 pr-6">{ticket.deviceInfo?.model || 'Thiết bị'}</p>
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
                                                    <p className="text-[10px] text-gray-500 font-mono">#{ticket.id.slice(-6).toUpperCase()}</p>
                                                    {ticket.ticketType === 'warranty' && (
                                                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[9px] rounded-full font-bold">BH</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-gray-600 mt-0.5 max-w-full truncate">{ticket.customer?.name}</p>
                                                {ticket.issues && ticket.issues.length > 0 ? (
                                                    <p className="text-[11px] text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-1.5 rounded">{ticket.issues.map(i => i.label).join(', ')}</p>
                                                ) : ticket.issue?.description && (
                                                    <p className="text-[11px] text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-1.5 rounded">{ticket.issue.description}</p>
                                                )}

                                                {/* Inline Checklist (compact dropdown for kanban) - only when feature enabled */}
                                                {st?.allowedFeatures?.includes('requireChecklist') && (
                                                <div className="mt-2 pt-2 border-t">
                                                    <div className="grid grid-cols-2 gap-0.5">
                                                        {Object.keys(checklistLabels).map(key => {
                                                            const val = (ticket.deviceInfo?.checklist as Record<string, string> | undefined)?.[key] || '';
                                                            return (
                                                                <div key={key} className="flex items-center gap-0.5">
                                                                    <span className="text-[7px] text-gray-500 w-[38px] truncate">{checklistLabels[key]}</span>
                                                                    <select
                                                                        value={val}
                                                                        onClick={e => e.stopPropagation()}
                                                                        onChange={e => handleChecklistUpdate(ticket.id, key, e.target.value)}
                                                                        disabled={isReadOnly}
                                                                        aria-label={`Checklist (kanban): ${checklistLabels[key]}`}
                                                                        title={`Checklist (kanban): ${checklistLabels[key]}`}
                                                                        className={`text-[8px] flex-1 px-0.5 py-px rounded border cursor-pointer appearance-none ${
                                                                            val === 'OK' ? 'bg-green-50 border-green-200 text-green-700' :
                                                                            val === 'Lỗi' ? 'bg-red-50 border-red-200 text-red-600' :
                                                                            val ? 'bg-orange-50 border-orange-200 text-orange-600' :
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
                                                </div>
                                                )}

                                                {/* Actions */}
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
                                                            {/* Dynamic Transition Button for Báo Giá */}
                                                            {st?.allowedFeatures?.includes('allowPartsSelection') ? (() => {
                                                                const hasRequestedParts = ticket.parts?.length === 0 || ticket.parts?.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED));
                                                                const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                                                                const targetStatus = workflow.find(ds => ds.id === targetStatusId);

                                                                if (!targetStatus) return null;
                                                                return (
                                                                    <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                                        <button onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, targetStatus.id); }}
                                                                            className={`w-full justify-between flex items-center gap-1 text-[11px] px-2 py-1.5 border rounded-md font-medium transition-all bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-500 hover:text-white`}>
                                                                            Chuyển sang {hasRequestedParts ? 'Tìm linh kiện' : targetStatus.label}
                                                                            <ChevronRight size={12} />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })() : (st?.allowedNext && st.allowedNext.length > 0) && (
                                                                <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                                    {st?.allowedNext?.map((nextId: string) => {
                                                                        const nextCfg = workflow.find(ds => ds.id === nextId);
                                                                        if (!nextCfg) return null;
                                                                        return (
                                                                            <button key={nextId} onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, nextId); }}
                                                                                className={`w-full justify-between flex items-center gap-1 text-[11px] px-2 py-1.5 border rounded-md font-medium transition-all ${nextId === 'refund' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-500 hover:text-white' : nextId === 'out' ? 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-500 hover:text-white' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-500 hover:text-white'}`}>
                                                                                Chuyển sang {nextCfg.label}
                                                                                {nextId === 'refund' ? <X size={12} /> : <ChevronRight size={12} />}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
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

            {/* ═══ DETAIL MODAL ═══ */}
            {selectedTicket && (
                <Modal
                    isOpen={true}
                    onClose={() => setSelectedTicket(null)}
                    title={`${selectedTicket.deviceInfo?.model || 'Thiết bị'} — #${selectedTicket.id.slice(-6).toUpperCase()}`}
                    size="lg"
                >
                    <div className="p-5 space-y-4">
                            {/* Read-Only Guard / Transfer Lock Guard */}
                            {(() => {
                                const workflow = getWorkflowForTicket(selectedTicket);
                                const currentCfg = workflow.find(s => s.id === selectedTicket.status);
                                const isTerminalReadOnly = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!currentCfg?.isTerminal;

                                const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                                const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                                const isKtvLocked = user?.role !== 'admin' && !isAssignedToMe;

                                if (isTerminalReadOnly) {
                                    return (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800 font-medium flex items-center gap-2">
                                            <AlertCircle size={16} /> Phiếu đã hoàn tất kỹ thuật — Chỉ xem, không thể chỉnh sửa.
                                        </div>
                                    );
                                }

                                if (isIncomingTransferToMe) {
                                    return (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                                            <p className="text-sm text-emerald-800 font-medium flex items-center gap-2 mb-2">
                                                <AlertCircle size={16} /> Phiếu đang chờ bạn tiếp nhận. Bạn không thể chỉnh sửa cho đến khi bấm &quot;Nhận phiếu&quot;.
                                            </p>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleTransferResponse(selectedTicket, 'accepted')} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700">Nhận phiếu</button>
                                                <button onClick={() => handleTransferResponse(selectedTicket, 'rejected')} className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200">Từ chối</button>
                                            </div>
                                        </div>
                                    );
                                }

                                if (isKtvLocked) {
                                    return (
                                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-800 font-medium flex items-center gap-2">
                                            <AlertCircle size={16} /> Bạn không có quyền chỉnh sửa. Phiếu này đã được chuyển giao cho người khác.
                                        </div>
                                    );
                                }

                                return null;
                            })()}
                            {/* Status */}
                            {(() => {
                                const workflow = getWorkflowForTicket(selectedTicket);
                                const st = workflow.find(s => s.id === selectedTicket.status) || { id: selectedTicket.status, label: selectedTicket.status, color: 'text-gray-700 bg-gray-50 border-gray-200' };
                                return (
                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${st.color}`}>
                                        {st.label}
                                    </div>
                                );
                            })()}

                            {/* Issue */}
                            {selectedTicket.issues && selectedTicket.issues.length > 0 ? (
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Danh sách lỗi</p>
                                    <div className="space-y-1">
                                        {selectedTicket.issues.map((iss, idx) => (
                                            <div key={iss.id || idx} className="flex justify-between text-sm">
                                                <span className="text-gray-800">{idx + 1}. {iss.label}</span>
                                                {iss.estimatedPrice > 0 && <span className="text-gray-400 text-xs">~{iss.estimatedPrice.toLocaleString('vi-VN')}đ</span>}
                                            </div>
                                        ))}
                                    </div>
                                    {selectedTicket.issue?.notes && (
                                        <p className="text-xs text-gray-500 mt-2 pt-2 border-t">Ghi chú: {selectedTicket.issue.notes}</p>
                                    )}
                                </div>
                            ) : selectedTicket.issue?.description && (
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Lỗi / Yêu cầu</p>
                                    <p className="text-sm text-gray-800">{selectedTicket.issue.description}</p>
                                    {selectedTicket.issue.notes && (
                                        <p className="text-xs text-gray-500 mt-1">Ghi chú: {selectedTicket.issue.notes}</p>
                                    )}
                                </div>
                            )}

                            {/* Checklist */}
                            {selectedTicket.deviceInfo?.checklist && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><CheckCircle2 size={12} /> Checklist kiểm tra</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(selectedTicket.deviceInfo.checklist)
                                            .filter(([k]) => !['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts'].includes(k))
                                            .map(([key, val]) => (
                                                <div key={key} className={`text-[11px] rounded-lg px-2.5 py-2 border font-medium flex items-center justify-between ${
                                                    val === 'OK' ? 'bg-green-50 border-green-200 text-green-700' :
                                                    val === 'Lỗi' ? 'bg-red-50 border-red-200 text-red-600' :
                                                    val && val !== 'N/A' && val !== '—' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                                    'bg-gray-50 border-gray-200 text-gray-500'
                                                }`}>
                                                    <span className="opacity-70">{checklistLabels[key] || key}:</span>
                                                    <span>{val as string || '—'}</span>
                                                </div>
                                            ))}
                                    </div>

                                    {/* Lịch sử máy */}
                                    <div className="mt-3">
                                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><AlertCircle size={12} /> Lịch sử máy</p>
                                        <div className="flex flex-wrap gap-2 text-[11px]">
                                            <span className={`px-2 py-1 rounded-md border ${selectedTicket.deviceInfo.checklist.hasPriorRepair ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                                {selectedTicket.deviceInfo.checklist.hasPriorRepair ? '☑' : '☐'} Đã từng sửa
                                            </span>
                                            <span className={`px-2 py-1 rounded-md border ${selectedTicket.deviceInfo.checklist.hasWaterDamage ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                                {selectedTicket.deviceInfo.checklist.hasWaterDamage ? '☑' : '☐'} Từng vào nước
                                            </span>
                                            <span className={`px-2 py-1 rounded-md border ${selectedTicket.deviceInfo.checklist.hasNonGenuineParts ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                                {selectedTicket.deviceInfo.checklist.hasNonGenuineParts ? '☑' : '☐'} Kém/Lô
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- Linh kiện sử dụng --- */}
                            {(() => {
                                const workflow = getWorkflowForTicket(selectedTicket);
                                const st = workflow.find(s => s.id === selectedTicket.status);
                                return st?.allowedFeatures?.includes('allowPartsSelection');
                            })() && !(() => {
                                const wf = getWorkflowForTicket(selectedTicket);
                                const cfg = wf.find(s => s.id === selectedTicket.status);
                                const isTerminal = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!cfg?.isTerminal;
                                const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                                const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                                const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                                return isTerminal || isKtvLocked;
                            })() && (
                                    <div className="mt-4 border-t pt-4">
                                        <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                            <Package size={16} className="text-orange-500" /> Linh kiện sử dụng
                                        </p>

                                        {/* Existing Parts List */}
                                        {selectedTicket.parts && selectedTicket.parts.length > 0 && (
                                            <div className="mb-4 space-y-2">
                                                {selectedTicket.parts.map((p, pIdx) => (
                                                    <div key={pIdx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-orange-50/50 p-2.5 rounded-lg border border-orange-100">
                                                        <div>
                                                            <p className="font-medium text-sm text-gray-900">{p.productName}</p>
                                                            <p className="text-xs text-gray-500">
                                                                Phân loại: {p.quality} (SL: {p.quantity})
                                                                {p.price ? (
                                                                    <> · Giá dự kiến: <span className="font-semibold text-orange-600">{formatPrice((p as Partial<{ price: number }>).price || 0)}</span></>
                                                                ) : null}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-2 sm:mt-0">
                                                            <span
                                                                className={`text-[10px] font-bold px-2 py-1 rounded-md border ${
                                                                    isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                                        : isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK)
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                            : p.status === 'unavailable'
                                                                                ? 'bg-red-50 text-red-600 border-red-200'
                                                                                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                                }`}
                                                            >
                                                                {isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                                                    ? 'Đã xuất'
                                                                    : isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK)
                                                                        ? 'Đã tìm được'
                                                                        : p.status === 'unavailable'
                                                                            ? 'Không có hàng'
                                                                            : 'Đang yêu cầu'}
                                                            </span>
                                                            {!(() => {
                                                                const wf = getWorkflowForTicket(selectedTicket);
                                                                const cfg = wf.find(s => s.id === selectedTicket.status);
                                                                const isTerminal = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!cfg?.isTerminal;
                                                                const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                                                                const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                                                                const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                                                                return isTerminal || isKtvLocked;
                                                            })() && (
                                                            <button
                                                                onClick={() => handleRemovePart(selectedTicket, pIdx)}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-md transition-colors"
                                                                title="Xóa linh kiện"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Part Section */}
                                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Thêm linh kiện mới</label>
                                            <div className="relative mb-3">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Search size={14} className="text-gray-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Tìm kiếm linh kiện..."
                                                    value={partSearchQuery}
                                                    onChange={e => setPartSearchQuery(e.target.value)}
                                                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500/20"
                                                />
                                            </div>

                                            {/* Dropdown Phân loại */}
                                            <div className="mb-3">
                                                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Chất lượng / Loại hàng:</label>
                                                <select
                                                    value={selectedPartQuality}
                                                    onChange={e => setSelectedPartQuality(e.target.value)}
                                                    aria-label="Chất lượng / Loại hàng"
                                                    title="Chất lượng / Loại hàng"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-orange-500/20"
                                                >
                                                    <option value="Zin">Zin</option>
                                                    <option value="Loại 1">Loại 1</option>
                                                    <option value="Loại 2">Loại 2</option>
                                                    <option value="Bóc máy">Bóc máy</option>
                                                    <option value="Linh kiện">Linh kiện thay thế</option>
                                                </select>
                                            </div>

                                            {/* Search Results */}
                                            {partSearchQuery && (
                                                <div className="mt-2 bg-white border border-gray-200 rounded-md shadow-sm divide-y max-h-48 overflow-y-auto mb-3">
                                                    {isSearchingParts ? (
                                                        <div className="p-3 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                                                            <Loader2 size={14} className="animate-spin" /> Đang tìm...
                                                        </div>
                                                    ) : partSearchResults.length > 0 ? (
                                                        partSearchResults.map(product => (
                                                            <div key={product.id} className="p-2 hover:bg-orange-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-800 line-clamp-1">{product.name}</p>
                                                                    {(() => {
                                                                        const available = Math.max(0, (product.stock || 0) - (product.held || 0));
                                                                        return (
                                                                            <p className={`text-[10px] ${available > 0 ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                                                                                Khả dụng: {available}
                                                                                {((product.held || 0) > 0) && ` (Đang giữ: ${product.held})`}
                                                                            </p>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        {(() => {
                                                                            const available = Math.max(0, (product.stock || 0) - (product.held || 0));
                                                                            const isAlreadyRequested = selectedTicket.parts?.some(
                                                                                p => p.productId === product.id && isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED)
                                                                            );
                                                                            return (
                                                                                <>
                                                                                    <button
                                                                                        onClick={() => handleAddPart(selectedTicket, product)}
                                                                                        disabled={available <= 0}
                                                                                        className={`px-2 py-1 border text-xs font-semibold rounded ${available > 0 ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-70'}`}
                                                                                    >
                                                                                        Có sẵn (Thêm)
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleRequestPart(selectedTicket, product)}
                                                                                        disabled={isAlreadyRequested}
                                                                                        className={`px-2 py-1 text-xs font-semibold rounded border ${
                                                                                            isAlreadyRequested 
                                                                                            ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed opacity-70' 
                                                                                            : 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
                                                                                        }`}
                                                                                    >
                                                                                        {isAlreadyRequested ? 'Đã đề xuất' : 'Hết (Đề xuất)'}
                                                                                    </button>
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="p-3 text-center text-xs text-gray-500">Không tìm thấy linh kiện trong hệ thống.</div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Custom Part Request */}
                                            <div className="pt-3 border-t border-gray-200">
                                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Linh kiện ngoài / Chưa có trên hệ thống</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="VD: Cáp sạc iPhone 12 Zin bóc máy..."
                                                        value={customPartName}
                                                        onChange={e => setCustomPartName(e.target.value)}
                                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500/20"
                                                    />
                                                    <button
                                                        onClick={() => handleAddCustomPart(selectedTicket)}
                                                        disabled={!customPartName.trim()}
                                                        className="px-3 py-1.5 bg-gray-800 text-white text-xs font-semibold rounded-md hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                    >
                                                        Thêm & Đề xuất
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            {/* Pre-repair Media */}
                            {selectedTicket.preRepairMedia?.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><ImageIcon size={12} /> Ảnh/Video nhận máy</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {selectedTicket.preRepairMedia.map((url, i) => (
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
                            {selectedTicket.postRepairMedia?.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Video size={12} /> Video / Media bàn giao</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedTicket.postRepairMedia.map((url, i) => (
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
                            {selectedTicket.statusTimeline?.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Clock size={12} /> Nhật ký phiếu</p>
                                    <div className="space-y-2">
                                        {[...selectedTicket.statusTimeline].reverse().map((entry, i) => (
                                            <div key={`${entry.requestId || entry.timestamp || i}-${i}`} className="rounded-lg border bg-gray-50 p-3 text-xs">
                                                <div className="flex items-start justify-between gap-3">
                                                    <span className="font-semibold text-gray-800">{getTimelineTitle(entry, getWorkflowForTicket(selectedTicket))}</span>
                                                    <span className="shrink-0 text-gray-400">
                                                        {getTimelineTimestamp(entry).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                {(entry.actorName || entry.actorId || entry.by) && (
                                                    <p className="mt-1 text-gray-600">Thực hiện: {entry.actorName || userNamesMap[(entry.actorId || entry.by) as string] || entry.actorId || entry.by} {entry.actorRole ? `(${entry.actorRole})` : ''}</p>
                                                )}
                                                {(entry.reason || entry.note) && <p className="mt-1 text-gray-700">Lý do: {entry.reason || entry.note}</p>}
                                                {entry.requestId && <p className="mt-1 break-all text-[10px] text-gray-400">Mã đối soát: {entry.requestId}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Quick Status Buttons */}
                            {(() => {
                                const workflow = getWorkflowForTicket(selectedTicket);
                                const currentStatusCfg = workflow.find(s => s.id === selectedTicket.status);
                                // Read-only guard: hide status change buttons entirely
                                const isTerminal = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!currentStatusCfg?.isTerminal;
                                const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                                const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                                const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                                const isReadOnly = isTerminal || isKtvLocked;
                                if (isReadOnly) return null;
                                if (currentStatusCfg?.allowedFeatures?.includes('allowPartsSelection')) {
                                    const hasRequestedParts = selectedTicket.parts?.length === 0 || selectedTicket.parts?.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED));
                                    const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                                    const targetStatus = workflow.find(ds => ds.id === targetStatusId);

                                    if (!targetStatus) return null;
                                    return (
                                        <div className="pt-3 border-t flex gap-2">
                                            <button onClick={() => { handleStatusChange(selectedTicket.id, targetStatus.id); setSelectedTicket(null); }}
                                                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50">
                                                Chuyển → {hasRequestedParts ? 'Tìm linh kiện' : targetStatus.label}
                                            </button>
                                        </div>
                                    );
                                } else {
                                    const ticketIdx = workflow.findIndex(s => s.id === selectedTicket.status);
                                    const nextStatus = ticketIdx !== -1 && ticketIdx < workflow.length - 1 ? workflow[ticketIdx + 1] : null;
                                    if (!nextStatus) return null;
                                    return (
                                        <div className="pt-3 border-t flex gap-2">
                                            <button onClick={() => { handleStatusChange(selectedTicket.id, nextStatus.id); setSelectedTicket(null); }}
                                                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50">
                                                Chuyển → {nextStatus.label}
                                            </button>
                                        </div>
                                    );
                                }
                            })()}
                    </div>
                </Modal>
            )}

            {/* ══════════  Status Change Confirm Modal  ══════════ */}
            {transferModal && (
                <Modal
                    isOpen={true}
                    onClose={() => { setTransferModal(null); setTransferTechnicianId(''); setTransferReason(''); }}
                    title={`Chuyển KTV — #${transferModal.ticket.id.slice(-6).toUpperCase()}`}
                    size="sm"
                    mobileSheet={true}
                >
                    <div className="p-4 space-y-4">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            KTV hiện tại vẫn chịu trách nhiệm cho đến khi KTV mới bấm chấp nhận.
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">KTV nhận mới</label>
                            <select
                                title="Chọn KTV nhận mới"
                                value={transferTechnicianId}
                                onChange={event => setTransferTechnicianId(event.target.value)}
                                className="w-full min-h-11 px-3 py-2 border rounded-lg bg-white"
                            >
                                <option value="">-- Chọn KTV --</option>
                                {technicians.filter(technician => technician.uid !== transferModal.ticket.staff?.assignedTechnician).map(technician => (
                                    <option key={technician.uid} value={technician.uid}>{technician.displayName}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Lý do chuyển <span className="text-red-500">*</span></label>
                            <textarea
                                value={transferReason}
                                onChange={event => setTransferReason(event.target.value)}
                                rows={4}
                                placeholder="Mô tả rõ nguyên nhân chuyển để lưu nhật ký chống gian lận"
                                className="w-full min-h-28 px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => { setTransferModal(null); setTransferTechnicianId(''); setTransferReason(''); }} className="min-h-11 rounded-lg bg-gray-100 text-sm font-medium">Hủy</button>
                            <button
                                onClick={handleTransferRequest}
                                disabled={isTransferSubmitting || !transferTechnicianId || !transferReason.trim()}
                                className="min-h-11 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isTransferSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
                                Gửi yêu cầu
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {statusConfirmModal && (() => {
                const ticket = tickets.find(t => t.id === statusConfirmModal.ticketId);
                if (!ticket) return null;
                const workflow = getWorkflowForTicket(ticket);
                const currentLabel = workflow.find(s => s.id === ticket.status)?.label || ticket.status;
                const nextLabel = workflow.find(s => s.id === statusConfirmModal.newStatus)?.label || statusConfirmModal.newStatus;

                return (
                    <Modal
                        isOpen={true}
                        onClose={() => { if (!isStatusChanging) setStatusConfirmModal(null); }}
                        title="Xác nhận chuyển trạng thái"
                        size="md"
                    >
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-500">
                                Phiếu #{ticket.id.slice(-6).toUpperCase()} • {ticket.customer?.name || '—'}
                            </p>

                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Từ:</span>
                                    <span className="font-semibold text-gray-900">{currentLabel}</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-gray-600">Sang:</span>
                                    <span className="font-semibold text-orange-600">{nextLabel}</span>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => { if (!isStatusChanging) setStatusConfirmModal(null); }}
                                    disabled={isStatusChanging}
                                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                                >
                                    Huỷ
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            setIsStatusChanging(true);
                                            const { ticketId, newStatus } = statusConfirmModal;
                                            setStatusConfirmModal(null);
                                            await executeStatusChange(ticketId, newStatus);
                                        } finally {
                                            setIsStatusChanging(false);
                                        }
                                    }}
                                    disabled={isStatusChanging}
                                    className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                                >
                                    Xác nhận
                                </button>
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            {/* ══════════  Tech Notes Prompt Modal  ══════════ */}
            {noteModalPayload && (
                <Modal
                    isOpen={true}
                    onClose={() => setNoteModalPayload(null)}
                    title="Cập nhật Ghi chú kỹ thuật"
                    size="md"
                >
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-gray-500">
                            Chuyển sang: {(tickets.find(t => t.id === noteModalPayload.ticketId)?.ticketType === 'warranty' ? warrantyStatuses : dynamicStatuses).find(s => s.id === noteModalPayload.newStatus)?.label || noteModalPayload.newStatus}
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Ghi chú / Lý do ghi đè (Bắt buộc nếu bạn là Quản lý)
                            </label>
                            <textarea
                                rows={4}
                                value={techNoteText}
                                onChange={e => setTechNoteText(e.target.value)}
                                placeholder="Nhập ghi chú kỹ thuật hoặc lý do ghi đè trước khi chuyển trạng thái..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20"
                            />
                            <p className="text-xs text-gray-400 mt-1">Lý do này sẽ được lưu cùng với phiếu sửa chữa và admin có thể xem trong lịch sử trạng thái.</p>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={() => setNoteModalPayload(null)}
                                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                                Đóng
                            </button>
                            <button onClick={handleNoteSubmit}
                                className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors">
                                Xác nhận chuyển đổi
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

        </div>
    );
}
