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
}

/**
 * PHASE 1: Fetch FIFO logs (Reads)
 * Must be called during the transaction's READ phase.
 */
export async function fetchFifoLogsForDeduction(
    tx: Transaction,
    db: FirebaseFirestore.Firestore,
    deductions: FifoDeductor[]
): Promise<Map<string, { ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData }[]>> {
    const logsDataByProduct = new Map<string, { ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData }[]>();

    for (const req of deductions) {
        if (req.quantityToDeduct <= 0) continue;

        const logsQuery = db.collection('inventory_logs')
            .where('productId', '==', req.productId)
            .where('type', '==', 'IMPORT')
            .orderBy('createdAt', 'asc');

        const logsSnap = await tx.get(logsQuery);
        logsDataByProduct.set(req.productId, logsSnap.docs.map(d => ({ ref: d.ref, data: d.data() })));
    }

    return logsDataByProduct;
}

/**
 * PHASE 2: Execute FIFO logic (Writes)
 * Must be called during the transaction's WRITE phase.
 */
export function executeFifoDeductionsWrites(
    tx: Transaction,
    deductions: FifoDeductor[],
    logsDataByProduct: Map<string, { ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData }[]>
): Map<string, FifoDeductionResult[]> {
    const resultsMap = new Map<string, FifoDeductionResult[]>();

    for (const req of deductions) {
        if (req.quantityToDeduct <= 0) {
            resultsMap.set(req.productId, []);
            continue;
        }

        let remainingToDeduct = req.quantityToDeduct;
        const results: FifoDeductionResult[] = [];
        const productLogs = logsDataByProduct.get(req.productId) || [];

        for (const doc of productLogs) {
            if (remainingToDeduct <= 0) break;

            const data = doc.data;
            const available = data.remainingQuantity !== undefined ? Number(data.remainingQuantity) : 0;
            
            if (available <= 0) continue;

            const deductAmount = Math.min(available, remainingToDeduct);
            const newRemaining = available - deductAmount;
            
            tx.update(doc.ref, {
                remainingQuantity: newRemaining,
                isDepleted: newRemaining === 0,
                updatedAt: FieldValue.serverTimestamp()
            });

            results.push({
                lotCode: data.lotCode || null,
                supplierId: data.supplierId || null,
                quantity: deductAmount,
                logId: doc.ref.id
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
    const logsData = await fetchFifoLogsForDeduction(tx, db, deductions);
    return executeFifoDeductionsWrites(tx, deductions, logsData);
}
