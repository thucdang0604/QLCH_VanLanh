import { doc, getDoc } from 'firebase/firestore';

import {
    buildContactlessDocumentBaseId,
    buildContactMethods,
    buildContactSearchKeywords,
    getPrimaryContact,
    type ContactIdentityInput,
} from '@/lib/contactIdentity';
import { db } from '@/lib/firebase';
import { generateSlug } from '@/lib/utils';
import type { ContactMethodType } from '@/lib/types/contact';

export interface SupplierDocumentIdInput extends ContactIdentityInput {
    code?: string;
    taxCode?: string;
    bankAccount?: string;
    companyName?: string;
}

export function buildInlineSupplierContactInput(name: string, contactValue: string): ContactIdentityInput {
    const contact = contactValue.trim();
    const lower = contact.toLowerCase();
    const digits = contact.replace(/[^0-9]/g, '');
    const primaryType: ContactMethodType = !contact
        ? 'other'
        : digits.length >= 9
            ? 'phone'
            : lower.startsWith('zalo')
                ? 'zalo'
                : lower.includes('facebook') || lower.includes('fb.com') || lower.includes('m.me/')
                    ? 'facebook'
                    : 'other';

    return {
        name,
        phone: primaryType === 'phone' ? contact : '',
        zalo: primaryType === 'zalo' ? contact.replace(/^zalo\s*[:\-]?\s*/i, '') : '',
        facebook: primaryType === 'facebook' ? contact.replace(/^(facebook|fb)\s*[:\-]?\s*/i, '') : '',
        other: primaryType === 'other' ? contact : '',
        primaryType,
        source: 'manual',
    };
}

export function buildSupplierContactDocumentFields(input: ContactIdentityInput) {
    const contactMethods = buildContactMethods(input);
    const primaryContact = getPrimaryContact(contactMethods);
    const phoneMethod = contactMethods.find(method => method.type === 'phone');

    return {
        phone: phoneMethod?.normalizedValue || '',
        primaryPhone: phoneMethod?.normalizedValue || '',
        primaryContactType: primaryContact?.type || null,
        primaryContactValue: primaryContact?.value || '',
        contactMethods,
        searchKeywords: buildContactSearchKeywords(input, contactMethods),
    };
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
