import type { RepairTicket, WarrantyRule } from '@/lib/types';
import { isSelectedRepairPart, isWarrantyEligibleRepairPart } from '@/lib/repairStatus';

export type RepairWarrantyPart = NonNullable<RepairTicket['parts']>[number];
export type RepairWarrantyProductData = Record<string, unknown> | null | undefined;
export type RepairWarrantyRuleEntry = { label: string; months: number };

export function normalizeWarrantyRuleKey(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

export function buildRepairWarrantyRuleMap(warrantyRules: Array<Partial<WarrantyRule> | Record<string, unknown>>) {
    const ruleMap = new Map<string, RepairWarrantyRuleEntry>();
    for (const rule of warrantyRules) {
        const partType = String(rule.partType || '').trim();
        const ruleKey = normalizeWarrantyRuleKey(partType);
        if (!ruleKey) continue;
        ruleMap.set(ruleKey, {
            label: partType,
            months: Number(rule.warrantyMonths) || 0,
        });
    }
    return ruleMap;
}

function getWarrantyMatchCandidates(part: RepairWarrantyPart, productData: RepairWarrantyProductData) {
    return [
        part.partType,
        productData?.partType,
        part.productName,
        productData?.name,
        productData?.category,
        ...toStringArray(productData?.categoryIds),
    ].map(normalizeWarrantyRuleKey).filter(Boolean);
}

function warrantyRuleMatchesCandidate(ruleKey: string, candidate: string) {
    if (!ruleKey || !candidate) return false;
    if (ruleKey === candidate || candidate.includes(ruleKey)) return true;
    const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
    const ruleTokens = ruleKey.split(' ').filter(token => token.length >= 3);
    return ruleTokens.some(token => candidateTokens.has(token));
}

export function resolveRepairPartWarrantyRule(
    part: RepairWarrantyPart,
    productData: RepairWarrantyProductData,
    ruleMap: Map<string, RepairWarrantyRuleEntry>,
) {
    const candidates = getWarrantyMatchCandidates(part, productData);
    for (const candidate of candidates) {
        const exact = ruleMap.get(candidate);
        if (exact) return exact;
    }
    for (const candidate of candidates) {
        for (const [ruleKey, entry] of ruleMap.entries()) {
            if (ruleKey === 'khac') continue;
            if (warrantyRuleMatchesCandidate(ruleKey, candidate)) return entry;
        }
    }
    return ruleMap.get('khac') || null;
}

export function stampRepairWarrantyOnParts(
    parts: RepairWarrantyPart[],
    productDataById: Map<string, RepairWarrantyProductData>,
    warrantyRules: Array<Partial<WarrantyRule> | Record<string, unknown>>,
    completedAtMs: number,
) {
    const ruleMap = buildRepairWarrantyRuleMap(warrantyRules);
    let changed = false;
    let stampedCount = 0;

    const stampedParts = parts.map(part => {
        if (!isSelectedRepairPart(part) || !isWarrantyEligibleRepairPart(part)) return part;
        if (part.warrantyExpiresAt) return part;

        const productData = part.productId ? productDataById.get(part.productId) : null;
        const warrantyRule = resolveRepairPartWarrantyRule(part, productData, ruleMap);
        const rawPartType = String(part.partType || productData?.partType || warrantyRule?.label || '');
        const months = warrantyRule?.months || 0;

        if (months <= 0) {
            if (Number(part.warrantyMonths || 0) === 0) return part;
            changed = true;
            return { ...part, warrantyMonths: 0 };
        }

        const expiresAt = new Date(completedAtMs);
        expiresAt.setMonth(expiresAt.getMonth() + months);
        changed = true;
        stampedCount += 1;

        return {
            ...part,
            warrantyMonths: months,
            warrantyExpiresAt: expiresAt.getTime(),
            partType: warrantyRule?.label || rawPartType,
        };
    });

    return { parts: stampedParts, changed, stampedCount };
}
