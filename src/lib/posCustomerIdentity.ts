import { extractZaloQrIdentity } from './zaloContactCardImport';

export const POS_CUSTOMER_IDENTITY_MODES = ['guest', 'existing', 'verified_phone', 'zalo_contact'] as const;

export type PosCustomerIdentityMode = typeof POS_CUSTOMER_IDENTITY_MODES[number];

export type PosCustomerSearchMatch = {
    id: string;
    name: string;
    phone: string;
    primaryContactLabel: string;
    totalDebt: number;
};

export type PosZaloContactIdentity = {
    externalId: string;
    profileUrl: string;
    customerId: string;
};

export function readPosCustomerIdentityMode(value: unknown): PosCustomerIdentityMode {
    return POS_CUSTOMER_IDENTITY_MODES.includes(value as PosCustomerIdentityMode)
        ? value as PosCustomerIdentityMode
        : 'guest';
}

/**
 * A POS debt must be attached to an intentional customer identity. A walk-in
 * customer can still complete a paid sale, but must not create receivables.
 */
export function canCreatePosDebt(identityMode: PosCustomerIdentityMode): boolean {
    return identityMode === 'existing' || identityMode === 'verified_phone' || identityMode === 'zalo_contact';
}

/**
 * A Zalo contact-card QR carries a stable external identifier. Unlike a
 * display name or free-form Zalo nickname, it can safely identify the same
 * customer record across POS sessions.
 */
export function resolvePosZaloContactIdentity(value: string): PosZaloContactIdentity | null {
    const zalo = extractZaloQrIdentity(value);
    if (!zalo) return null;

    const externalId = zalo.externalId.toLowerCase();
    return {
        externalId,
        profileUrl: zalo.profileUrl,
        customerId: `KH-ZALO-${externalId}`,
    };
}
