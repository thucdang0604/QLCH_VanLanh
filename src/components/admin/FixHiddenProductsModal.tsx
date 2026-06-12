'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toastSuccess, toastError } from '@/lib/toast';
import Modal from '@/components/admin/Modal';
import type { Product, TaxonomyNode } from '@/lib/types';
import { PART_CATEGORY_LABEL, isPartCategory } from '@/lib/constants';
import { useConfig } from '@/lib/ConfigContext';
import { generateSlug } from '@/lib/utils';
import { isProductArchived, PRODUCT_STATUS } from '@/lib/productLifecycle';

interface FixHiddenProductsModalProps {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
}

interface CategoryChoice {
    id: string;
    label: string;
    category: string;
    categoryIds: string[];
    type: 'retail' | 'component';
}

function buildChoices(retail: TaxonomyNode[], component: TaxonomyNode[]): CategoryChoice[] {
    return [
        ...retail.map((node) => ({
            id: `retail:${node.id}`,
            label: node.name,
            category: node.name,
            categoryIds: [node.id],
            type: 'retail' as const,
        })),
        ...component.map((node) => ({
            id: `component:${node.id}`,
            label: `${PART_CATEGORY_LABEL} / ${node.name}`,
            category: PART_CATEGORY_LABEL,
            categoryIds: [node.id],
            type: 'component' as const,
        })),
    ];
}

function findChoiceByHint(choices: CategoryChoice[], hint: string): CategoryChoice | undefined {
    return choices.find((choice) => generateSlug(choice.categoryIds[0]).includes(hint))
        || choices.find((choice) => generateSlug(choice.label).includes(hint));
}

function suggestChoice(product: Product, choices: CategoryChoice[]): string {
    const currentRoot = product.categoryIds?.[0];
    const current = choices.find((choice) => choice.categoryIds[0] === currentRoot);
    if (current) return current.id;

    const name = generateSlug(`${product.category || ''} ${product.name}`);
    if (isPartCategory(product.category, product.categoryIds) || /man-hinh|lcd|oled|mat-kinh|pin|ic|loa|camera|flex|vo|khung|nap/.test(name)) {
        const componentHint = /laptop|macbook|ram|ssd|ban-phim/.test(name)
            ? 'linh-kien-laptop'
            : /ipad|may-tinh-bang/.test(name)
              ? 'linh-kien-ipad'
              : 'linh-kien-dien-thoai';
        return findChoiceByHint(choices.filter((choice) => choice.type === 'component'), componentHint)?.id || '';
    }
    if (/op-lung|bao-da|kinh-cuong-luc|dan-man|tai-nghe|sac|cap|chuot|hub|adapter|tui|balo|accessory|phu-kien/.test(name)) {
        return findChoiceByHint(choices, 'phu-kien')?.id || '';
    }
    if (/laptop|macbook/.test(name)) return findChoiceByHint(choices, 'laptop')?.id || '';
    if (/tablet|ipad|may-tinh-bang/.test(name)) return findChoiceByHint(choices, 'may-tinh-bang')?.id || '';
    if (/watch|dong-ho/.test(name)) return findChoiceByHint(choices, 'dong-ho')?.id || '';
    return findChoiceByHint(choices, 'dien-thoai')?.id || choices.find((choice) => choice.type === 'retail')?.id || '';
}

