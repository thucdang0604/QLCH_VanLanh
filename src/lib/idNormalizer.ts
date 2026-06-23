import { generateSlug } from '@/lib/utils';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Generate a normalized Firestore document ID for new products.
 * - mode 'component' → prefix LK-
 * - mode 'retail' + category 'Accessory' → prefix PK-
 * - mode 'retail' + other → prefix SP-
 *
 * Existing product IDs are NEVER changed — this is only called for new docs.
 */
export async function normalizeDocId(
    name: string,
    mode: 'retail' | 'component',
    category?: string,
): Promise<string> {
    const categorySlug = generateSlug(category || '');
    const prefix =
        mode === 'component'
            ? 'LK'
            : categorySlug === 'accessory' || categorySlug === 'phu-kien'
              ? 'PK'
              : 'SP';

    const slug = generateSlug(name);
    const baseId = `${prefix}-${slug}`;

    for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseId : `${baseId}-${i + 1}`;
        const existing = await getDoc(doc(db, 'products', candidate));
        if (!existing.exists()) return candidate;
    }

    throw new Error('Không thể tạo mã sản phẩm không trùng.');
}
