import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { generateSlug } from '@/lib/utils';

export function buildSupplierDocumentBaseId(data: { name?: string; phone?: string }): string {
    const slug = generateSlug(String(data.phone || data.name || 'supplier')).slice(0, 90) || 'supplier';
    return `NCC-${slug}`;
}

export async function reserveSupplierDocumentId(data: { name?: string; phone?: string }): Promise<string> {
    const baseId = buildSupplierDocumentBaseId(data);
    for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseId : `${baseId}-${i + 1}`;
        const snap = await getDoc(doc(db, 'suppliers', candidate));
        if (!snap.exists()) return candidate;
    }
    throw new Error('Không thể tạo mã nhà cung cấp không trùng.');
}
