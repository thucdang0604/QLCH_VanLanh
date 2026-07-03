import { FieldValue, Transaction } from 'firebase-admin/firestore';
import type { Commission, CommissionRule, Order, RepairTicket, Product } from '@/lib/types';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { getAdminDb } from '@/lib/firebaseAdmin';

function getSafePercentage(rule: CommissionRule): number | null {
    const pct = typeof rule.percentage === 'number' ? rule.percentage : Number(rule.percentage);
    if (!Number.isFinite(pct)) return null;
    if (pct <= 0) return null;
    if (pct > 100) return null;
    return pct;
}

function getRuleCalculationMode(rule: CommissionRule): 'percentage' | 'fixed' | 'fixed_by_price_range' {
    return rule.calculationMode || (rule.fixedAmount ? 'fixed' : 'percentage');
}

function getFixedAmountForRange(rule: CommissionRule, baseAmount: number): number | null {
    const ranges = Array.isArray(rule.priceRanges) ? rule.priceRanges : [];
    const matched = ranges.find((range) => {
        const min = safeNumber(range.min);
        const max = range.max === undefined || range.max === null || range.max === 0
            ? Number.POSITIVE_INFINITY
            : safeNumber(range.max);
        return baseAmount >= min && baseAmount <= max;
    });
    if (!matched) return null;
    const amount = safeNumber(matched.amount);
    return amount > 0 ? Math.round(amount) : null;
}

function calculateCommissionAmount(rule: CommissionRule, baseAmount: number): number | null {
    if (baseAmount <= 0) return null;
    const mode = getRuleCalculationMode(rule);

    if (mode === 'fixed_by_price_range') {
        return getFixedAmountForRange(rule, baseAmount);
    }

    if (mode === 'fixed') {
        const amount = safeNumber(rule.fixedAmount);
        return amount > 0 ? Math.round(amount) : null;
    }

    const pct = getSafePercentage(rule);
    if (pct === null) return null;
    return Math.round((baseAmount * pct) / 100);
}

function safeNumber(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

// Fetch all active rules
export async function getActiveRulesServer(): Promise<CommissionRule[]> {
    const db = getAdminDb();
    const snap = await db.collection('commission_rules').where('isActive', '==', true).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CommissionRule));
}

// Find the best matching rule based on hierarchy: Specific(3) -> Category(2) -> General(1)
function findBestRule(rules: CommissionRule[], type: 'order' | 'repair', productId?: string, category?: string): CommissionRule | undefined {
    // Filter rules matching the type (or 'all')
    const applicableRules = rules.filter(r => r.type === type || r.type === 'all');

    const cleanProductId = productId ? String(productId).trim().toLowerCase() : '';
    const cleanCategory = category ? String(category).trim().toLowerCase() : '';

    // 1. Try specific product
    if (cleanProductId) {
        const specificRule = applicableRules.find(r => r.hierarchyLevel === 3 && r.targetType === 'specific' && String(r.targetValue || '').trim().toLowerCase() === cleanProductId);
        if (specificRule) return specificRule;
    }

    // 2. Try category
    if (cleanCategory) {
        const categoryRule = applicableRules.find(r => r.hierarchyLevel === 2 && r.targetType === 'category' && String(r.targetValue || '').trim().toLowerCase() === cleanCategory);
        if (categoryRule) return categoryRule;
    }

    // 3. Try general
    const generalRule = applicableRules.find(r => r.hierarchyLevel === 1 && r.targetType === 'general');
    return generalRule;
}

/**
 * Lấy thông tin người nhận hoa hồng cho Order
 */
export function getCommissionRecipient(order: Order): { uid: string; displayName: string } | null {
    if (order.source === 'pos' && order.createdBy) {
        return { uid: order.createdBy, displayName: order.createdByName || '' };
    }
    if (order.assignedSellerId) {
        return { uid: order.assignedSellerId, displayName: order.assignedSellerName || '' };
    }
    return null; // Không trả hoa hồng nếu chưa assign
}

/**
 * Calculates and saves commissions for an Order or Repair ticket in an Admin SDK Transaction.
 */
