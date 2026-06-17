export interface User {
    uid: string;
    email: string;
    displayName?: string;
    role: 'admin' | 'staff' | 'customer';
    membership_level: 'Smember' | 'Gold' | 'Silver' | 'Bronze';
    phone?: string;
    address?: string;
    missions?: {
        facebook_like?: boolean;
        tiktok_follow?: boolean;
        completedAt?: FirestoreDateValue | null;
    };
    createdAt: Date;
}

// Firestore timestamp types

export type FirestoreTimestamp = import('firebase/firestore').Timestamp;

export type FirestoreWriteTimestamp = import('firebase/firestore').FieldValue;

export type FirestoreDateValue = FirestoreTimestamp | FirestoreWriteTimestamp | Date | number;

// Category and Brand types (Dynamic)

export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'pay_later' | 'refunded' | 'warranty';

// Shared payment history entry — used by both RepairTicket and Order

export interface PaymentHistoryEntry {
    amount: number;
    method?: string;
    date?: FirestoreDateValue;
    timestamp?: number;
    type: 'deposit' | 'payment' | 'full' | 'additional' | 'refund';
    note?: string;
}

// Status Timeline Entry
