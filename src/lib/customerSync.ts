import { doc, serverTimestamp, Transaction, Firestore } from 'firebase/firestore';

export interface CustomerSyncData {
    phone: string;
    name?: string;
    address?: string;
    type: 'order' | 'repair' | 'appointment';
    amount?: number; // kept for compatibility, but ignored in aggregation
}

/**
 * Ensures a customer profile exists within a Firestore transaction.
 * DOES NOT aggregate amounts/counts. Aggregation is now handled by Server APIs upon completion.
 */
export async function ensureCustomerProfile(
    transaction: Transaction,
    db: Firestore,
    data: CustomerSyncData
) {
    if (!data.phone || data.phone.trim() === '') return;
    
    const phone = data.phone.replace(/[^0-9]/g, ''); // Normalize phone number
    if (phone.length < 9) return; // Basic validation

    const customerRef = doc(db, 'customers', phone);
    const snap = await transaction.get(customerRef);
    
    if (!snap.exists()) {
        transaction.set(customerRef, {
            phone,
            name: data.name?.trim() || 'Khách lẻ',
            address: data.address?.trim() || '',
            totalSpent: 0,
            totalOrders: 0,
            totalRepairs: 0,
            totalAppointments: 0,
            lastVisit: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            tags: [],
        });
    } else {
        const currentData = snap.data();
        const updateData: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
            lastVisit: serverTimestamp(),
        };
        
        // Only update name if it's provided and not generic
        if (data.name && data.name.trim() !== '' && data.name.trim() !== 'Khách lẻ' && data.name.trim() !== currentData.name) {
            updateData.name = data.name.trim();
        }
        
        if (data.address && data.address.trim() !== '' && data.address.trim() !== currentData.address) {
            updateData.address = data.address.trim();
        }
        
        transaction.update(customerRef, updateData);
    }
}
