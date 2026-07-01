import type { FirestoreDateValue } from './common';

export type ContactMethodType = 'phone' | 'zalo' | 'facebook' | 'email' | 'address' | 'note' | 'other';

export type ContactMethodSource = 'manual' | 'chat' | 'pos' | 'repair' | 'excel' | 'web' | 'migration';

export interface ContactMethod {
    type: ContactMethodType;
    label?: string;
    value: string;
    normalizedValue?: string;
    verified?: boolean;
    isPrimary?: boolean;
    source?: ContactMethodSource;
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
}
