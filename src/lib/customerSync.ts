import { doc, serverTimestamp, Transaction, Firestore } from 'firebase/firestore';

export interface CustomerSyncData {
    phone: string;
    name?: string;
    address?: string;
    type: 'order' | 'repair' | 'appointment';
    amount?: number; // amount to add to totalSpent
}

/**
 * Upserts a customer record within a Firestore transaction.
 * Should be called whenever a new order, repair, or appointment is created.
 */
export async function upsertCustomerRecord(
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
            totalSpent: data.amount || 0,
            totalOrders: data.type === 'order' ? 1 : 0,
            totalRepairs: data.type === 'repair' ? 1 : 0,
            totalAppointments: data.type === 'appointment' ? 1 : 0,
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
        
        if (data.amount && data.amount > 0) {
            updateData.totalSpent = (currentData.totalSpent || 0) + data.amount;
        }
        
        if (data.type === 'order') updateData.totalOrders = (currentData.totalOrders || 0) + 1;
        if (data.type === 'repair') updateData.totalRepairs = (currentData.totalRepairs || 0) + 1;
        if (data.type === 'appointment') updateData.totalAppointments = (currentData.totalAppointments || 0) + 1;
        
        transaction.update(customerRef, updateData);
    }
}
