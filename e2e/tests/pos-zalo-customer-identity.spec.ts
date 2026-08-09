import { expect, test } from '@playwright/test';
import { getE2EAuthHeader, getRunId, getScopedId } from '../../scripts/e2e/config';
import { getE2EHarness } from '../../scripts/e2e/harness';
import { recordDynamicDocument } from '../../scripts/e2e/manifest';

test.describe('POS Zalo customer identity', () => {
  test('creates a named Zalo contact-card customer with a partial-payment debt', async ({ request }) => {
    const runId = getRunId();
    const { db } = getE2EHarness();
    const productId = getScopedId('pos-product', runId);
    const shiftId = getScopedId('cashier-shift', runId);
    const externalId = getScopedId('zalo-contact', runId);
    const customerId = `KH-ZALO-${externalId}`;
    const authHeaders = await getE2EAuthHeader(`e2e-${runId}-admin@example.test`);

    const payload = {
      cashierShiftId: shiftId,
      customer_info: {
        name: 'E2E Zalo Customer',
        identityMode: 'zalo_contact',
        zalo: `https://zaloapp.com/qr/p/${externalId}`,
        primaryContactType: 'zalo',
      },
      items: [{
        productId,
        productName: 'E2E POS FIFO Product',
        quantity: 1,
        price: 120_000,
      }],
      total_amount: 120_000,
      discount_amount: 0,
      deposit_amount: 1,
      deposit_payment_method: 'CASH',
      payment_method: 'DEBT',
    };

    const rejected = await request.post('/api/pos/checkout', {
      headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
      data: {
        ...payload,
        idempotencyKey: `pos-zalo-invalid-${runId}-${Date.now()}`,
        customer_info: { ...payload.customer_info, zalo: 'Anh Bảy Gà' },
      },
    });
    expect(rejected.status()).toBe(400);

    const accepted = await request.post('/api/pos/checkout', {
      headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
      data: { ...payload, idempotencyKey: `pos-zalo-valid-${runId}-${Date.now()}` },
    });
    expect(accepted.ok()).toBe(true);
    const body = await accepted.json() as { orderId: string };

    const customer = (await db.doc(`customers/${customerId}`).get()).data();
    expect(customer?.name).toBe('E2E Zalo Customer');
    expect(customer?.totalDebt).toBe(119_999);
    expect(customer?.contactProof?.externalId).toBe(externalId);
    expect(customer?.contactMethods?.some((method: { type?: string; externalId?: string; isPrimary?: boolean }) => (
      method.type === 'zalo' && method.externalId === externalId && method.isPrimary === true
    ))).toBe(true);
    await recordDynamicDocument(`customers/${customerId}`);

    const order = (await db.doc(`orders/${body.orderId}`).get()).data();
    expect(order?.customer_info?.customerId).toBe(customerId);
    expect(order?.customer_info?.identityMode).toBe('zalo_contact');
    expect(order?.deposit_amount).toBe(1);
    expect(order?.paymentStatus).toBe('debt');
  });
});
