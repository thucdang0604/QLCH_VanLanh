import { expect, test } from '@playwright/test';
import { getE2EAuthHeader, getRunId, getScopedId } from '../../scripts/e2e/config';
import { getE2EHarness } from '../../scripts/e2e/harness';

test.describe('Supplier lot return', () => {
  test('returns only an available quantity from the exact supplier lot and records a pending credit once', async ({ request }) => {
    const runId = getRunId();
    const { db } = getE2EHarness();
    const adminEmail = `e2e-${runId}-admin@example.test`;
    const supplierId = getScopedId('supplier', runId);
    const productId = getScopedId('supplier-return-product', runId);
    const lotId = getScopedId('supplier-return-lot', runId);
    const idempotencyKey = `supplier-return-${runId}-${Date.now()}`;
    const authHeaders = await getE2EAuthHeader(adminEmail);
    const payload = {
      lotId,
      quantity: 2,
      reason: 'Linh kiện lỗi, NCC xác nhận đổi trả',
      idempotencyKey,
    };

    const firstResponse = await request.post('/api/inventory/supplier-return', {
      headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
      data: payload,
    });
    expect(firstResponse.ok()).toBe(true);
    const firstBody = await firstResponse.json();
    expect(firstBody.success).toBe(true);
    expect(firstBody.fromCache).toBe(false);
    expect(firstBody.supplierCreditAmount).toBe(160_000);

    const [product, lot, supplier, returnDoc, inventoryLogs, supplierTransactions] = await Promise.all([
      db.doc(`products/${productId}`).get(),
      db.doc(`inventory_lots/${lotId}`).get(),
      db.doc(`suppliers/${supplierId}`).get(),
      db.doc(`supplier_returns/${firstBody.supplierReturnId}`).get(),
      db.collection('inventory_logs').where('referenceId', '==', firstBody.supplierReturnId).get(),
      db.collection('supplier_transactions').where('supplierReturnId', '==', firstBody.supplierReturnId).get(),
    ]);

    expect(product.data()?.stock).toBe(8);
    expect(product.data()?.held).toBe(1);
    expect(product.data()?.costPrice).toBe(95_000);
    expect(lot.data()?.remainingQuantity).toBe(3);
    expect(lot.data()?.status).toBe('active');
    expect(supplier.data()?.totalDebt).toBe(500_000);
    expect(returnDoc.data()?.settlementStatus).toBe('credit_pending');
    expect(returnDoc.data()?.supplierId).toBe(supplierId);
    expect(returnDoc.data()?.supplierCreditAmount).toBe(160_000);
    expect(inventoryLogs.docs).toHaveLength(1);
    expect(inventoryLogs.docs[0].data()?.type).toBe('SUPPLIER_RETURN');
    expect(inventoryLogs.docs[0].data()?.quantity).toBe(-2);
    expect(supplierTransactions.docs).toHaveLength(1);
    expect(supplierTransactions.docs[0].data()?.type).toBe('RETURN_CREDIT');

    const retryResponse = await request.post('/api/inventory/supplier-return', {
      headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
      data: payload,
    });
    expect(retryResponse.ok()).toBe(true);
    expect((await retryResponse.json()).fromCache).toBe(true);
    expect((await db.doc(`inventory_lots/${lotId}`).get()).data()?.remainingQuantity).toBe(3);

    const excessLotReturn = await request.post('/api/inventory/supplier-return', {
      headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
      data: {
        ...payload,
        quantity: 4,
        idempotencyKey: `${idempotencyKey}-held`,
      },
    });
    expect(excessLotReturn.status()).toBe(409);
    expect((await db.doc(`inventory_lots/${lotId}`).get()).data()?.remainingQuantity).toBe(3);
  });
});
