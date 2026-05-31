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

    // Check for duplicates in Firestore
    const existing = await getDoc(doc(db, 'products', baseId));
    if (existing.exists()) {
        return `${baseId}-${Math.floor(Math.random() * 10000)}`;
    }
    return baseId;
}