export async function calculateAndSaveCommissionsServer(
    tx: Transaction,
    staff: { uid: string; displayName: string },
    docType: 'order' | 'repair',
    docData: Order | RepairTicket
) {
    try {
        const db = getAdminDb();
        
        // Guard: Only calculate commissions when completed/paid
        if (docType === 'repair') {
            const paymentStatus = (docData as RepairTicket).payment?.status;
            if (paymentStatus !== 'paid') {
                return;
            }
        }
        if (docType === 'order') {
            const orderStatus = (docData as Order).status;
            if (orderStatus !== 'Completed') {
                return;
            }
        }

        const rules = await getActiveRulesServer();
        if (rules.length === 0) return;

        const commissionsToSave: Array<Omit<Commission, 'id'>> = [];

        if (docType === 'order') {
            const order = docData as Order;
            const orderItems = order.items.filter((item) => {
                const line = item as typeof item & { isRepairTicket?: boolean; isOrderPayment?: boolean };
                return line.isRepairTicket !== true && line.isOrderPayment !== true;
            });

            // Dùng getCommissionRecipient để xác định người nhận
            const recipient = getCommissionRecipient(order);
            if (!recipient) return; // Không có người nhận hợp lệ -> Không tính HH

            // Fetch product categories for order items
            const productIds = orderItems.map(i => i.productId).filter(Boolean);
            const productMap: Record<string, Product> = {};
            
            for (const pid of productIds) {
                if (!productMap[pid]) {
                    const pSnap = await db.collection('products').doc(pid).get();
                    if (pSnap.exists) {
                        productMap[pid] = pSnap.data() as Product;
                    }
                }
            }

            const totalDiscount = safeNumber(order.discount_amount);
            const grandTotal = orderItems.reduce((sum, i) => sum + safeNumber(i.price) * safeNumber(i.quantity), 0);

            for (const item of orderItems) {
                const product = productMap[item.productId];
                const categoryIds = Array.isArray((product as Product & { categoryIds?: string[] })?.categoryIds)
                    ? ((product as Product & { categoryIds?: string[] }).categoryIds || [])
                    : [];
                const matchCategory = product?.category || categoryIds[categoryIds.length - 1] || categoryIds[0] || '';
                const rule = findBestRule(rules, 'order', item.productId, matchCategory);

                if (rule) {
                    const itemTotal = safeNumber(item.price) * safeNumber(item.quantity);
                    let baseAmount = itemTotal;
                    
                    if (rule.applyAfterDiscount && totalDiscount > 0 && grandTotal > 0) {
                        const itemDiscount = Math.round(totalDiscount * (itemTotal / grandTotal));
                        baseAmount = Math.max(0, itemTotal - itemDiscount);
                    }

                    const commissionAmount = calculateCommissionAmount(rule, baseAmount);
                    if (commissionAmount && commissionAmount !== 0) {
                        commissionsToSave.push({
                            staffId: recipient.uid,
                            staffName: recipient.displayName,
                            ruleId: rule.id,
                            sourceType: 'order',
                            sourceId: order.id,
                            amount: commissionAmount,
                            baseAmount: baseAmount,
                            createdAt: FieldValue.serverTimestamp() as unknown as Commission['createdAt']
                        });
                    }
                }
            }
        } else if (docType === 'repair') {
            const repair = docData as RepairTicket;
            const rule = findBestRule(rules, 'repair');
            
            // Repair ticket commission goes to assignedTechnician
            const techUid = repair.staff?.assignedTechnician;
            const techName = repair.staff?.assignedTechnicianName;
            if (!techUid) return;
            
            if (rule) {
                const baseAmount = safeNumber(repair.payment?.amount) - safeNumber(repair.payment?.giftDiscount);
                if (baseAmount <= 0) return;

                const commissionAmount = calculateCommissionAmount(rule, baseAmount);

                if (commissionAmount && commissionAmount !== 0) {
                    commissionsToSave.push({
                        staffId: techUid,
                        staffName: techName || '',
                        ruleId: rule.id,
                        sourceType: 'repair',
                        sourceId: repair.id,
                        amount: commissionAmount,
                        baseAmount: baseAmount,
                        createdAt: FieldValue.serverTimestamp() as unknown as Commission['createdAt']
                    });
                }
            }
        }

        // Save all calculated commissions via transaction
        for (const comm of commissionsToSave) {
            const baseId = `${comm.sourceType}_${comm.sourceId}_${comm.ruleId}_${comm.staffId}`;
            const ref = db.collection('commissions').doc(baseId);
            tx.set(ref, comm);
            incrementRevenueAggregates(tx, db, { commissionCost: safeNumber(comm.amount) });
        }

    } catch (error) {
        console.error('Error calculating commissions server:', error);
    }
}

/**
 * Reverses previously granted commissions (e.g. when an order is Cancelled).
 * Creates a negative record so that aggregates resolve to 0 and audit trail is preserved.
 */
export async function reverseCommissionServer(
    tx: Transaction,
    sourceId: string,
    sourceType: 'order' | 'repair',
    callerUid: string
) {
    const db = getAdminDb();
    const commSnap = await db
        .collection('commissions')
        .where('sourceId', '==', sourceId)
        .where('sourceType', '==', sourceType)
        .get();
    
    // Check if reversal already exists to ensure idempotency
    const hasReversal = commSnap.docs.some(doc => doc.data().sourceType === 'reversal' || doc.data().amount < 0);
    if (hasReversal) return;

    for (const doc of commSnap.docs) {
        const data = doc.data();
        if (data.amount > 0 && data.sourceType !== 'reversal') {
            const reversalRef = db.collection('commissions').doc();
            tx.set(reversalRef, {
                ...data,
                sourceType: 'reversal', // Theo định dạng mới types.ts
                amount: -data.amount,
                reversedAt: FieldValue.serverTimestamp(),
                reversedBy: callerUid,
            });
            incrementRevenueAggregates(tx, db, { commissionCost: -safeNumber(data.amount) });
        }
    }
}
