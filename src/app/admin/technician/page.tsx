'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
import {
    Wrench, Smartphone, Search, Eye, ChevronRight, Clock,
    CheckCircle2, Loader2, Image, Video, AlertCircle, X, Package, Trash2
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, addDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import type { RepairTicket, RepairStatus, Product, WorkflowNode } from '@/lib/types';

const checklistLabels: Record<string, string> = {
    body: 'Vỏ máy', screen: 'Màn hình', touch: 'Cảm ứng', camera: 'Camera',
    speaker: 'Loa/Mic', connectivity: 'Kết nối', battery: 'Pin', biometric: 'FaceID/Vân tay',
};

const TERMINAL_STATUSES: RepairStatus[] = ['done', 'da_tra_may', 'out', 'hoan_phi'];

export default function TechnicianPage() {
    const { user } = useAuth();
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
    const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

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

    // Search parts
    useEffect(() => {
        if (!partSearchQuery.trim()) {
            setPartSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingParts(true);
            try {
                // Fetch from products collection where status is active
                const snap = await getDocs(query(collection(db, 'products'), where('status', '==', 'active')));
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
                const lowerQ = partSearchQuery.toLowerCase();
                // We only want parts (Linh kiện)
                const filtered = all.filter(p => 
                    p.category === 'Linh kiện' && (p.name.toLowerCase().includes(lowerQ) || p.id.toLowerCase().includes(lowerQ))
                );
                setPartSearchResults(filtered.slice(0, 10)); // max 10 results
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearchingParts(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [partSearchQuery]);

    // Add part to ticket directly (if in stock or simple selection)
    const handleAddPart = async (ticket: RepairTicket, product: Product) => {
        try {
            const currentParts = ticket.parts || [];
            const newPart = {
                productId: product.id,
                productName: product.name,
                quality: selectedPartQuality,
                quantity: 1,
                status: 'selected' as const
            };
            await updateDoc(doc(db, 'repairs', ticket.id), {
                parts: [...currentParts, newPart]
            });
            // Update local state to reflect immediately
            setSelectedTicket({ ...ticket, parts: [...currentParts, newPart] });
            setPartSearchQuery('');
        } catch (err) {
            console.error('Error adding part:', err);
            alert('Lỗi khi thêm linh kiện.');
        }
    };

    // Request part (out of stock) -> creates import receipt and adds to ticket
    const handleRequestPart = async (ticket: RepairTicket, product: Product) => {
        try {
            // 1. Add to ticket
            const currentParts = ticket.parts || [];
            const newPart = {
                productId: product.id,
                productName: product.name,
                quality: selectedPartQuality,
                quantity: 1,
                status: 'requested' as const
            };
            await updateDoc(doc(db, 'repairs', ticket.id), {
                parts: [...currentParts, newPart]
            });
            setSelectedTicket({ ...ticket, parts: [...currentParts, newPart] });

            // 2. Auto-create draft import receipt
            await addDoc(collection(db, 'import_receipts'), {
                supplier: 'Chưa xác định (Yêu cầu từ KTV)',
                items: [{
                    productId: product.id,
                    productName: product.name,
                    quantity: 1,
                    importPrice: 0,
                    quality: selectedPartQuality
                }],
                totalAmount: 0,
                note: `Yêu cầu tự động từ phiếu SC #${ticket.id.slice(-6).toUpperCase()}`,
                status: 'draft',
                createdBy: user?.uid || 'system',
                createdByName: user?.displayName || 'KTV',
                createdAt: serverTimestamp()
            });

            alert('Đã gửi yêu cầu nhập hàng cho Admin.');
            setPartSearchQuery('');
        } catch (err) {
            console.error('Error requesting part:', err);
            alert('Lỗi khi tạo yêu cầu.');
        }
    };

    // Request custom part (not in inventory)
    const handleAddCustomPart = async (ticket: RepairTicket) => {
        if (!customPartName.trim()) return;

        try {
            // 1. Add to ticket
            const currentParts = ticket.parts || [];
            const newPart = {
                productId: `custom_${Date.now()}`,
                productName: customPartName.trim(),
                quality: selectedPartQuality,
                quantity: 1,
                status: 'requested' as const
            };
            await updateDoc(doc(db, 'repairs', ticket.id), {
                parts: [...currentParts, newPart]
            });
            setSelectedTicket({ ...ticket, parts: [...currentParts, newPart] });

            // 2. Auto-create draft import receipt
            await addDoc(collection(db, 'import_receipts'), {
                supplier: 'Chưa xác định (Yêu cầu Linh kiện Tùy chỉnh)',
                items: [{
                    productId: newPart.productId, // Pseudo-ID
                    productName: newPart.productName,
                    quantity: 1,
                    importPrice: 0,
                    quality: selectedPartQuality
                }],
                totalAmount: 0,
                note: `Yêu cầu tự động (Linh kiện ngoài kho) từ phiếu SC #${ticket.id.slice(-6).toUpperCase()}`,
                status: 'draft',
                createdBy: user?.uid || 'system',
                createdByName: user?.displayName || 'KTV',
                createdAt: serverTimestamp()
            });

            alert('Đã thêm linh kiện tùy chỉnh và gửi yêu cầu nhập hàng.');
            setCustomPartName('');
        } catch (err) {
            console.error('Error adding custom part:', err);
            alert('Lỗi khi thêm linh kiện.');
        }
    };

    const handleRemovePart = async (ticket: RepairTicket, partIndex: number) => {
        if (!confirm('Bạn có chắc chắn muốn xóa linh kiện này khỏi phiếu?')) return;
        try {
            const newParts = [...(ticket.parts || [])];
            newParts.splice(partIndex, 1);
            await updateDoc(doc(db, 'repairs', ticket.id), { parts: newParts });
            setSelectedTicket({ ...ticket, parts: newParts });
        } catch (err) {
            console.error('Error removing part:', err);
        }
    };

    useEffect(() => {
        const unsubTickets = onSnapshot(query(collection(db, 'repairs')), (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as RepairTicket[];
            // Filter out terminal tickets for technician view
            setTickets(data.filter(t => !TERMINAL_STATUSES.includes(t.status)));
            setLoading(false);
        });

        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), (docSnap) => {
            if (docSnap.exists() && docSnap.data().statuses) {
                setDynamicStatuses(docSnap.data().statuses);
            }
        });

        return () => {
            unsubTickets();
            unsubStatuses();
        };
    }, []);

    const handleStatusChange = async (ticketId: string, newStatus: RepairStatus | string) => {
        try {
            const ticket = tickets.find(t => t.id === ticketId);
            if (!ticket) return;

            // Block terminal states
            if (TERMINAL_STATUSES.includes(ticket.status)) {
                alert('Phiếu đã đóng, không thể thay đổi trạng thái!');
                return;
            }

            // --- INTERCEPT: If transitioning OUT of "dang_kiem_tra", require Tech Notes ---
            if (ticket.status === 'dang_kiem_tra' && newStatus !== 'dang_kiem_tra') {
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

    const finalizeStatusChange = async (ticket: RepairTicket, newStatus: string, newTechNote?: string) => {
        try {
            const now = Date.now();
            const timeline = [...(ticket?.statusTimeline || [])];

            // Add duration to last entry
            if (timeline.length > 0) {
                const lastEntry = timeline[timeline.length - 1];
                lastEntry.durationInMinutes = Math.round((now - lastEntry.timestamp) / 60000);
            }
            timeline.push({ status: newStatus, timestamp: now });

            const updates: Record<string, unknown> = {
                status: newStatus,
                statusTimeline: timeline,
                updatedAt: serverTimestamp(),
            };

            // Only update issue.notes if provided
            if (newTechNote !== undefined) {
                updates['issue.notes'] = newTechNote;
            }

            await updateDoc(doc(db, 'repairs', ticket.id), updates);
        } catch (err) {
            console.error('Status update error:', err);
        }
    };

    const handleNoteSubmit = async () => {
        if (!noteModalPayload) return;

        const ticket = tickets.find(t => t.id === noteModalPayload.ticketId);
        if (ticket) {
            await finalizeStatusChange(ticket, noteModalPayload.newStatus, techNoteText);
        }

        setNoteModalPayload(null);
        setTechNoteText('');
    };

    const filtered = tickets.filter(t => {
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
        <div className="p-4 md:p-6 space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Wrench className="text-orange-500" /> Khu vực Kỹ thuật viên
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {tickets.filter(t => t.status === 'dang_sua_chua').length} máy đang sửa •
                        {' '}{tickets.filter(t => t.status === 'done').length} máy chờ trả
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Tìm máy, khách..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:border-orange-500 focus:outline-none" />
                    </div>
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                        <button onClick={() => setViewMode('list')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                            Danh sách
                        </button>
                        <button onClick={() => setViewMode('kanban')}
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
                        const st = dynamicStatuses.find(s => s.id === ticket.status) || { id: ticket.status, label: ticket.status, color: 'text-gray-700 bg-gray-50 border-gray-200', allowedNext: [] } as WorkflowNode;

                        return (
                            <div key={ticket.id} className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${st.color}`}>
                                <div className="flex items-start gap-3">
                                    {/* Device Icon */}
                                    <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center flex-shrink-0">
                                        <Smartphone size={20} className="text-gray-600" />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold text-gray-900">{ticket.deviceInfo?.model || 'Thiết bị'}</p>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${st.color}`}>
                                                {st.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            #{ticket.id.slice(-6).toUpperCase()} • {ticket.customer?.name}
                                        </p>
                                        {ticket.issue?.description && (
                                            <p className="text-sm text-gray-600 mt-1 line-clamp-1">{ticket.issue.description}</p>
                                        )}

                                        {/* Media & Checklist badges */}
                                        <div className="flex items-center gap-2 mt-2">
                                            {ticket.preRepairMedia?.length > 0 && (
                                                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                    <Image size={10} /> {ticket.preRepairMedia.length} ảnh nhận
                                                </span>
                                            )}
                                            {ticket.postRepairMedia?.length > 0 && (
                                                <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                    <Video size={10} /> {ticket.postRepairMedia.length} video
                                                </span>
                                            )}
                                            {ticket.deviceInfo?.checklist && (
                                                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                    ✅ Checklist
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                        <button onClick={() => setSelectedTicket(ticket)}
                                            className="p-2 hover:bg-white/50 rounded-lg transition-colors" title="Xem chi tiết">
                                            <Eye size={16} className="text-gray-500" />
                                        </button>
                                        
                                        {/* Dynamic Transition Button for Báo Giá */}
                                        {ticket.status === 'bao_tinh_trang_va_gia' ? (() => {
                                            const hasRequestedParts = ticket.parts?.length === 0 || ticket.parts?.some(p => p.status === 'requested');
                                            const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                                            const targetStatus = dynamicStatuses.find(ds => ds.id === targetStatusId);
                                            
                                            if (!targetStatus) return null;
                                            return (
                                                <button onClick={() => handleStatusChange(ticket.id, targetStatus.id)}
                                                    className={`text-[10px] px-2 py-1 bg-white border rounded-lg font-medium transition-all flex items-center gap-1 w-full justify-between hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600`}>
                                                    {hasRequestedParts ? 'Tìm linh kiện' : 'Đang sửa chữa'}
                                                    <ChevronRight size={10} />
                                                </button>
                                            );
                                        })() : st.allowedNext?.map((nextId: string) => {
                                            const nextCfg = dynamicStatuses.find(ds => ds.id === nextId);
                                            if (!nextCfg) return null;
                                            return (
                                                <button key={nextId} onClick={() => handleStatusChange(ticket.id, nextId)}
                                                    className={`text-[10px] px-2 py-1 bg-white border rounded-lg font-medium transition-all flex items-center gap-1 w-full justify-between ${nextId === 'hoan_phi' ? 'hover:bg-red-50 hover:border-red-300 hover:text-red-600' : nextId === 'out' ? 'hover:bg-gray-50 hover:border-gray-300 hover:text-gray-600' : 'hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600'}`}>
                                                    {nextCfg.label}
                                                    {nextId === 'hoan_phi' ? <X size={10} /> : <ChevronRight size={10} />}
                                                </button>
                                            );
                                        })}
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
                    {dynamicStatuses.filter(s => !TERMINAL_STATUSES.includes(s.id) && s.id !== 'cho_tiep_nhan').map(col => {
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
                                        const st = dynamicStatuses.find(s => s.id === ticket.status) as WorkflowNode | undefined;
                                        return (
                                            <div key={ticket.id} className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow relative group">
                                                <div className="flex items-start justify-between mb-1">
                                                    <p className="font-semibold text-sm text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1 pr-6">{ticket.deviceInfo?.model || 'Thiết bị'}</p>
                                                    <button onClick={() => setSelectedTicket(ticket)} className="text-gray-400 hover:text-orange-500 absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-white">
                                                        <Eye size={16} />
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-gray-500 font-mono">#{ticket.id.slice(-6).toUpperCase()}</p>
                                                <p className="text-[11px] text-gray-600 mt-0.5 max-w-full truncate">{ticket.customer?.name}</p>
                                                {ticket.issue?.description && (
                                                    <p className="text-[11px] text-gray-500 mt-2 line-clamp-2 bg-gray-50 p-1.5 rounded">{ticket.issue.description}</p>
                                                )}
                                                
                                                {/* Dynamic Transition Button for Báo Giá */}
                                                {ticket.status === 'bao_tinh_trang_va_gia' ? (() => {
                                                    const hasRequestedParts = ticket.parts?.length === 0 || ticket.parts?.some(p => p.status === 'requested');
                                                    const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                                                    const targetStatus = dynamicStatuses.find(ds => ds.id === targetStatusId);
                                                    
                                                    if (!targetStatus) return null;
                                                    return (
                                                        <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                            <button onClick={() => handleStatusChange(ticket.id, targetStatus.id)}
                                                                className={`w-full justify-between flex items-center gap-1 text-[11px] px-2 py-1.5 border rounded-md font-medium transition-all bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-500 hover:text-white`}>
                                                                Chuyển sang {hasRequestedParts ? 'Tìm linh kiện' : 'Đang sửa chữa'}
                                                                <ChevronRight size={12} />
                                                            </button>
                                                        </div>
                                                    );
                                                })() : (st?.allowedNext && st.allowedNext.length > 0) && (
                                                    <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                                                        {st?.allowedNext?.map((nextId: string) => {
                                                            const nextCfg = dynamicStatuses.find(ds => ds.id === nextId);
                                                            if (!nextCfg) return null;
                                                            return (
                                                                <button key={nextId} onClick={() => handleStatusChange(ticket.id, nextId)}
                                                                    className={`w-full justify-between flex items-center gap-1 text-[11px] px-2 py-1.5 border rounded-md font-medium transition-all ${nextId === 'hoan_phi' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-500 hover:text-white' : nextId === 'out' ? 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-500 hover:text-white' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-500 hover:text-white'}`}>
                                                                    Chuyển sang {nextCfg.label}
                                                                    {nextId === 'hoan_phi' ? <X size={12} /> : <ChevronRight size={12} />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTicket(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">{selectedTicket.deviceInfo?.model}</h2>
                                <p className="text-xs text-gray-500">#{selectedTicket.id.slice(-6).toUpperCase()} • {selectedTicket.customer?.name}</p>
                            </div>
                            <button onClick={() => setSelectedTicket(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Status */}
                            {(() => {
                                const st = dynamicStatuses.find(s => s.id === selectedTicket.status) || { id: selectedTicket.status, label: selectedTicket.status, color: 'text-gray-700 bg-gray-50 border-gray-200' };
                                return (
                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${st.color}`}>
                                        {st.label}
                                    </div>
                                );
                            })()}

                            {/* Issue */}
                            {selectedTicket.issue?.description && (
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
                                                <div key={key} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 border">
                                                    <span className="text-gray-500">{checklistLabels[key] || key}:</span>
                                                    <span className="ml-1 font-medium text-gray-800">{val as string || '—'}</span>
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
                            {selectedTicket.status === 'bao_tinh_trang_va_gia' && (
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
                                                        <p className="text-xs text-gray-500">Phân loại: {p.quality} (SL: {p.quantity})</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${p.status === 'selected' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                            {p.status === 'selected' ? 'Đã xuất' : 'Đang yêu cầu'}
                                                        </span>
                                                        <button
                                                            onClick={() => handleRemovePart(selectedTicket, pIdx)}
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-md transition-colors"
                                                            title="Xóa linh kiện"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
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
                                                                <p className="text-[10px] text-gray-500">Tồn kho: {product.stock || 0}</p>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <button
                                                                    onClick={() => handleAddPart(selectedTicket, product)}
                                                                    className="px-2 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded hover:bg-gray-50"
                                                                >
                                                                    Có sẵn (Thêm)
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRequestPart(selectedTicket, product)}
                                                                    className="px-2 py-1 bg-orange-100 text-orange-700 border border-orange-200 text-xs font-semibold rounded hover:bg-orange-200"
                                                                >
                                                                    Hết (Đề xuất)
                                                                </button>
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
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Image size={12} /> Ảnh/Video nhận máy</p>
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
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Video size={12} /> Video bàn giao</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedTicket.postRepairMedia.map((url, i) => (
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
                            {selectedTicket.statusTimeline?.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Clock size={12} /> Lịch sử trạng thái</p>
                                    <div className="space-y-1">
                                        {selectedTicket.statusTimeline.map((entry, i) => (
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

                            {/* Quick Status Buttons */}
                            {(() => {
                                if (selectedTicket.status === 'bao_tinh_trang_va_gia') {
                                    const hasRequestedParts = selectedTicket.parts?.length === 0 || selectedTicket.parts?.some(p => p.status === 'requested');
                                    const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                                    const targetStatus = dynamicStatuses.find(ds => ds.id === targetStatusId);
                                    
                                    if (!targetStatus) return null;
                                    return (
                                        <div className="pt-3 border-t flex gap-2">
                                            <button onClick={() => { handleStatusChange(selectedTicket.id, targetStatus.id); setSelectedTicket(null); }}
                                                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50">
                                                Chuyển → {hasRequestedParts ? 'Tìm linh kiện' : 'Đang sửa chữa'}
                                            </button>
                                        </div>
                                    );
                                } else {
                                    const ticketIdx = dynamicStatuses.findIndex(s => s.id === selectedTicket.status);
                                    const nextStatus = ticketIdx !== -1 && ticketIdx < dynamicStatuses.length - 1 ? dynamicStatuses[ticketIdx + 1] : null;
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
                    </div>
                </div>
            )}

            {/* ══════════  Tech Notes Prompt Modal  ══════════ */}
            {noteModalPayload && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 text-orange-600">
                                <Wrench size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Cập nhật Ghi chú kỹ thuật</h3>
                                <p className="text-sm text-gray-500">
                                    Chuyển sang: {dynamicStatuses.find(s => s.id === noteModalPayload.newStatus)?.label || noteModalPayload.newStatus}
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Ghi chú (tùy chọn)
                            </label>
                            <textarea
                                rows={4}
                                value={techNoteText}
                                onChange={e => setTechNoteText(e.target.value)}
                                placeholder="Nhập ghi chú kỹ thuật trước khi chuyển trạng thái..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20"
                            />
                            <p className="text-xs text-gray-400 mt-1">Ghi chú này sẽ được lưu cùng với phiếu sửa chữa và admin có thể xem.</p>
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
                </div>
            )}
        </div>
    );
}
