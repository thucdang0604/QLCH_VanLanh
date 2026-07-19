'use client';

import { useState, useEffect } from 'react';
import {
    Settings, Plus, Trash2, GripVertical, Save, Loader2, ArrowRight, Eye, Shield, AlertTriangle
} from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDoc } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { WORKFLOW_FEATURES } from '@/lib/workflowFeatures';
import { appConfirm } from '@/lib/appDialog';
import {
    normalizeRepairWorkflow,
    normalizeWarrantyWorkflow,
    validateTrackingGroups,
    validateWorkflow,
} from '@/lib/repairWorkflowConfig';

import type { WorkflowNode, TrackingGroup, WarrantyRule } from '@/lib/types';

const DEFAULT_WARRANTY_RULES: WarrantyRule[] = [
    { partType: 'Màn hình', warrantyMonths: 6 },
    { partType: 'Pin', warrantyMonths: 12 },
    { partType: 'Camera', warrantyMonths: 3 },
    { partType: 'Mainboard', warrantyMonths: 6 },
    { partType: 'Loa / Mic', warrantyMonths: 3 },
    { partType: 'Cáp / Dây nguồn', warrantyMonths: 1 },
    { partType: 'Vỏ / Khung', warrantyMonths: 0 },
    { partType: 'Khác', warrantyMonths: 0 },
];
import { toastError, toastSuccess } from '@/lib/toast';

const defaultStatuses: WorkflowNode[] = [
    { id: 'cho_tiep_nhan', label: 'Chờ Tiếp nhận', color: 'bg-yellow-100 text-yellow-800', allowedNext: ['dang_kiem_tra', 'out'] },
    { id: 'dang_kiem_tra', label: 'Đang Kiểm Tra', color: 'bg-blue-100 text-blue-800', allowedNext: ['bao_tinh_trang_va_gia', 'dang_sua_chua', 'done', 'out'], allowedFeatures: ['requireAssignedTechnician'] },
    { id: 'bao_tinh_trang_va_gia', label: 'Báo Tình Trạng & Giá', color: 'bg-indigo-100 text-indigo-800', allowedNext: ['doi_khach_phan_hoi', 'out'] },
    { id: 'doi_khach_phan_hoi', label: 'Đợi Khách Phản Hồi', color: 'bg-purple-100 text-purple-800', allowedNext: ['tim_linh_kien', 'dang_sua_chua', 'refund', 'out'] },
    { id: 'tim_linh_kien', label: 'Tìm Linh Kiện', color: 'bg-cyan-100 text-cyan-800', allowedNext: ['da_dat_linh_kien', 'refund', 'out'] },
    { id: 'da_dat_linh_kien', label: 'Đã Đặt LK', color: 'bg-teal-100 text-teal-800', allowedNext: ['dang_sua_chua'], allowedFeatures: ['requirePartsReady'] },
    { id: 'dang_sua_chua', label: 'Đang Sửa Chữa', color: 'bg-orange-100 text-orange-800', allowedNext: ['done', 'refund'], allowedFeatures: ['reserveSelectedParts'] },
    { id: 'done', label: 'Hoàn Thành', color: 'bg-green-100 text-green-800', allowedNext: [], isTerminal: true },
    { id: 'out', label: 'Trả Máy', color: 'bg-gray-100 text-gray-800', allowedNext: [], isTerminal: true },
    { id: 'refund', label: 'Hoàn Phí', color: 'bg-red-100 text-red-800', allowedNext: [], isTerminal: true }
];

const defaultWarrantyStatuses: WorkflowNode[] = [
    { id: 'bh_tiep_nhan', label: 'Tiếp nhận BH', color: 'bg-yellow-100 text-yellow-800', allowedNext: ['bh_dang_kiem_tra'], allowedFeatures: ['allowAssignTech'], isTerminal: false },
    { id: 'bh_dang_kiem_tra', label: 'Đang kiểm tra BH', color: 'bg-blue-100 text-blue-800', allowedNext: ['bh_dang_sua', 'bh_tu_choi'], allowedFeatures: ['requireAssignedTechnician', 'requireChecklist'], isTerminal: false },
    { id: 'bh_dang_sua', label: 'Đang sửa BH', color: 'bg-orange-100 text-orange-800', allowedNext: ['bh_hoan_tat', 'bh_refund'], allowedFeatures: ['allowPartsSelection', 'reserveSelectedParts'], isTerminal: false },
    { id: 'bh_hoan_tat', label: 'Hoàn tất BH', color: 'bg-green-100 text-green-800', allowedNext: [], allowedFeatures: [], isTerminal: true },
    { id: 'bh_tu_choi', label: 'Từ chối BH', color: 'bg-gray-100 text-gray-800', allowedNext: [], allowedFeatures: [], isTerminal: true },
    { id: 'bh_refund', label: 'Hoàn phí BH', color: 'bg-red-100 text-red-800', allowedNext: [], allowedFeatures: ['enableTechnicianCommission'], isTerminal: true }
];

