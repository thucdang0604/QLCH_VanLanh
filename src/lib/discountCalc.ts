import type { AccessoryDiscountRule } from '@/lib/types';

/**
 * Simple keyword matcher — checks if any keyword appears in the target string
 */
export function matchesKeywords(text: string, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return false;
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

export interface DiscountCalculationResult {
    productName: string;
    originalPrice: number;
    discountAmount: number;
    ruleName: string;
}
export interface RepairDiscountContext {
    serviceName?: string;
    categoryPath?: string[];
    issues?: { label?: string; categoryPath?: string[]; serviceName?: string }[];
}

/**
 * Check if a product's categoryIds match a rule's category slug.
 * A match occurs when any categoryId equals or starts with the rule category.
 * E.g. product categoryIds=['phu-kien','phu-kien/op-lung'] matches rule 'phu-kien'.
 * Also: product categoryIds=['phu-kien/op-lung'] matches rule 'phu-kien/op-lung'.
 */
function matchesCategoryId(categoryIds: string[] | undefined, ruleCategory: string): boolean {
    if (!categoryIds?.length || !ruleCategory) return false;
    const rc = ruleCategory.toLowerCase();
    return categoryIds.some(cid => {
        const c = cid.toLowerCase();
        return c === rc || c.startsWith(rc + '/') || rc.startsWith(c + '/');
    });
}

function matchesCategoryPath(categoryPath: string[] | undefined, ruleCategory: string): boolean {
    if (!categoryPath?.length || !ruleCategory) return false;
    const normalized = categoryPath.map(item => item.toLowerCase());
    const rc = ruleCategory.toLowerCase();
    const joined = normalized.join('/');
    return normalized.includes(rc) || joined === rc || joined.startsWith(rc + '/') || rc.startsWith(joined + '/');
}

/**
 * Calculate accessory discounts based on repair parts and cart items.
 *
 * Logic:
 * IF cart contains a repair service matching `triggerKeywords` or `triggerServiceCategory`
 * AND cart contains a product matching `targetKeywords` or `targetProductCategory`
 * THEN apply discount to that product.
 *
 * Returns array of { productName, originalPrice, discountAmount, ruleName }
 */
export function calculateAccessoryDiscounts(
    repairParts: { productName: string; partType?: string; unitPriceAtUse?: number; categoryIds?: string[] }[],
    cartItems: { productId: string; productName: string; price: number; category?: string; categoryIds?: string[] }[],
    rules: AccessoryDiscountRule[],
    repairContexts: RepairDiscountContext[] = []
): DiscountCalculationResult[] {
    const results: DiscountCalculationResult[] = [];

    for (const rule of rules) {
        // Check if any repair part matches the trigger
        const hasTrigger = repairParts.some(part => {
            const partText = `${part.productName} ${part.partType || ''}`;
            // 1. Keyword matching (primary)
            if (matchesKeywords(partText, rule.triggerKeywords)) return true;
            // 2. CategoryIds matching (if repair parts carry categoryIds)
            if (matchesCategoryId(part.categoryIds, rule.triggerServiceCategory)) return true;
            // 3. Legacy: partType text match (for rules created before Visual Builder)
            if (rule.triggerServiceCategory && part.partType &&
                part.partType.toLowerCase().includes(rule.triggerServiceCategory.toLowerCase())) return true;
            return false;
        }) || repairContexts.some(repair => {
            const repairText = [
                repair.serviceName,
                ...(repair.issues || []).map(issue => `${issue.label || ''} ${issue.serviceName || ''}`),
            ].join(' ');

            if (matchesKeywords(repairText, rule.triggerKeywords || [])) return true;
            if (matchesCategoryPath(repair.categoryPath, rule.triggerServiceCategory)) return true;
            return (repair.issues || []).some(issue =>
                matchesCategoryPath(issue.categoryPath, rule.triggerServiceCategory)
            );
        });

        if (!hasTrigger) continue;

        // Find matching cart items for discount
        for (const item of cartItems) {
            const itemText = `${item.productName} ${item.category || ''}`;
            // 1. Keyword matching (primary)
            const kwMatch = matchesKeywords(itemText, rule.targetKeywords);
            // 2. CategoryIds matching
            const catMatch = matchesCategoryId(item.categoryIds, rule.targetProductCategory);
            // 3. Legacy: category string includes
            const legacyCatMatch = !!(rule.targetProductCategory && item.category &&
                item.category.toLowerCase().includes(rule.targetProductCategory.toLowerCase()));

            if (!kwMatch && !catMatch && !legacyCatMatch) continue;

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
