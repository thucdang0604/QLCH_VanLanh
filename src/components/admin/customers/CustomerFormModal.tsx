'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Save, AlertCircle, Image as ImageIcon, Loader2, QrCode, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { ContactMethod, ContactMethodType } from '@/lib/types/contact';
import { normalizeVietnamPhone } from '@/lib/phone';
import { extractZaloQrIdentity, importZaloContactCardImage } from '@/lib/zaloContactCardImport';

export interface CustomerFormData {
    phone: string;
    name: string;
    type: 'retail' | 'wholesale';
    primaryContactType?: ContactMethodType;
    zalo?: string;
    facebook?: string;
    otherContact?: string;
    zaloExternalId?: string;
    zaloProfileUrl?: string;
    zaloQrText?: string;
    contactMethods?: ContactMethod[];
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
        primaryContactType: 'phone',
        zalo: '',
        facebook: '',
        otherContact: '',
        zaloExternalId: '',
        zaloProfileUrl: '',
        zaloQrText: '',
        contactMethods: [],
        tags: [],
        note: '',
        address: '',
        email: ''
    });
    const [saving, setSaving] = useState(false);
    const [zaloImporting, setZaloImporting] = useState(false);
    const [zaloScanning, setZaloScanning] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const zaloImageInputRef = useRef<HTMLInputElement>(null);
    const zaloScanVideoRef = useRef<HTMLVideoElement>(null);
    const zaloScanControlsRef = useRef<{ stop: () => void } | null>(null);

    useEffect(() => {
        if (isOpen) {
            const contactMethods = initialData?.contactMethods || [];
            const contactValue = (type: ContactMethodType) => contactMethods.find(method => method.type === type)?.value || '';
            const zaloMethod = contactMethods.find(method => method.type === 'zalo');
            if (initialData) {
                setForm({
                    phone: initialData.phone || '',
                    name: initialData.name || '',
                    type: initialData.type || 'retail',
                    primaryContactType: initialData.primaryContactType || contactMethods.find(method => method.isPrimary)?.type || (initialData.phone ? 'phone' : 'zalo'),
                    zalo: initialData.zalo || contactValue('zalo'),
                    facebook: initialData.facebook || contactValue('facebook'),
                    otherContact: initialData.otherContact || contactValue('other'),
                    zaloExternalId: initialData.zaloExternalId || zaloMethod?.externalId || '',
                    zaloProfileUrl: initialData.zaloProfileUrl || zaloMethod?.profileUrl || '',
                    zaloQrText: initialData.zaloQrText || '',
                    contactMethods,
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
                    primaryContactType: 'phone',
                    zalo: '',
                    facebook: '',
                    otherContact: '',
                    zaloExternalId: '',
                    zaloProfileUrl: '',
                    zaloQrText: '',
                    contactMethods: [],
                    tags: [],
                    note: '',
                    address: '',
                    email: ''
                });
            }
            setTagInput('');
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        if (!isOpen) {
            zaloScanControlsRef.current?.stop();
            zaloScanControlsRef.current = null;
            setZaloScanning(false);
        }
        return () => {
            zaloScanControlsRef.current?.stop();
            zaloScanControlsRef.current = null;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const savedPhone = isEditMode && initialData?.phone
        ? (normalizeVietnamPhone(initialData.phone)?.local || initialData.phone.trim())
        : '';
    const isPhoneLocked = Boolean(savedPhone);

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Vui lòng nhập tên KH'); return; }
        if (form.phone.trim() && !normalizeVietnamPhone(form.phone)) {
            toast.error('SĐT không hợp lệ (VD: 0901234567)'); return;
        }
        const nextPhone = form.phone.trim()
            ? (normalizeVietnamPhone(form.phone)?.local || form.phone.trim())
            : '';
        if (isPhoneLocked && nextPhone !== savedPhone) {
            toast.error('Khách hàng đã có SĐT nên không thể thay đổi SĐT.');
            return;
        }
        const hasContact = [
            form.phone,
            form.zalo,
            form.facebook,
            form.email,
            form.address,
            form.otherContact,
            form.note,
        ].some(value => Boolean(value?.trim()));
        if (!hasContact) {
            toast.error('Vui lòng nhập ít nhất một kênh liên hệ hoặc ghi chú nhận diện');
            return;
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

    const applyZaloQrText = (qrText: string) => {
        const zalo = extractZaloQrIdentity(qrText);
        if (!zalo) {
            toast.error('QR không phải danh thiếp Zalo hợp lệ');
            return false;
        }

        setForm(p => ({
            ...p,
            zalo: zalo.profileUrl,
            primaryContactType: p.primaryContactType === 'phone' && !p.phone ? 'zalo' : p.primaryContactType,
            zaloExternalId: zalo.externalId,
            zaloProfileUrl: zalo.profileUrl,
            zaloQrText: qrText,
        }));
        toast.success('Đã điền link Zalo từ QR');
        return true;
    };

    const stopZaloQrScanner = () => {
        zaloScanControlsRef.current?.stop();
        zaloScanControlsRef.current = null;
        setZaloScanning(false);
    };

    const startZaloQrScanner = async () => {
        if (!zaloScanVideoRef.current) return;
        setZaloScanning(true);
        try {
            const { BrowserQRCodeReader } = await import('@zxing/browser');
            const reader = new BrowserQRCodeReader();
            const controls = await reader.decodeFromVideoDevice(
                undefined,
                zaloScanVideoRef.current,
                (result) => {
                    if (!result) return;
                    if (applyZaloQrText(result.getText())) {
                        stopZaloQrScanner();
                    }
                },
            );
            zaloScanControlsRef.current = controls;
        } catch (error) {
            console.error('Zalo QR scanner error:', error);
            toast.error('Không mở được camera để quét QR');
            stopZaloQrScanner();
        }
    };

    const handleZaloCardImage = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('File QR phải là hình ảnh');
            return;
        }

        setZaloImporting(true);
        try {
            const result = await importZaloContactCardImage(file);
            if (!result.zalo) {
                toast.error('Ảnh chưa có QR danh thiếp Zalo hợp lệ');
                return;
            }

            applyZaloQrText(result.qrText);
        } catch (error) {
            console.error('Zalo contact card import error:', error);
            toast.error('Không đọc được QR trong ảnh');
        } finally {
            setZaloImporting(false);
            if (zaloImageInputRef.current) zaloImageInputRef.current.value = '';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-bold text-gray-900">{isEditMode ? 'Cập nhật Khách hàng' : 'Thêm mới Khách hàng'}</h2>
                    <button title="Đóng" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
                </div>
                
                <div className="p-5 space-y-4">
                    <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-3">
                        <input
                            ref={zaloImageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={event => handleZaloCardImage(event.target.files?.[0])}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={zaloScanning ? stopZaloQrScanner : startZaloQrScanner}
                                disabled={zaloImporting}
                                className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                            >
                                {zaloScanning ? <Square size={16} /> : <QrCode size={16} />}
                                {zaloScanning ? 'Dừng quét QR' : 'Quét QR Zalo'}
                            </button>
                            <button
                                type="button"
                                onClick={() => zaloImageInputRef.current?.click()}
                                disabled={zaloImporting || zaloScanning}
                                className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                            >
                                {zaloImporting ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                                Chọn ảnh QR
                            </button>
                            {form.zaloExternalId && (
                                <span className="text-xs font-medium text-sky-700">
                                    QR: {form.zaloExternalId}
                                </span>
                            )}
                        </div>
                        <video
                            ref={zaloScanVideoRef}
                            muted
                            playsInline
                            className={`w-full rounded-lg border border-sky-200 bg-black ${zaloScanning ? 'block' : 'hidden'}`}
                        />
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Số điện thoại</label>
                        <input 
                            title="Số điện thoại"
                            value={form.phone} 
                            onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^\d+]/g, '') }))}
                            disabled={isPhoneLocked}
                            placeholder="VD: 0901234567"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                        />
                        {isPhoneLocked ? (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1"><AlertCircle size={12} /> SĐT đã lưu là định danh riêng, không chỉnh sửa tại hồ sơ này.</p>
                        ) : isEditMode ? (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1"><AlertCircle size={12} /> Hồ sơ chưa có SĐT, có thể bổ sung SĐT và vẫn giữ nguyên mã KH hiện tại.</p>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Link Zalo</label>
                            <input
                                title="Link Zalo"
                                value={form.zalo}
                                onChange={e => setForm(p => ({ ...p, zalo: e.target.value }))}
                                placeholder="http://zaloapp.com/qr/p/..."
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Facebook</label>
                            <input
                                title="Facebook"
                                value={form.facebook}
                                onChange={e => setForm(p => ({ ...p, facebook: e.target.value }))}
                                placeholder="Link/profile Facebook"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Kênh liên hệ chính</label>
                            <select
                                title="Kênh liên hệ chính"
                                value={form.primaryContactType || 'phone'}
                                onChange={e => setForm(p => ({ ...p, primaryContactType: e.target.value as ContactMethodType }))}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
                            >
                                <option value="phone">SĐT</option>
                                <option value="zalo">Zalo</option>
                                <option value="facebook">Facebook</option>
                                <option value="email">Email</option>
                                <option value="address">Địa chỉ</option>
                                <option value="other">Khác</option>
                                <option value="note">Ghi chú</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Liên hệ khác</label>
                            <input
                                title="Liên hệ khác"
                                value={form.otherContact}
                                onChange={e => setForm(p => ({ ...p, otherContact: e.target.value }))}
                                placeholder="VD: chỉ nhận Messenger, người giới thiệu..."
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                            />
                        </div>
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
