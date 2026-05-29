import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AccessoryDiscountRule } from '@/lib/types';
import { calculateAccessoryDiscounts, matchesKeywords, DiscountCalculationResult } from './discountCalc';

export { calculateAccessoryDiscounts, matchesKeywords };
export type { DiscountCalculationResult };

/**
 * Fetch all active discount rules from Firestore
 */
export async function fetchActiveDiscountRules(): Promise<AccessoryDiscountRule[]> {
    const q = query(collection(db, 'accessory_discount_rules'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AccessoryDiscountRule));
}
