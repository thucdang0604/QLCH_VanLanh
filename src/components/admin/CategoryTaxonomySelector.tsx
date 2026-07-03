'use client';

import { useConfig } from '@/lib/ConfigContext';


interface CategoryTaxonomySelectorProps {
    type: 'retail' | 'service' | 'component';
    value: string[]; // Array of selected node IDs, e.g. ['dien-thoai', 'dien-thoai/iphone']
    onChange: (ids: string[], legacyCategoryName: string, legacySubCategoryName: string) => void;
    compact?: boolean;
}

export default function CategoryTaxonomySelector({ type, value, onChange, compact }: CategoryTaxonomySelectorProps) {
    const { config } = useConfig();
    const tree = config.taxonomy?.[type] || [];

    const l1Id = value[0] || '';
    const l2Id = value[1] || '';
    const l3Id = value[2] || '';

    const l1Node = tree.find(n => n.id === l1Id);
    const l2Node = l1Node?.children?.find(n => n.id === l2Id);


    const l1Options = tree;
    const l2Options = l1Node?.children || [];
    const l3Options = l2Node?.children || [];

    const handleChange = (level: number, id: string) => {
        let newIds: string[] = [];
        let catName = '';
        let subCatName = '';

        if (level === 1) {
            if (!id) {
                onChange([], '', '');
                return;
            }
            newIds = [id];
            const node = tree.find(n => n.id === id);
            catName = node?.name || '';
        } else if (level === 2) {
            if (!id) {
                newIds = [l1Id];
                catName = l1Node?.name || '';
            } else {
                newIds = [l1Id, id];
                catName = l1Node?.name || '';
                const node = l1Node?.children?.find(n => n.id === id);
                subCatName = node?.name || '';
            }
        } else if (level === 3) {
            if (!id) {
                newIds = [l1Id, l2Id];
                catName = l1Node?.name || '';
                subCatName = l2Node?.name || '';
            } else {
                newIds = [l1Id, l2Id, id];
                catName = l1Node?.name || '';
                subCatName = l2Node?.name || '';
            }
        }

        onChange(newIds, catName, subCatName);
    };

    const selectCls = compact
        ? 'w-full h-7 px-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-shadow text-xs'
        : 'w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow text-sm';

    return (
        <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
            {/* Level 1 */}
            <div className={compact ? 'min-w-0' : ''}>
                <select
                    title="Danh mục chính"
                    value={l1Id}
                    onChange={(e) => handleChange(1, e.target.value)}
                    className={selectCls}
                >
                    <option value="">{compact ? 'Danh mục chính' : '-- Chọn danh mục chính --'}</option>
                    {l1Options.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                </select>
            </div>

            {/* Level 2 */}
            {l2Options.length > 0 && (
                <div className={compact ? 'min-w-0' : ''}>
                    <select
                        title="Danh mục cấp 2"
                        value={l2Id}
                        onChange={(e) => handleChange(2, e.target.value)}
                        className={selectCls}
                    >
                        <option value="">{compact ? 'Cấp 2' : '-- Chọn danh mục cấp 2 --'}</option>
                        {l2Options.map(n => (
                            <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Level 3 */}
            {l3Options.length > 0 && (
                <div className={compact ? 'min-w-0' : ''}>
                    <select
                        title="Danh mục cấp 3"
                        value={l3Id}
                        onChange={(e) => handleChange(3, e.target.value)}
                        className={selectCls}
                    >
                        <option value="">{compact ? 'Cấp 3' : '-- Chọn danh mục cấp 3 --'}</option>
                        {l3Options.map(n => (
                            <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}
