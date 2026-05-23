import { collection, query, getDocs, setDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Commission, CommissionRule, Order, RepairTicket, Product, FirestoreWriteTimestamp } from '@/lib/types';

function getSafePercentage(rule: CommissionRule): number | null {
    const pct = typeof rule.percentage === 'number' ? rule.percentage : Number(rule.percentage);
    if (!Number.isFinite(pct)) return null;
    if (pct <= 0) return null;
    if (pct > 100) return null;
    return pct;
}

function safeNumber(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

// Fetch all active rules
export async function getActiveRules(): Promise<CommissionRule[]> {
    const snap = await getDocs(query(collection(db, 'commission_rules')));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as CommissionRule))
        .filter(r => r.isActive);
}

// Find the best matching rule based on hierarchy: Specific(3) -> Category(2) -> General(1)
function findBestRule(rules: CommissionRule[], type: 'order' | 'repair', productId?: string, category?: string): CommissionRule | undefined {
    // Filter rules matching the type (or 'all')
    const applicableRules = rules.filter(r => r.type === type || r.type === 'all');

    // 1. Try specific product
    if (productId) {
        const specificRule = applicableRules.find(r => r.hierarchyLevel === 3 && r.targetType === 'specific' && r.targetValue === productId);
        if (specificRule) return specificRule;
    }

    // 2. Try category
    if (category) {
        const categoryRule = applicableRules.find(r => r.hierarchyLevel === 2 && r.targetType === 'category' && r.targetValue === category);
        if (categoryRule) return categoryRule;
    }

    // 3. Try general
    const generalRule = applicableRules.find(r => r.hierarchyLevel === 1 && r.targetType === 'general');
    return generalRule;
}

/**
 * Calculates and saves commissions for an Order or Repair ticket.
 * @param isRefund - If true, creates a NEGATIVE commission record (bù trừ hoa hồng khi Hoàn Phí).
 *                  DocId uses _refund suffix so the original positive record is not overwritten.
 */
export async function calculateAndSaveCommissions(
    staff: { uid: string; displayName: string },
    docType: 'order' | 'repair',
    docData: Order | RepairTicket,
    isRefund: boolean = false
) {
    try {
        // Guard: Only calculate commissions when payment is confirmed (or for refunds)
        if (!isRefund) {
            // For repairs: skip if not paid
            if (docType === 'repair') {
                const paymentStatus = (docData as RepairTicket).payment?.status;
                if (paymentStatus !== 'paid') {
                    console.warn(`Skipping commission for repair ${docData.id}: payment status is "${paymentStatus}"`);
                    return;
                }
            }
            // For orders: skip if not completed (BUG-COM-005)
            if (docType === 'order') {
                const orderStatus = (docData as Order).status;
                if (orderStatus !== 'Completed') {
                    console.warn(`Skipping commission for order ${docData.id}: status is "${orderStatus}"`);
                    return;
                }
            }
        }

        const rules = await getActiveRules();
        if (rules.length === 0) return; // No active rules, exit

        const commissionsToSave: Array<Omit<Commission, 'id'>> = [];

        if (docType === 'order') {
            const order = docData as Order;

            // Fetch product categories for order items
            const productIds = order.items.map(i => i.productId).filter(Boolean);
            const productMap: Record<string, Product> = {};
            
            // Note: In a production app, batch this if productIds is large. 
            // Here we assume small number of items per order.
            for (const pid of productIds) {
                if (!productMap[pid]) {
                    const pSnap = await getDoc(doc(db, 'products', pid));
                    if (pSnap.exists()) {
                        productMap[pid] = pSnap.data() as Product;
                    }
                }
            }

            // Pre-calculate grandTotal for pro-rata discount distribution (BUG-COM-004)
            const totalDiscount = safeNumber(order.discount_amount);
            const grandTotal = order.items.reduce((sum, i) => sum + safeNumber(i.price) * safeNumber(i.quantity), 0);

            for (const item of order.items) {
                const product = productMap[item.productId];
                const rule = findBestRule(rules, 'order', item.productId, product?.category);

                if (rule) {
                    const pct = getSafePercentage(rule);
                    if (pct === null) continue;

                    const itemTotal = safeNumber(item.price) * safeNumber(item.quantity);
                    let baseAmount = itemTotal;
                    
                    // Pro-rata discount: phân bổ giảm giá theo tỷ lệ giá trị
                    if (rule.applyAfterDiscount && totalDiscount > 0 && grandTotal > 0) {
                        const itemDiscount = Math.round(totalDiscount * (itemTotal / grandTotal));
                        baseAmount = Math.max(0, itemTotal - itemDiscount);
                    }

                let commissionAmount = Math.round((baseAmount * pct) / 100);
                if (isRefund) commissionAmount = -commissionAmount;
                if (commissionAmount !== 0) {
                    commissionsToSave.push({
                        staffId: staff.uid,
                        staffName: staff.displayName,
                        ruleId: rule.id,
                        sourceType: 'order',
                        sourceId: order.id,
                        amount: commissionAmount,
                        baseAmount: baseAmount,
                        createdAt: serverTimestamp() as FirestoreWriteTimestamp
                    });
                }
                }
            }
        } else if (docType === 'repair') {
            const repair = docData as RepairTicket;
            
            // For repairs, we apply commission on the total amount or split by parts/labor.
            // Based on generic requirements, we'll try to find a general repair rule
            // Or if parts are specified, we could calculate per part, but repair parts are complex.
            // Let's use the total labor + parts cost and find a general repair rule.
            const rule = findBestRule(rules, 'repair');
            
            if (rule) {
                const pct = getSafePercentage(rule);
                if (pct === null) return;

                const baseAmount = safeNumber(repair.payment?.amount) - safeNumber(repair.payment?.giftDiscount);
                if (baseAmount < 0) {
                    console.warn(`Commission: Negative baseAmount (${baseAmount}) for repair ${repair.id}. Skipping.`);
                    return;
                }
                let commissionAmount = Math.round((baseAmount * pct) / 100);
                if (isRefund) commissionAmount = -commissionAmount;

                if (commissionAmount !== 0) {
                    commissionsToSave.push({
                        staffId: staff.uid,
                        staffName: staff.displayName,
                        ruleId: rule.id,
                        sourceType: 'repair',
                        sourceId: repair.id,
                        amount: commissionAmount,
                        baseAmount: baseAmount,
                        createdAt: serverTimestamp() as FirestoreWriteTimestamp
                    });
                }
            }
        }

        // Save all calculated commissions (refund uses _refund suffix to avoid overwriting original)
        for (const comm of commissionsToSave) {
            const baseId = `${comm.sourceType}_${comm.sourceId}_${comm.ruleId}_${comm.staffId}`;
            const docId = isRefund ? `${baseId}_refund` : baseId;
            await setDoc(doc(db, 'commissions', docId), comm);
        }

        console.warn(`Saved ${commissionsToSave.length} commissions for ${docType} ${docData.id}`);

    } catch (error) {
        console.error('Error calculating commissions:', error);
    }
}
