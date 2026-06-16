import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction } from 'firebase-admin/firestore';

export interface FifoDeductionResult {
    lotCode: string | null;
    supplierId: string | null;
    quantity: number;
    logId: string;
}

export interface FifoDeductor {
    productId: string;
    quantityToDeduct: number;
    preferredLotCodes?: { lotCode: string; quantity: number }[];
}

/**
 * PHASE 1: Fetch FIFO lots (Reads)
 * Must be called during the transaction's READ phase.
 */
export async function fetchFifoLogsForDeduction(
    tx: Transaction,
    db: FirebaseFirestore.Firestore,
    deductions: FifoDeductor[]
): Promise<Map<string, { ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData }[]>> {
    const lotsDataByProduct = new Map<string, { ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData }[]>();

    for (const req of deductions) {
        if (req.quantityToDeduct <= 0) continue;

        const lotsQuery = db.collection('inventory_lots')
            .where('productId', '==', req.productId)
            .where('status', '==', 'active')
            .orderBy('createdAt', 'asc');

        const lotsSnap = await tx.get(lotsQuery);
        lotsDataByProduct.set(req.productId, lotsSnap.docs.map(d => ({ ref: d.ref, data: d.data() })));
    }

    return lotsDataByProduct;
}

/**
 * PHASE 2: Execute FIFO logic (Writes)
 * Must be called during the transaction's WRITE phase.
 */
export function executeFifoDeductionsWrites(
    tx: Transaction,
    deductions: FifoDeductor[],
    lotsDataByProduct: Map<string, { ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData }[]>
): Map<string, FifoDeductionResult[]> {
    const resultsMap = new Map<string, FifoDeductionResult[]>();

    for (const req of deductions) {
        if (req.quantityToDeduct <= 0) {
            resultsMap.set(req.productId, []);
            continue;
        }

        let remainingToDeduct = req.quantityToDeduct;
        const results: FifoDeductionResult[] = [];
        let productLots = lotsDataByProduct.get(req.productId) || [];

        // Pre-process preferred lots if any
        if (req.preferredLotCodes && req.preferredLotCodes.length > 0) {
            for (const pref of req.preferredLotCodes) {
                if (remainingToDeduct <= 0) break;
                
                const lotIndex = productLots.findIndex(doc => doc.data.lotCode === pref.lotCode);
                if (lotIndex >= 0) {
                    const doc = productLots[lotIndex];
                    let lotRemaining = doc.data.remainingQuantity !== undefined ? Number(doc.data.remainingQuantity) : 0;
                    if (lotRemaining > 0) {
                        const deductAmount = Math.min(lotRemaining, pref.quantity, remainingToDeduct);
                        if (deductAmount > 0) {
                            const newRemaining = lotRemaining - deductAmount;
                            
                            tx.update(doc.ref, {
                                remainingQuantity: newRemaining,
                                status: newRemaining === 0 ? 'empty' : 'active',
                                updatedAt: FieldValue.serverTimestamp()
                            });

                            // Update in-memory so standard FIFO doesn't reuse it
                            doc.data.remainingQuantity = newRemaining;

                            results.push({
                                lotCode: doc.data.lotCode || null,
                                supplierId: doc.data.supplierId || null,
                                quantity: deductAmount,
                                logId: doc.ref.id
                            });

                            remainingToDeduct -= deductAmount;
                        }
                    }
                }
            }
        }

        for (const doc of productLots) {
            if (remainingToDeduct <= 0) break;

            const data = doc.data;
            const available = data.remainingQuantity !== undefined ? Number(data.remainingQuantity) : 0;

            if (available <= 0) continue;

            const deductAmount = Math.min(available, remainingToDeduct);
            const newRemaining = available - deductAmount;

            tx.update(doc.ref, {
                remainingQuantity: newRemaining,
                status: newRemaining === 0 ? 'empty' : 'active',
                updatedAt: FieldValue.serverTimestamp()
            });

            results.push({
                lotCode: data.lotCode || null,
                supplierId: data.supplierId || null,
                quantity: deductAmount,
                logId: doc.ref.id // still named logId but actually lotId
            });

            remainingToDeduct -= deductAmount;
        }

        if (remainingToDeduct > 0) {
            results.push({
                lotCode: 'LEGACY_STOCK',
                supplierId: null,
                quantity: remainingToDeduct,
                logId: 'legacy'
            });
        }

        resultsMap.set(req.productId, results);
    }

    return resultsMap;
}

/**
 * Combines Phase 1 and 2 if you don't need to interleave other reads/writes.
 * Use carefully as it completes the read phase!
 */
export async function processFifoDeductions(
    tx: Transaction,
    db: FirebaseFirestore.Firestore,
    deductions: FifoDeductor[]
): Promise<Map<string, FifoDeductionResult[]>> {
    const lotsData = await fetchFifoLogsForDeduction(tx, db, deductions);
    return executeFifoDeductionsWrites(tx, deductions, lotsData);
}