const colorOptions = [
    'bg-yellow-100 text-yellow-800', 'bg-blue-100 text-blue-800', 'bg-indigo-100 text-indigo-800',
    'bg-purple-100 text-purple-800', 'bg-cyan-100 text-cyan-800', 'bg-teal-100 text-teal-800',
    'bg-orange-100 text-orange-800', 'bg-green-100 text-green-800', 'bg-red-100 text-red-800',
    'bg-gray-100 text-gray-800', 'bg-pink-100 text-pink-800', 'bg-amber-100 text-amber-800',
];

export default function RepairsConfigTab() {
    const [repairStatuses, setRepairStatuses] = useState<WorkflowNode[]>(defaultStatuses);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>(defaultWarrantyStatuses);
    const [workflowTab, setWorkflowTab] = useState<'repair' | 'warranty'>('repair');

    const activeStatuses = workflowTab === 'repair' ? repairStatuses : warrantyStatuses;
    const setActiveStatuses = workflowTab === 'repair' ? setRepairStatuses : setWarrantyStatuses;

    const [trackingGroups, setTrackingGroups] = useState<TrackingGroup[]>([]);
    const [warrantyRules, setWarrantyRules] = useState<WarrantyRule[]>(DEFAULT_WARRANTY_RULES);
    const [warrantyNote, setWarrantyNote] = useState('');

    // UI states
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasLegacyStatuses, setHasLegacyStatuses] = useState(false);

    // Status Modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [newId, setNewId] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newColor, setNewColor] = useState(colorOptions[0]);
    const [dragIndex, setDragIndex] = useState<number | null>(null);

    // Group Modal
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [dragGroupIndex, setDragGroupIndex] = useState<number | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDoc(doc(db, 'system_config', 'repairs'));
                if (snap.exists()) {
                    const d = snap.data();
                    const rs = d.repairStatuses ?? d.statuses ?? defaultStatuses;
                    const ws = d.warrantyStatuses ?? defaultWarrantyStatuses;
                    setRepairStatuses(normalizeRepairWorkflow(rs));
                    setWarrantyStatuses(normalizeWarrantyWorkflow(ws));
                    setHasLegacyStatuses(Array.isArray(d.statuses));
                    // Legacy migration: sort generic arrays to trackingGroups ensuring order
                    if (d.trackingGroups) {
                        setTrackingGroups(d.trackingGroups.sort((a: TrackingGroup, b: TrackingGroup) => a.order - b.order));
                    }
                    if (d.warrantyRules) setWarrantyRules(d.warrantyRules);
                    if (d.warrantyNote !== undefined) setWarrantyNote(d.warrantyNote);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Guarantee order is fixed on save
            const orderedGroups = trackingGroups.map((g, i) => ({ ...g, order: i }));
            const normalizedRepairStatuses = normalizeRepairWorkflow(repairStatuses);
            const normalizedWarrantyStatuses = normalizeWarrantyWorkflow(warrantyStatuses);
            const validationErrors = [
                ...validateWorkflow(normalizedRepairStatuses, 'Workflow sửa chữa'),
                ...validateWorkflow(normalizedWarrantyStatuses, 'Workflow bảo hành'),
                ...validateTrackingGroups(orderedGroups, normalizedRepairStatuses),
            ];

            if (validationErrors.length > 0) {
                toastError(validationErrors[0]);
                return;
            }

            await setDoc(doc(db, 'system_config', 'repairs'), {
                repairStatuses: normalizedRepairStatuses,
                warrantyStatuses: normalizedWarrantyStatuses,
                trackingGroups: orderedGroups,
                warrantyRules,
                warrantyNote,
                workflowSchemaVersion: 2,
                workflowFeatureSemantics: 'exit-gates-v1',
                updatedAt: serverTimestamp(),
            }, { merge: true });

            setRepairStatuses(normalizedRepairStatuses);
            setWarrantyStatuses(normalizedWarrantyStatuses);
            setTrackingGroups(orderedGroups);
            toastSuccess('Đã chuẩn hóa và lưu cấu hình workflow!');
        } catch (err) {
            console.error(err);
            toastError('Lỗi khi lưu!');
        } finally {
            setSaving(false);
        }
    };

    // --- Status Logic ---
    const handleAddStatus = () => {
        if (!newId.trim() || !newLabel.trim()) return;
        const id = newId.trim().toLowerCase().replace(/\s+/g, '_');
        if (activeStatuses.find(s => s.id === id)) {
            toastError('ID đã tồn tại!');
            return;
        }
        setActiveStatuses(prev => [...prev, { id, label: newLabel.trim(), color: newColor, allowedNext: [], allowedFeatures: [], isTerminal: false }]);
        setNewId('');
        setNewLabel('');
        setNewColor(colorOptions[0]);
        setShowAddModal(false);
    };

    const handleDeleteStatus = async (id: string) => {
        if (!await appConfirm(`Xóa trạng thái "${id}"? Lưu ý: Cần gỡ khỏi nhóm tra cứu (nếu có) trước khi lưu.`, { title: 'Xóa trạng thái', confirmText: 'Xóa', destructive: true })) return;
        setActiveStatuses(prev => prev.filter(s => s.id !== id));
        // Remove from tracking groups as well
        setTrackingGroups(prev => prev.map(g => ({
            ...g,
            mappedStatuses: g.mappedStatuses.filter(sId => sId !== id)
        })));
    };

    const handleDragStartStatus = (index: number) => setDragIndex(index);
    const handleDragOverStatus = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        const newList = [...activeStatuses];
        const [moved] = newList.splice(dragIndex, 1);
        newList.splice(index, 0, moved);
        setActiveStatuses(newList);
        setDragIndex(index);
    };
    const handleDragEndStatus = () => setDragIndex(null);

    const updateLabel = (id: string, label: string) => setActiveStatuses(prev => prev.map(s => s.id === id ? { ...s, label } : s));
    const updateColor = (id: string, color: string) => setActiveStatuses(prev => prev.map(s => s.id === id ? { ...s, color } : s));
    const toggleNext = (id: string, nextId: string) => {
        setActiveStatuses(prev => prev.map(s => {
            if (s.id !== id) return s;
            const allowed = s.allowedNext || [];
            return {
                ...s,
                allowedNext: allowed.includes(nextId) ? allowed.filter(n => n !== nextId) : [...allowed, nextId]
            };
        }));
    };
    const toggleTerminal = (id: string) => setActiveStatuses(prev => prev.map(s => s.id === id ? { ...s, isTerminal: !s.isTerminal } : s));
    const toggleFeature = (id: string, feature: string) => {
        setActiveStatuses(prev => prev.map(s => {
            if (s.id !== id) return s;
            const feats = s.allowedFeatures || [];
            return {
                ...s,
                allowedFeatures: feats.includes(feature) ? feats.filter(f => f !== feature) : [...feats, feature]
            };
        }));
    };

    // --- Tracking Group Logic ---
    const handleAddGroup = () => {
        if (!newGroupName.trim()) return;
        const newGroup: TrackingGroup = {
            id: 'idx_' + Date.now().toString(),
            name: newGroupName.trim(),
            mappedStatuses: [],
            order: trackingGroups.length
        };
        setTrackingGroups(prev => [...prev, newGroup]);
        setNewGroupName('');
        setShowAddGroupModal(false);
    };

    const handleDeleteGroup = async (id: string) => {
        if (!await appConfirm('Xóa nhóm tra cứu này?', { title: 'Xóa nhóm tra cứu', confirmText: 'Xóa', destructive: true })) return;
        setTrackingGroups(prev => prev.filter(g => g.id !== id));
    };

    const handleDragStartGroup = (index: number) => setDragGroupIndex(index);
    const handleDragOverGroup = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragGroupIndex === null || dragGroupIndex === index) return;
        const newList = [...trackingGroups];
        const [moved] = newList.splice(dragGroupIndex, 1);
        newList.splice(index, 0, moved);
        setTrackingGroups(newList);
        setDragGroupIndex(index);
    };
    const handleDragEndGroup = () => setDragGroupIndex(null);

    const updateGroupName = (id: string, name: string) => {
        setTrackingGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
    };

    const toggleGroupTerminal = (id: string) => {
        setTrackingGroups(prev => prev.map(g => g.id === id ? { ...g, isTerminal: !g.isTerminal } : g));
    };

    // Toggle mapping: 1 status only belongs to 1 group
    const toggleStatusMapping = (groupId: string, statusId: string) => {
        setTrackingGroups(prev => {
            return prev.map(group => {
                if (group.id === groupId) {
                    // Turn on/off
                    const exists = group.mappedStatuses.includes(statusId);
                    return {
                        ...group,
                        mappedStatuses: exists
                            ? group.mappedStatuses.filter(id => id !== statusId)
                            : [...group.mappedStatuses, statusId]
                    };
                } else {
                    // If turning ON in the current `groupId`, we MUST turn OFF in all other groups
                    // (Ensure 1 status is strictly mapped to only 1 group max)
                    const isTargetActivating = prev.find(g => g.id === groupId) && !prev.find(g => g.id === groupId)!.mappedStatuses.includes(statusId);
                    if (isTargetActivating && group.mappedStatuses.includes(statusId)) {
                        return {
                            ...group,
                            mappedStatuses: group.mappedStatuses.filter(id => id !== statusId)
                        };
                    }
                    return group;
                }
            });
        });
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
            <Loader2 className="animate-spin text-orange-500" size={40} />
            <p className="text-gray-500">Đang tải cấu hình...</p>
        </div>
    );

    return (
        <div className="p-4 md:p-6 pb-32 space-y-10 max-w-6xl mx-auto">
            {/* Master Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 bg-gray-50 z-40 py-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Settings className="text-orange-500" /> Cài đặt Quy trình Sửa chữa
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Quản lý Workflow nội bộ và Nhóm tra cứu cho khách hàng</p>
                </div>
                <button onClick={handleSave} disabled={saving}
                    className="flex justify-center items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 shadow-lg shadow-green-200/50 disabled:opacity-50 transition-all active:scale-95">
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Lưu toàn bộ thay đổi
                </button>
            </div>

            {hasLegacyStatuses && (
                <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold">Phát hiện trường legacy `statuses` trong Firestore.</p>
                        <p className="mt-0.5 text-xs">Ứng dụng chỉ sử dụng `repairStatuses`. Dữ liệu legacy vẫn được giữ nguyên và không bị xóa khi lưu.</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

                {/* ─── CỘT 1: QUẢN LÝ TRẠNG THÁI NỘI BỘ (INTERNAL) ─── */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2 border-gray-200">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <span>🛠 Workflow Nội bộ (Admin)</span>
                        </h2>
                        <button onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors">
                            <Plus size={16} /> Thêm
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => setWorkflowTab('repair')}
                            className={`px-4 py-2 font-semibold text-sm rounded-lg transition-colors ${workflowTab === 'repair' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Sửa chữa
                        </button>
                        <button
                            onClick={() => setWorkflowTab('warranty')}
                            className={`px-4 py-2 font-semibold text-sm rounded-lg transition-colors ${workflowTab === 'warranty' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Bảo hành
                        </button>
                    </div>

                    {/* Flow Preview */}
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-200 p-4">
                        <p className="text-xs font-semibold text-orange-800 mb-2">Flow Hiển thị</p>
                        <div className="flex flex-wrap items-center gap-1">
                            {activeStatuses.map((s, i) => (
                                <div key={s.id} className="flex items-center gap-1">
                                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.color}`}>
                                        {s.label}
                                    </span>
                                    {i < activeStatuses.length - 1 && <ArrowRight size={10} className="text-gray-400" />}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        {activeStatuses.map((status, index) => (
                            <div key={status.id}
                                draggable
                                onDragStart={() => handleDragStartStatus(index)}
                                onDragOver={(e) => handleDragOverStatus(e, index)}
                                onDragEnd={handleDragEndStatus}
                                className={`bg-white rounded-xl border p-3 flex flex-col gap-2 transition-all relative ${dragIndex === index ? 'opacity-50 scale-95 z-0' : 'hover:shadow-md z-10 hover:z-20'}`}>

                                <div className="flex items-center gap-3">
                                    <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                                        <GripVertical size={18} />
                                    </div>
                                    <span className="text-xs font-mono text-gray-400 w-4">{index + 1}</span>

                                    <input title="Tên trạng thái" type="text" value={status.label}
                                        onChange={e => updateLabel(status.id, e.target.value)}
                                        className="flex-1 px-3 py-1.5 text-sm border font-semibold text-gray-900 rounded-lg focus:border-orange-500 focus:outline-none min-w-[120px]" />

                                    <button title="Xóa trạng thái" onClick={() => handleDeleteStatus(status.id)}
                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 pl-9">
                                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{status.id}</span>
                                    <select title="Màu trạng thái" value={status.color} onChange={e => updateColor(status.id, e.target.value)}
                                        className="text-xs px-2 py-1 border rounded-md focus:outline-none">
                                        {colorOptions.map(c => (
                                            <option key={c} value={c}>{c.split(' ')[0].replace('bg-', '').replace('-100', '')}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1 pl-9 text-xs">
                                    <label className="flex items-center gap-1.5 cursor-pointer w-fit">
                                        <input type="checkbox" checked={!!status.isTerminal} onChange={() => toggleTerminal(status.id)} className="rounded border-gray-300 text-red-500 focus:ring-red-500" />
                                        <span className={`font-semibold ${status.isTerminal ? 'text-red-600' : 'text-gray-500'}`}>Điểm kết thúc (Khóa phiếu)</span>
                                    </label>

                                    {/* Feature Toggles */}
                                    <div className="mt-2 space-y-1.5 p-2 bg-gray-50 border border-gray-100 rounded-lg">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Tính năng đi kèm</p>
                                        {WORKFLOW_FEATURES.map(f => (
                                            <label key={f.id} className="flex items-center gap-1.5 cursor-pointer w-fit text-[11px] text-gray-700 hover:text-gray-900 transition-colors" title={f.description}>
                                                <input type="checkbox"
                                                    checked={status.allowedFeatures?.includes(f.id) || false}
                                                    onChange={() => toggleFeature(status.id, f.id)}
                                                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 w-3 h-3"
                                                />
                                                <span>{f.label}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {!status.isTerminal && (
                                        <div className="relative group mt-1">
                                            <button className="px-3 py-1.5 border rounded-lg bg-gray-50 text-gray-700 text-left flex items-center justify-between hover:bg-gray-100 transition-colors">
                                                <span>{status.allowedNext?.length ? `${status.allowedNext.length} luồng tiếp theo` : 'Chưa cấu hình Workflow Next'}</span>
                                                <ArrowRight size={12} className="text-gray-400 ml-2" />
                                            </button>
                                            <div className="absolute top-full left-0 mt-1 w-[280px] bg-white border rounded-xl p-2 shadow-xl z-[100] hidden group-hover:block max-h-[300px] overflow-y-auto">
                                                <p className="text-[10px] text-gray-500 font-semibold mb-2 sticky top-0 bg-white z-10 pb-1 border-b">Tick chọn các đường đi tiếp theo cho [{status.label}]:</p>
                                                <div className="flex flex-col gap-0.5">
                                                    {activeStatuses.filter(s => s.id !== status.id).map(s => (
                                                        <label key={s.id} className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer transition-colors">
                                                            <input type="checkbox"
                                                                className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                                                                checked={status.allowedNext?.includes(s.id) || false}
                                                                onChange={() => toggleNext(status.id, s.id)}
                                                            />
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shadow-sm ${s.color}`}>
                                                                {s.label}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ─── CỘT 2: QUẢN LÝ NHÓM TRA CỨU MÀ HĐ HIỂN THỊ CHO KHÁCH (CUSTOMER) ─── */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2 border-gray-200">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Eye className="text-blue-500" size={20} /> Customer Tracking Groups
                            </h2>
                        </div>
                        <button onClick={() => setShowAddGroupModal(true)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200 transition-colors">
                            <Plus size={16} /> Thêm Nhóm
                        </button>
                    </div>

                    <p className="text-xs text-gray-500">Khách hàng sẽ chỉ nhìn thấy các Nhóm lớn dưới đây. Bạn cần tick Map 1 Trạng thái nội bộ vào 1 Nhóm tương ứng.</p>

                    <div className="space-y-3">
                        {trackingGroups.length === 0 && (
                            <div className="text-center p-6 border-2 border-dashed rounded-xl text-gray-400 text-sm">
                                Chưa có nhóm tra cứu nào.
                            </div>
                        )}
                        {trackingGroups.map((group, index) => (
                            <div key={group.id}
                                draggable
                                onDragStart={() => handleDragStartGroup(index)}
                                onDragOver={(e) => handleDragOverGroup(e, index)}
                                onDragEnd={handleDragEndGroup}
                                className={`bg-white rounded-xl border-2 border-transparent p-4 flex flex-col gap-3 shadow-sm hover:border-blue-200 transition-all ${dragGroupIndex === index ? 'opacity-50 scale-95' : ''}`}>

                                <div className="flex items-center gap-3">
                                    <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                                        <GripVertical size={18} />
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-sm ring-4 ring-blue-50/50">
                                        {index + 1}
                                    </div>

                                    <input title="Tên nhóm tra cứu" type="text" value={group.name}
                                        onChange={e => updateGroupName(group.id, e.target.value)}
                                        placeholder="Nhập tên nhóm tra cứu..."
                                        className="flex-1 px-3 py-2 text-sm border font-bold text-gray-900 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />

                                    <button title="Xóa nhóm tra cứu" onClick={() => handleDeleteGroup(group.id)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {/* Terminal Checkbox */}
                                <div className="pl-11 flex items-center gap-2 text-xs">
                                    <label className="flex items-center gap-1.5 cursor-pointer w-fit">
                                        <input type="checkbox" checked={!!group.isTerminal} onChange={() => toggleGroupTerminal(group.id)} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                                        <span className={`font-semibold ${group.isTerminal ? 'text-blue-600' : 'text-gray-500'}`}>Đánh dấu là nhóm Cuối cùng (Terminal)</span>
                                    </label>
                                </div>

                                {/* Checkbox Mapping List */}
                                <div className="pl-11 pr-2">
                                    <p className="text-xs font-semibold text-gray-500 mb-2">Trạng thái con (Maps to):</p>
                                    <div className="flex flex-wrap gap-2">
                                        {activeStatuses.map(s => {
                                            const isChecked = group.mappedStatuses.includes(s.id);
                                            // Is it mapped to SOME OTHER group?
                                            const isMappedElsewhere = !isChecked && trackingGroups.some(g => g.mappedStatuses.includes(s.id));

                                            // We allow clicking, but if it's already mapped elsewhere, we'll swap it to this group inside `toggleStatusMapping`.
                                            return (
                                                <label key={s.id}
                                                    className={`
                                                        flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full border cursor-pointer border-transparent shadow-sm text-[10px] font-medium transition-all
                                                        ${isChecked ? s.color + ' ring-1 ring-black/10 scale-105' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}
                                                        ${isMappedElsewhere ? 'opacity-30 hover:opacity-100' : ''}
                                                    `}>
                                                    <input
                                                        type="checkbox"
                                                        className="rounded-full w-3 h-3 text-blue-500 focus:ring-0 cursor-pointer"
                                                        checked={isChecked}
                                                        onChange={() => toggleStatusMapping(group.id, s.id)}
                                                    />
                                                    {s.label}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>

                            </div>
                        ))}
                    </div>

                </div>
            </div>

            {/* ─── SECTION 3: CẤU HÌNH BẢO HÀNH ─── */}
            <div className="space-y-4 mt-8">
                <div className="flex items-center justify-between border-b pb-2 border-gray-200">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Shield className="text-emerald-500" size={20} /> Cấu hình Bảo hành theo Loại Linh kiện
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">Khi phiếu hoàn tất, mỗi linh kiện sẽ được gắn thời gian BH dựa trên loại</p>
                    </div>
                    <button
                        onClick={() => setWarrantyRules(prev => [...prev, { partType: '', warrantyMonths: 0 }])}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-200 transition-colors">
                        <Plus size={16} /> Thêm loại
                    </button>
                </div>

                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-8">#</th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Loại linh kiện</th>
                                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-36">BH (tháng)</th>
                                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {warrantyRules.map((rule, idx) => (
                                <tr key={idx} className="hover:bg-emerald-50/50 transition-colors">
                                    <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                                    <td className="px-4 py-2">
                                        <input
                                            title="Loại linh kiện"
                                            type="text"
                                            value={rule.partType}
                                            onChange={e => {
                                                const next = [...warrantyRules];
                                                next[idx] = { ...next[idx], partType: e.target.value };
                                                setWarrantyRules(next);
                                            }}
                                            placeholder="VD: Màn hình, Pin, Camera…"
                                            className="w-full px-3 py-1.5 border rounded-lg text-sm font-medium focus:border-emerald-500 focus:outline-none"
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            title="Thời gian bảo hành"
                                            type="number"
                                            min={0}
                                            value={rule.warrantyMonths}
                                            onChange={e => {
                                                const next = [...warrantyRules];
                                                next[idx] = { ...next[idx], warrantyMonths: Number(e.target.value) || 0 };
                                                setWarrantyRules(next);
                                            }}
                                            className="w-full max-w-[100px] mx-auto block px-3 py-1.5 border rounded-lg text-sm text-center font-semibold focus:border-emerald-500 focus:outline-none"
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <button
                                            title="Xóa loại linh kiện"
                                            onClick={() => setWarrantyRules(prev => prev.filter((_, i) => i !== idx))}
                                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {warrantyRules.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-gray-400 text-sm">
                                        Chưa có loại linh kiện nào. Bấm &quot;Thêm loại&quot; để bắt đầu.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">Ghi chú bảo hành (in trên hóa đơn)</label>
                    <textarea
                        value={warrantyNote}
                        onChange={e => setWarrantyNote(e.target.value)}
                        placeholder="VD: Bảo hành chỉ áp dụng cho lỗi kỹ thuật, không áp dụng cho hư hỏng do rơi vỡ, vào nước…"
                        rows={3}
                        className="w-full px-4 py-3 border rounded-xl text-sm focus:border-emerald-500 focus:outline-none resize-none"
                    />
                </div>
            </div>

            {/* Modal Internal Status */}
            <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Thêm Trạng thái nội bộ" size="md">
                        <div className="space-y-3 pt-2">
                            <div>
                                <label className="text-sm text-gray-700 font-semibold mb-1 block">ID (không dấu, snake_case)</label>
                                <input type="text" value={newId} onChange={e => setNewId(e.target.value)}
                                    placeholder="vd: cho_linh_kien" className="w-full px-4 py-3 border rounded-xl text-sm focus:border-orange-500 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-700 font-semibold mb-1 block">Tên hiển thị</label>
                                <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                                    placeholder="vd: Chờ linh kiện" className="w-full px-4 py-3 border rounded-xl text-sm focus:border-orange-500 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-700 font-semibold mb-1 block">Màu sắc</label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {colorOptions.map(c => (
                                        <button key={c} onClick={() => setNewColor(c)}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border-2 transition-all ${c} ${newColor === c ? 'border-gray-900 shadow-md scale-105' : 'border-transparent'
                                                }`}>
                                            {c.split(' ')[0].replace('bg-', '').replace('-100', '')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-4">
                                <button onClick={handleAddStatus}
                                    className="w-full py-3.5 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/30">
                                    Thêm vào Workflow
                                </button>
                            </div>
                        </div>
            </Modal>

            {/* Modal Tracking Group */}
            <Modal isOpen={showAddGroupModal} onClose={() => setShowAddGroupModal(false)} title="Tạo Nhóm Trạng Thái" size="sm">
                        <div className="space-y-4 pt-2">
                            <div>
                                <label className="text-sm text-gray-700 font-semibold mb-2 block">Tên nhóm (dành cho Khách)</label>
                                <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                                    placeholder="vd: Tiếp nhận thiết bị" className="w-full px-4 py-3 border-2 focus:border-blue-500 rounded-xl text-sm font-medium focus:outline-none" />
                            </div>
                            <div className="pt-2">
                                <button onClick={handleAddGroup}
                                    className="w-full py-3.5 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/30">
                                    Tạo mới Group
                                </button>
                            </div>
                        </div>
            </Modal>
        </div>
    );
}
