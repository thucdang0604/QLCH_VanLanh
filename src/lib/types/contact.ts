import type { FirestoreDateValue } from './common';

export type ContactMethodType = 'phone' | 'zalo' | 'facebook' | 'email' | 'address' | 'note' | 'other';

export type ContactMethodSource = 'manual' | 'chat' | 'pos' | 'repair' | 'excel' | 'web' | 'migration' | 'zalo_contact_card' | 'facebook_profile';

export type ContactMethodConfidence = 'low' | 'medium' | 'high';

export interface ContactMethod {
    type: ContactMethodType;
    label?: string;
    value: string;
    normalizedValue?: string;
    verified?: boolean;
    isPrimary?: boolean;
    source?: ContactMethodSource;
    confidence?: ContactMethodConfidence;
    externalId?: string;
    profileUrl?: string;
    qrImageUrl?: string;
    avatarUrl?: string;
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
}
