import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WarrantyRule } from '@/lib/types';

/**
 * Stamp warranty info (warrantyMonths + warrantyExpiresAt) on each `selected` part
 * based on its partType and the warranty rules from system_config/repairs.
 *
 * Returns the patched parts array (does NOT write to Firestore).
 */
export async function stampWarrantyOnParts(
    parts: Record<string, unknown>[],
    completedAtMs: number
): Promise<typeof parts> {
    if (!parts || parts.length === 0) return parts;

    // Load warranty rules
    let warrantyRules: WarrantyRule[] = [];
    try {
        const snap = await getDoc(doc(db, 'system_config', 'repairs'));
        if (snap.exists() && snap.data().warrantyRules) {
            warrantyRules = snap.data().warrantyRules as WarrantyRule[];
        }
    } catch (err) {
        console.error('Error loading warranty rules:', err);
        return parts;
    }

    if (warrantyRules.length === 0) return parts;

    // Build lookup map: partType → warrantyMonths
    const ruleMap = new Map<string, number>();
    for (const r of warrantyRules) {
        if (r.partType) ruleMap.set(r.partType, r.warrantyMonths);
    }

    return parts.map((p) => {
        // Only stamp parts that were actually used (not rejected/cancelled)
        if (['rejected', 'cancelled'].includes(String(p?.status || ''))) return p;
        // Already stamped? Skip
        if (p?.warrantyExpiresAt) return p;

        const partType = String(p?.partType || '');
        const months = ruleMap.get(partType) ?? ruleMap.get('Khác') ?? 0;

        if (months <= 0) return { ...p, warrantyMonths: 0 };

        // Calculate expiry date
        const expiresAt = new Date(completedAtMs);
        expiresAt.setMonth(expiresAt.getMonth() + months);

        return {
            ...p,
            warrantyMonths: months,
            warrantyExpiresAt: expiresAt.getTime(),
        };
    });
}
