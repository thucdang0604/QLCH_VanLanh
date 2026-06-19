import type { AccessoryDiscountRule } from '@/lib/types';

/**
 * Simple keyword matcher — checks if any keyword appears in the target string
 */
export function matchesKeywords(text: string, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return false;
    const lower = text.toLowerCase();
    const normalizedText = normalizeMatchText(text);
    return keywords.some(kw => lower.includes(kw.toLowerCase()) || normalizedText.includes(normalizeMatchText(kw)));
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

function normalizeMatchText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function categoryCandidates(values: string[] | undefined): string[] {
    if (!values?.length) return [];
    const normalized = values
        .filter(Boolean)
        .map(value => value.trim())
        .filter(Boolean);
    const slugged = normalized.map(normalizeMatchText).filter(Boolean);
    return Array.from(new Set([
        ...normalized.map(value => value.toLowerCase()),
        ...slugged,
        normalized.join('/').toLowerCase(),
        slugged.join('/'),
    ].filter(Boolean)));
}

function matchesCategoryCandidate(value: string, ruleCategory: string): boolean {
    const candidate = value.toLowerCase();
    const rule = ruleCategory.toLowerCase();
    const normalizedCandidate = normalizeMatchText(value);
    const normalizedRule = normalizeMatchText(ruleCategory);
    return [candidate, normalizedCandidate].some(current =>
        current === rule ||
        current === normalizedRule ||
        current.startsWith(rule + '/') ||
        rule.startsWith(current + '/') ||
        current.startsWith(normalizedRule + '/') ||
        normalizedRule.startsWith(current + '/')
    );
}

/**
 * Check if a product's categoryIds match a rule's category slug.
 * A match occurs when any categoryId equals or starts with the rule category.
 * E.g. product categoryIds=['phu-kien','phu-kien/op-lung'] matches rule 'phu-kien'.
 * Also: product categoryIds=['phu-kien/op-lung'] matches rule 'phu-kien/op-lung'.
 */
function matchesCategoryId(categoryIds: string[] | undefined, ruleCategory: string): boolean {
    if (!categoryIds?.length || !ruleCategory) return false;
    return categoryCandidates(categoryIds).some(candidate => matchesCategoryCandidate(candidate, ruleCategory));
}

function matchesCategoryPath(categoryPath: string[] | undefined, ruleCategory: string): boolean {
    if (!categoryPath?.length || !ruleCategory) return false;
    return categoryCandidates(categoryPath).some(candidate => matchesCategoryCandidate(candidate, ruleCategory));
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
