'use client';

import { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export interface CustomerFormData {
    phone: string;
    name: string;
    type: 'retail' | 'wholesale';
    tags?: string[];
    note?: string;
    address?: string;
    email?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CustomerFormData) => Promise<void>;
    initialData?: CustomerFormData | null;
    isEditMode?: boolean;
    availableTags?: string[]; // for tags combobox
}

export default function CustomerFormModal({ isOpen, onClose, onSave, initialData, isEditMode, availableTags = [] }: Props) {
    const [form, setForm] = useState<CustomerFormData>({
        phone: '',
        name: '',
        type: 'retail',
        tags: [],
        note: '',
        address: '',
        email: ''
    });
    const [saving, setSaving] = useState(false);
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setForm({
                    phone: initialData.phone || '',
                    name: initialData.name || '',
                    type: initialData.type || 'retail',
                    tags: initialData.tags || [],
                    note: initialData.note || '',
                    address: initialData.address || '',
                    email: initialData.email || '',
                });
            } else {
                setForm({
                    phone: '',
                    name: '',
                    type: 'retail',
                    tags: [],
                    note: '',
                    address: '',
                    email: ''
                });
            }
            setTagInput('');
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!form.phone.trim()) { toast.error('Vui lòng nhập SĐT'); return; }
        if (!form.name.trim()) { toast.error('Vui lòng nhập tên KH'); return; }
        if (!/^0\d{9,10}$/.test(form.phone.trim())) {
            toast.error('SĐT không hợp lệ (VD: 0901234567)'); return;
        }

        setSaving(true);
        try {
            await onSave(form);
            onClose();
        } catch (error: unknown) {
            console.error('Error saving customer:', error);
            toast.error((error as Error).message || 'Có lỗi xảy ra');
        } finally {
            setSaving(false);
        }
    };

    const addTag = (tag: string) => {
        const trimmed = tag.trim();
        if (!trimmed) return;
        if (!form.tags?.includes(trimmed)) {
            setForm(p => ({ ...p, tags: [...(p.tags || []), trimmed] }));
        }
        setTagInput('');
    };

    const removeTag = (tagToRemove: string) => {
        setForm(p => ({ ...p, tags: p.tags?.filter(t => t !== tagToRemove) || [] }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-bold text-gray-900">{isEditMode ? 'Cập nhật Khách hàng' : 'Thêm mới Khách hàng'}</h2>
                    <button title="Đóng" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
                </div>
                
                <div className="p-5 space-y-4">
                    {/* Phone (Immutable if edit mode) */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Số điện thoại *</label>
                        <input 
                            title="Số điện thoại"
                            value={form.phone} 
                            onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^0-9]/g, '') }))}
                            disabled={isEditMode}
                            placeholder="VD: 0901234567"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                        />
                        {isEditMode && <p className="text-xs text-gray-400 flex items-center gap-1 mt-1"><AlertCircle size={12} /> Số điện thoại không thể thay đổi</p>}
                    </div>

                    {/* Name */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Họ và tên *</label>
                        <input 
                            title="Họ và tên"
                            value={form.name} 
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Tên khách hàng"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" 
                        />
                    </div>

                    {/* Type */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Loại khách hàng</label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className={`border rounded-lg p-3 flex items-center gap-2 cursor-pointer transition-colors ${form.type === 'retail' ? 'border-green-500 bg-green-50' : 'hover:bg-gray-50'}`}>
                                <input type="radio" name="type" value="retail" checked={form.type === 'retail'} onChange={() => setForm(p => ({ ...p, type: 'retail' }))} className="hidden" />
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${form.type === 'retail' ? 'border-green-500' : 'border-gray-300'}`}>
                                    {form.type === 'retail' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                                </div>
                                <span className={`text-sm font-medium ${form.type === 'retail' ? 'text-green-700' : 'text-gray-600'}`}>Khách lẻ</span>
                            </label>
                            <label className={`border rounded-lg p-3 flex items-center gap-2 cursor-pointer transition-colors ${form.type === 'wholesale' ? 'border-purple-500 bg-purple-50' : 'hover:bg-gray-50'}`}>
                                <input type="radio" name="type" value="wholesale" checked={form.type === 'wholesale'} onChange={() => setForm(p => ({ ...p, type: 'wholesale' }))} className="hidden" />
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${form.type === 'wholesale' ? 'border-purple-500' : 'border-gray-300'}`}>
                                    {form.type === 'wholesale' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                                </div>
                                <span className={`text-sm font-medium ${form.type === 'wholesale' ? 'text-purple-700' : 'text-gray-600'}`}>Khách sỉ / Thợ</span>
                            </label>
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Thẻ (Tags)</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {(form.tags || []).map(tag => (
                                <span key={tag} className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-1 rounded-md flex items-center gap-1 font-medium">
                                    {tag}
                                    <button title="Xóa" onClick={() => removeTag(tag)} className="hover:text-blue-900"><X size={12} /></button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2 relative group">
                            <input 
                                title="Thẻ"
                                value={tagInput} 
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag(tagInput);
                                    }
                                }}
                                placeholder="Nhập tag (VD: VIP, Khách quen...)"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" 
                            />
                            <button onClick={() => addTag(tagInput)} type="button" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                                Thêm
                            </button>
                            {/* Combobox suggestions if available */}
                            {availableTags.length > 0 && tagInput && (
                                <div className="absolute top-full left-0 right-16 mt-1 bg-white border shadow-lg rounded-lg max-h-40 overflow-y-auto z-20 hidden group-focus-within:block">
                                    {availableTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !form.tags?.includes(t)).map(t => (
                                        <button key={t} type="button" onMouseDown={(e) => { e.preventDefault(); addTag(t); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700">
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Extra Info */}
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Email (Không bắt buộc)</label>
                            <input 
                                type="email"
                                value={form.email} 
                                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                placeholder="Email khách hàng"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" 
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Địa chỉ (Không bắt buộc)</label>
                            <input 
                                value={form.address} 
                                onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                                placeholder="Địa chỉ giao hàng/liên hệ"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" 
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú (Không bắt buộc)</label>
                            <textarea 
                                value={form.note} 
                                onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                                placeholder="Sở thích, lưu ý về khách hàng..."
                                rows={2}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" 
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 p-5 border-t bg-gray-50 sticky bottom-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors">Hủy</button>
                    <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium flex items-center gap-2">
                        {saving ? 'Đang lưu...' : <><Save size={16} /> Lưu khách hàng</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
