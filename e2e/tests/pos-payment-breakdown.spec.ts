import { expect, test } from '@playwright/test';
import { getE2EAuthHeader, getRunId, getScopedId } from '../../scripts/e2e/config';
import { getE2EHarness } from '../../scripts/e2e/harness';
import { readCashierShiftTallyTotals } from '../../src/lib/cashierShiftTallyServer';

test.describe('POS payment breakdown', () => {
  test('records one cash line and one VietQR bank line once, with a reconciliation outbox record', async ({ request }) => {
    const runId = getRunId();
    const { db } = getE2EHarness();
    const productId = getScopedId('pos-product', runId);
    const shiftId = getScopedId('cashier-shift', runId);
    const customerId = getScopedId('customer-record', runId);
    const idempotencyKey = `pos-payment-breakdown-${runId}-${Date.now()}`;
    const bankReference = `POS-${runId.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(-16)}`;
    const authHeaders = await getE2EAuthHeader(`e2e-${runId}-admin@example.test`);
    const beforeProduct = (await db.doc(`products/${productId}`).get()).data();
    const beforeTally = await readCashierShiftTallyTotals(
      { getAll: (...refs) => Promise.all(refs.map(ref => ref.get())) },
      db,
      shiftId,
    );

    const payload = {
      idempotencyKey,
      cashierShiftId: shiftId,
      customer_info: {
        customerId,
        identityMode: 'existing',
        name: 'E2E Customer Record',
        primaryContactType: 'email',
      },
      items: [{
        productId,
        productName: 'E2E POS FIFO Product',
        quantity: 1,
        price: 120_000,
      }],
      total_amount: 120_000,
      discount_amount: 0,
      deposit_amount: 120_000,
      payment_method: 'MIXED',
      payment_breakdown: [
        { method: 'CASH', amount: 40_000 },
        { method: 'BANK', amount: 80_000, reference: bankReference },
      ],
    };

    const checkout = await request.post('/api/pos/checkout', {
      headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
      data: payload,
    });
    expect(checkout.ok()).toBe(true);
    const body = await checkout.json() as { orderId: string; paymentBreakdown: { method: string; amount: number; reference?: string }[] };
    expect(body.paymentBreakdown).toEqual(payload.payment_breakdown);

    const order = (await db.doc(`orders/${body.orderId}`).get()).data();
    expect(order?.payment_method).toBe('MIXED');
    expect(order?.paymentBreakdown).toEqual(payload.payment_breakdown);
    expect(order?.paymentStatus).toBe('paid');

    const reconciliation = (await db.doc(`bank_payment_reconciliations/BPR-${body.orderId}:payment:2`).get()).data();
    expect(reconciliation).toMatchObject({
      paymentRecordId: `${body.orderId}:payment:2`,
      reference: bankReference,
      expectedAmount: 80_000,
      paymentMethod: 'BANK',
      provider: 'vietqr',
      paymentStatus: 'confirmed',
      reconciliationStatus: 'pending',
      orderIds: [body.orderId],
    });

    const afterProduct = (await db.doc(`products/${productId}`).get()).data();
    expect(afterProduct?.stock).toBe((beforeProduct?.stock || 0) - 1);
    const afterTally = await readCashierShiftTallyTotals(
      { getAll: (...refs) => Promise.all(refs.map(ref => ref.get())) },
      db,
      shiftId,
    );
    expect(afterTally.cashSalesAmount).toBe(beforeTally.cashSalesAmount + 40_000);
    expect(afterTally.bankSalesAmount).toBe(beforeTally.bankSalesAmount + 80_000);

    const replay = await request.post('/api/pos/checkout', {
      headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
      data: payload,
    });
    expect(replay.ok()).toBe(true);
    const finalProduct = (await db.doc(`products/${productId}`).get()).data();
    expect(finalProduct?.stock).toBe(afterProduct?.stock);
    const finalTally = await readCashierShiftTallyTotals(
      { getAll: (...refs) => Promise.all(refs.map(ref => ref.get())) },
      db,
      shiftId,
    );
    expect(finalTally).toEqual(afterTally);
  });
});
