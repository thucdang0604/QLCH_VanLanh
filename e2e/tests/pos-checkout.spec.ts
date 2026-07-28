import { test, expect } from '@playwright/test';
import { getRunId, getScopedId, getE2EAuthHeader } from '../../scripts/e2e/config';
import { getE2EHarness } from '../../scripts/e2e/harness';
import { readCashierShiftTallyTotals } from '../../src/lib/cashierShiftTallyServer';

test.describe('POS Checkout & Idempotency', () => {
  test('valid checkout & re-sent request asserts stock, held, revenue, and shift data invariants', async ({ request }) => {
    const runId = getRunId();
    const { db } = getE2EHarness();
    const adminEmail = `e2e-${runId}-admin@example.test`;
    const productId = getScopedId('pos-product', runId);
    const lotId = getScopedId('pos-lot', runId);
    const shiftId = getScopedId('cashier-shift', runId);

    const authHeaders = await getE2EAuthHeader(adminEmail);

    // Initial Database Invariant Check
    const initialProduct = (await db.doc(`products/${productId}`).get()).data();
    expect(initialProduct?.stock).toBe(10);

    const initialLot = (await db.doc(`inventory_lots/${lotId}`).get()).data();
    expect(initialLot?.remainingQuantity).toBe(10);

    const idempotencyKey = `idempotency-pos-${runId}-${Date.now()}`;

    const checkoutPayload = {
      idempotencyKey,
      cashierShiftId: shiftId,
      items: [
        {
          productId,
          productName: 'E2E POS FIFO Product',
          quantity: 2,
          price: 120_000,
          costPrice: 50_000,
          lotCode: getScopedId('pos-lot-code', runId),
        },
      ],
      paymentMethod: 'cash',
      paidAmount: 240_000,
      totalAmount: 240_000,
      customerInfo: {
        name: 'E2E Customer Record',
        email: `e2e-${runId}@example.test`,
      },
    };

    // 1. First POS Checkout Request
    const res1 = await request.post('/api/pos/checkout', {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'x-e2e-run-id': runId,
        'x-idempotency-key': idempotencyKey,
      },
      data: checkoutPayload,
    });

    expect(res1.ok()).toBe(true);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);

    // Assert Database Invariants after 1st Checkout
    const updatedProduct = (await db.doc(`products/${productId}`).get()).data();
    expect(updatedProduct?.stock).toBe(8); // 10 - 2

    const updatedLot = (await db.doc(`inventory_lots/${lotId}`).get()).data();
    expect(updatedLot?.remainingQuantity).toBe(8); // 10 - 2

    const tallyTotals1 = await readCashierShiftTallyTotals(
      { getAll: (...refs) => Promise.all(refs.map(ref => ref.get())) },
      db,
      shiftId
    );
    expect(tallyTotals1.cashSalesAmount).toBe(240_000);

    // 2. Second (Re-sent) POS Checkout Request with same Idempotency Key
    const res2 = await request.post('/api/pos/checkout', {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'x-e2e-run-id': runId,
        'x-idempotency-key': idempotencyKey,
      },
      data: checkoutPayload,
    });

    expect(res2.ok()).toBe(true);

    // Assert Data Invariants remain strictly 8 and 240,000 (no duplicate inventory deduction or revenue count)
    const finalProduct = (await db.doc(`products/${productId}`).get()).data();
    expect(finalProduct?.stock).toBe(8);

    const finalLot = (await db.doc(`inventory_lots/${lotId}`).get()).data();
    expect(finalLot?.remainingQuantity).toBe(8);

    const finalTallyTotals = await readCashierShiftTallyTotals(
      { getAll: (...refs) => Promise.all(refs.map(ref => ref.get())) },
      db,
      shiftId
    );
    expect(finalTallyTotals.cashSalesAmount).toBe(240_000);
  });
});
