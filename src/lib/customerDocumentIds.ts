import { doc, getDoc } from 'firebase/firestore';

import { buildContactlessDocumentBaseId, type ContactIdentityInput } from '@/lib/contactIdentity';
import { db } from '@/lib/firebase';
import { normalizeVietnamPhone } from '@/lib/phone';
import { generateSlug } from '@/lib/utils';

export interface CustomerDocumentIdInput extends ContactIdentityInput {
    code?: string;
}

export function buildCustomerDocumentBaseId(data: CustomerDocumentIdInput): string {
    const normalizedPhone = data.phone ? normalizeVietnamPhone(data.phone) : null;
    if (normalizedPhone) return normalizedPhone.local;

    const explicitCode = generateSlug(String(data.code || '').trim()).slice(0, 90);
    if (explicitCode) return explicitCode.startsWith('KH-') ? explicitCode : `KH-${explicitCode}`;

    return buildContactlessDocumentBaseId('KH', data);
}

export async function reserveCustomerDocumentId(data: CustomerDocumentIdInput): Promise<string> {
    const baseId = buildCustomerDocumentBaseId(data);
    for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseId : `${baseId}-${i + 1}`;
        const snap = await getDoc(doc(db, 'customers', candidate));
        if (!snap.exists()) return candidate;
    }
    throw new Error('Không thể tạo mã khách hàng không trùng.');
}
