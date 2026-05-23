import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AccessoryDiscountRule } from '@/lib/types';

/**
 * Fetch all active discount rules from Firestore
 */
export async function fetchActiveDiscountRules(): Promise<AccessoryDiscountRule[]> {
    const q = query(collection(db, 'accessory_discount_rules'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AccessoryDiscountRule));
}

/**
 * Simple keyword matcher — checks if any keyword appears in the target string
 */
function matchesKeywords(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

/**
 * Calculate accessory discounts based on repair parts and cart items.
 *
 * Logic (simple mode):
 * IF cart contains a repair service matching `triggerServiceCategory` or `triggerKeywords`
 * AND cart contains a product matching `targetProductCategory` or `targetKeywords`
 * THEN apply discount to that product.
 *
 * Returns array of { productName, originalPrice, discountAmount, ruleName }
 */
export function calculateAccessoryDiscounts(
    repairParts: { productName: string; partType?: string; unitPriceAtUse?: number }[],
    cartItems: { productId: string; productName: string; price: number; category?: string }[],
    rules: AccessoryDiscountRule[]
): { productName: string; originalPrice: number; discountAmount: number; ruleName: string }[] {
    const results: { productName: string; originalPrice: number; discountAmount: number; ruleName: string }[] = [];

    for (const rule of rules) {
        // Check if any repair part matches the trigger
        const hasTrigger = repairParts.some(part => {
            const partText = `${part.productName} ${part.partType || ''}`;
            return matchesKeywords(partText, rule.triggerKeywords) ||
                (part.partType && part.partType.toLowerCase().includes(rule.triggerServiceCategory.toLowerCase()));
        });

        if (!hasTrigger) continue;

        // Find matching cart items for discount
        for (const item of cartItems) {
            const itemText = `${item.productName} ${item.category || ''}`;
            const matches = matchesKeywords(itemText, rule.targetKeywords) ||
                (item.category && item.category.toLowerCase().includes(rule.targetProductCategory.toLowerCase()));

            if (!matches) continue;

            let discountAmount: number;
            if (rule.discountType === 'percentage') {
                discountAmount = Math.round(item.price * rule.discountValue / 100);
            } else {
                discountAmount = rule.discountValue;
            }

            // Cap at max
            if (rule.maxDiscountAmount && discountAmount > rule.maxDiscountAmount) {
                discountAmount = rule.maxDiscountAmount;
            }

            // Don't exceed item price
            discountAmount = Math.min(discountAmount, item.price);

            results.push({
                productName: item.productName,
                originalPrice: item.price,
                discountAmount,
                ruleName: rule.name,
            });
        }
    }

    return results;
}
