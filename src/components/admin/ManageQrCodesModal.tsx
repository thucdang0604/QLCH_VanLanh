'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Star, Loader2, AlertTriangle } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { toastSuccess, toastError } from '@/lib/toast';
import Modal from '@/components/admin/Modal';
import type { Product, QrCodeHistoryEntry } from '@/lib/types';
import { normalizeProductCode } from '@/lib/productCodes';
import { assertProductCodesAvailable, updateProductWithCodes } from '@/lib/productCodeRegistry';

interface ManageQrCodesModalProps {
    product: (Product & { id: string }) | null;
    onClose: () => void;
}

export default function ManageQrCodesModal({ product, onClose }: ManageQrCodesModalProps) {
    const { user } = useAuth();
    const [codes, setCodes] = useState<string[]>([]);
    const [primaryIdx, setPrimaryIdx] = useState(0);
    const [newCode, setNewCode] = useState('');
    const [checking, setChecking] = useState(false);
    const [duplicateError, setDuplicateError] = useState('');
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState<QrCodeHistoryEntry[]>([]);

    useEffect(() => {
        if (!product) return;
        const existing = product.qrCodes?.length ? [...product.qrCodes] : [];
        // If no qrCodes yet, seed from sku/barcode/productCode
        if (existing.length === 0) {
            const primary = product.sku || product.barcode || product.productCode || '';
            if (primary) existing.push(primary);
        }
        setCodes(existing);
        setPrimaryIdx(0);
        setHistory(product.qrCodeHistory || []);
        setNewCode('');
        setDuplicateError('');
    }, [product]);

    if (!product) return null;

    const checkDuplicate = async (code: string): Promise<string | null> => {
        const normalized = normalizeProductCode(code);
        if (!normalized) return 'Mã QR không hợp lệ';
        if (codes.includes(normalized)) return 'Mã này đã có trong danh sách';

        try {
            await assertProductCodesAvailable([normalized], product.id);
        } catch (error) {
            return error instanceof Error ? error.message : 'Mã QR đã được gán cho sản phẩm khác';
        }
        return null;
    };

    const handleAddCode = async () => {
        const normalized = normalizeProductCode(newCode);
        if (!normalized) return;

        setChecking(true);
        setDuplicateError('');
        try {
            const err = await checkDuplicate(normalized);
            if (err) {
                setDuplicateError(err);
                return;
            }
            setCodes(prev => [...prev, normalized]);
            setHistory(prev => [...prev, {
                action: 'add',
                code: normalized,
                adminName: user?.displayName || user?.email || 'Admin',
                timestamp: Timestamp.now(),
            }]);
            setNewCode('');
        } finally {
            setChecking(false);
        }
    };

    const handleRemoveCode = (idx: number) => {
        const removed = codes[idx];
        setCodes(prev => prev.filter((_, i) => i !== idx));
        if (primaryIdx === idx) setPrimaryIdx(0);
        else if (primaryIdx > idx) setPrimaryIdx(prev => prev - 1);
        setHistory(prev => [...prev, {
            action: 'remove',
            code: removed,
            adminName: user?.displayName || user?.email || 'Admin',
            timestamp: Timestamp.now(),
        }]);
    };

    const handleSetPrimary = (idx: number) => {
        if (idx === primaryIdx) return;
        setPrimaryIdx(idx);
        setHistory(prev => [...prev, {
            action: 'set_primary',
            code: codes[idx],
            adminName: user?.displayName || user?.email || 'Admin',
            timestamp: Timestamp.now(),
        }]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const primary = codes[primaryIdx] || '';
            await updateProductWithCodes(product.id, codes, {
                qrCodeHistory: history,
                // Sync primary code to sku/barcode/productCode
                ...(primary ? { sku: primary, barcode: primary, productCode: primary } : {}),
            });
            toastSuccess('Đã lưu mã QR thành công!');
            onClose();
        } catch (err) {
            console.error(err);
            toastError('Lỗi khi lưu mã QR!');
        } finally {
            setSaving(false);
        }
    };

    const formatTs = (ts: QrCodeHistoryEntry['timestamp']) => {
        if (!ts) return '';
        const d = typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function'
            ? ts.toDate()
            : new Date(ts as unknown as number | string);
        return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };

    const actionLabel: Record<string, string> = { add: 'Thêm mã', remove: 'Xóa mã', set_primary: 'Chọn mã chính' };

    return (
        <Modal isOpen={!!product} onClose={onClose} title={`Quản lý mã QR — ${product.name}`} size="lg">
            <div className="p-6 space-y-6">
                {/* Current codes list */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Danh sách mã QR</h3>
                    {codes.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Chưa có mã QR nào</p>
                    ) : (
                        <div className="space-y-2">
                            {codes.map((code, idx) => (
                                <div key={code} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${idx === primaryIdx ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                                    <span className="font-mono text-sm flex-1 text-gray-800">{code}</span>
                                    {idx === primaryIdx && (
                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full uppercase">Chính</span>
                                    )}
                                    {idx !== primaryIdx && (
                                        <button
                                            onClick={() => handleSetPrimary(idx)}
                                            className="p-1.5 hover:bg-yellow-100 text-yellow-600 rounded-lg transition-colors"
                                            title="Đặt làm mã chính"
                                        >
                                            <Star size={14} />
                                        </button>
                                    )}
                                    {codes.length > 1 && (
                                        <button
                                            onClick={() => handleRemoveCode(idx)}
                                            className="p-1.5 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
                                            title="Xóa mã"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add new code */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Thêm mã QR mới</h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newCode}
                            onChange={(e) => { setNewCode(e.target.value); setDuplicateError(''); }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCode()}
                            placeholder="Nhập mã QR mới..."
                            className="flex-1 h-10 px-3 border rounded-lg focus:border-orange-500 focus:outline-none text-sm font-mono"
                        />
                        <button
                            onClick={handleAddCode}
                            disabled={!newCode.trim() || checking}
                            className="flex items-center gap-1.5 px-4 h-10 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {checking ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            Thêm
                        </button>
                    </div>
                    {duplicateError && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                            <AlertTriangle size={16} className="shrink-0" />
                            {duplicateError}
                        </div>
                    )}
                </div>

                {/* History timeline */}
                {history.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Nhật ký thay đổi</h3>
                        <div className="max-h-40 overflow-y-auto space-y-1.5">
                            {[...history].reverse().map((entry, idx) => (
                                <div key={idx} className="flex items-baseline gap-2 text-xs text-gray-500">
                                    <span className="text-gray-400 shrink-0">{formatTs(entry.timestamp)}</span>
                                    <span className="font-medium text-gray-700">{entry.adminName}</span>
                                    <span>{actionLabel[entry.action] || entry.action}</span>
                                    <span className="font-mono text-gray-600">{entry.code}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Save button */}
                <div className="flex justify-end gap-3 pt-2 border-t">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                    >
                        {saving && <Loader2 size={16} className="animate-spin" />}
                        Lưu thay đổi
                    </button>
                </div>
            </div>
        </Modal>
    );
}
