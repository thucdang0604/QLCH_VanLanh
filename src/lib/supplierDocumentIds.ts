import { doc, getDoc } from 'firebase/firestore';

import { buildContactlessDocumentBaseId, type ContactIdentityInput } from '@/lib/contactIdentity';
import { db } from '@/lib/firebase';
import { generateSlug } from '@/lib/utils';

export interface SupplierDocumentIdInput extends ContactIdentityInput {
    code?: string;
    taxCode?: string;
    bankAccount?: string;
    companyName?: string;
}

export function buildSupplierDocumentBaseId(data: SupplierDocumentIdInput): string {
    const explicitCode = generateSlug(String(data.code || '').trim()).slice(0, 90);
    if (explicitCode) return explicitCode.startsWith('NCC-') ? explicitCode : `NCC-${explicitCode}`;

    const stableBusinessId = generateSlug(String(data.taxCode || data.bankAccount || '').trim()).slice(0, 90);
    if (stableBusinessId) return `NCC-${stableBusinessId}`;

    const contactBaseId = buildContactlessDocumentBaseId('NCC', {
        ...data,
        name: data.name || data.companyName,
    }).slice(0, 94);
    if (contactBaseId) return contactBaseId;

    const slug = generateSlug(data.companyName || data.name || 'supplier').slice(0, 90) || 'supplier';
    return `NCC-${slug}`;
}

export async function reserveSupplierDocumentId(data: SupplierDocumentIdInput): Promise<string> {
    const baseId = buildSupplierDocumentBaseId(data);
    for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseId : `${baseId}-${i + 1}`;
        const snap = await getDoc(doc(db, 'suppliers', candidate));
        if (!snap.exists()) return candidate;
    }
    throw new Error('Không thể tạo mã nhà cung cấp không trùng.');
}