export default function FixHiddenProductsModal({ isOpen, onClose, products }: FixHiddenProductsModalProps) {
    const { config } = useConfig();
    const choices = useMemo(
        () => buildChoices(config.taxonomy?.retail || [], config.taxonomy?.component || []),
        [config.taxonomy],
    );
    const validRootIds = useMemo(() => new Set(choices.map((choice) => choice.categoryIds[0])), [choices]);
    const hiddenProducts = useMemo(() => products.filter((product) => {
        if (isProductArchived(product)) return true;
        const rootId = product.categoryIds?.[0];
        return !product.category || !rootId || !validRootIds.has(rootId);
    }), [products, validRootIds]);
    const hiddenProductKey = hiddenProducts.map((product) => `${product.id}:${product.categoryIds?.[0] || ''}`).join('|');

    const [fixes, setFixes] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const nextFixes: Record<string, string> = {};
        hiddenProducts.forEach((product) => {
            nextFixes[product.id] = suggestChoice(product, choices);
        });
        setFixes(nextFixes);
        setDone(false);
    }, [choices, hiddenProductKey, hiddenProducts, isOpen]);

    const handleCategoryChange = (id: string, categoryChoiceId: string) => {
        setFixes((current) => ({ ...current, [id]: categoryChoiceId }));
    };

    const handleSaveAll = async () => {
        const toFix = hiddenProducts.filter((product) => choices.some((choice) => choice.id === fixes[product.id]));
        if (toFix.length === 0) return;

        setSaving(true);
        try {
            const batch = writeBatch(db);
            toFix.forEach((product) => {
                const choice = choices.find((item) => item.id === fixes[product.id]);
                if (!choice) return;
                batch.update(doc(db, 'products', product.id), {
                    category: choice.category,
                    categoryIds: choice.categoryIds,
                    ...(isProductArchived(product) ? {
                        status: PRODUCT_STATUS.ACTIVE,
                        archivedAt: null,
                    } : {}),
                    updatedAt: serverTimestamp(),
                });
            });
            await batch.commit();
            toastSuccess(`Đã khắc phục/khôi phục ${toFix.length} sản phẩm thành công!`);
            setDone(true);
        } catch (error) {
            console.error(error);
            toastError('Lỗi khi khắc phục sản phẩm!');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Khắc phục/khôi phục sản phẩm bị ẩn" size="3xl">
            <div className="p-6 space-y-4">
                {done ? (
                    <div className="text-center py-12">
                        <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                        <p className="text-lg font-semibold text-gray-800">Đã khắc phục xong!</p>
                        <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors">
                            Đóng
                        </button>
                    </div>
                ) : hiddenProducts.length === 0 ? (
                    <div className="text-center py-12">
                        <CheckCircle2 size={48} className="mx-auto text-green-400 mb-4" />
                        <p className="text-gray-600 font-medium">Không tìm thấy sản phẩm cần khắc phục hoặc khôi phục.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                            <p className="text-sm text-amber-800">
                                Phát hiện <strong>{hiddenProducts.length}</strong> sản phẩm bị lưu trữ hoặc thiếu/sai taxonomy. Kiểm tra gợi ý trước khi lưu.
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[700px]">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Tên sản phẩm</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Danh mục hiện tại</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Taxonomy khôi phục</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {hiddenProducts.map((product) => (
                                        <tr key={product.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium text-gray-900 line-clamp-1">{product.name}</p>
                                                <p className="text-xs text-gray-400 font-mono">{product.id}</p>
                                                {isProductArchived(product) && (
                                                    <span className="mt-1 inline-flex px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-medium">
                                                        Đã lưu trữ
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-red-500">{product.categoryIds?.[0] || product.category || 'Trống'}</td>
                                            <td className="px-4 py-3">
                                                <select
                                                    title="Taxonomy khôi phục"
                                                    value={fixes[product.id] || ''}
                                                    onChange={(event) => handleCategoryChange(product.id, event.target.value)}
                                                    className="h-9 w-full px-3 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                                                >
                                                    <option value="">-- Chọn taxonomy --</option>
                                                    {choices.map((choice) => (
                                                        <option key={choice.id} value={choice.id}>{choice.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end gap-3 pt-2 border-t">
                            <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                Hủy
                            </button>
                            <button onClick={handleSaveAll} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                                {saving && <Loader2 size={16} className="animate-spin" />}
                                Xác nhận lưu tất cả ({hiddenProducts.length})
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
