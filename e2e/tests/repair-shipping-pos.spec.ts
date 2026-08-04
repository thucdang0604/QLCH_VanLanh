import { expect, test } from '@playwright/test';
import { getE2EAuthHeader, getRunId, getScopedId } from '../../scripts/e2e/config';
import { FieldValue, getE2EHarness } from '../../scripts/e2e/harness';
import { recordDynamicDocument } from '../../scripts/e2e/manifest';
import { toRevenueDateId } from '../../src/lib/revenueAggregate';

const REPAIR_PRICE = 180_000;
const SHIPPING_FEE = 35_000;

test.describe('Repair shipping settlement at POS', () => {
  test('keeps customer-paid, shop-absorbed, and shop-advanced shipping distinct', async ({ request }) => {
    const runId = getRunId();
    const { db } = getE2EHarness();
    const customerId = getScopedId('customer-record', runId);
    const shiftId = getScopedId('cashier-shift', runId);
    const authHeaders = await getE2EAuthHeader(`e2e-${runId}-admin@example.test`);

    async function createRepair(label: string) {
      const id = getScopedId(`repair-shipping-${label}`, runId);
      await db.doc(`repairs/${id}`).set({
        id,
        e2eRunId: runId,
        customer: { id: customerId, customerId, name: 'E2E Customer Record', phone: '0901234567' },
        deviceInfo: { model: 'E2E Shipping Phone', passcode: '', imei: '' },
        preRepairMedia: [],
        postRepairMedia: [],
        statusTimeline: [],
        issue: { description: 'E2E shipping settlement', notes: '' },
        parts: [],
        payment: { status: 'unpaid', partsCost: 0, laborCost: REPAIR_PRICE, amount: REPAIR_PRICE, depositAmount: 0 },
        timing: { receivedAt: FieldValue.serverTimestamp() },
        staff: { createdBy: getScopedId('admin', runId), createdByName: 'E2E Admin' },
        status: 'cho_ban_giao_khach',
        ticketType: 'repair',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await recordDynamicDocument(`repairs/${id}`);
      return id;
    }

    async function checkoutRepair(repairId: string, mode: 'customer_paid_now' | 'shop_absorbs' | 'shop_advance_on_credit') {
      const customerCharge = mode === 'customer_paid_now' ? SHIPPING_FEE : 0;
      const res = await request.post('/api/pos/checkout', {
        headers: { 'Content-Type': 'application/json', ...authHeaders, 'x-e2e-run-id': runId },
        data: {
          idempotencyKey: `repair-shipping-${mode}-${runId}-${Date.now()}`,
          cashierShiftId: shiftId,
          repairTicketIds: [repairId],
          customer_info: {
            customerId,
            identityMode: 'existing',
            name: 'E2E Customer Record',
            phone: '',
            email: `e2e-${runId}@example.test`,
          },
          items: [{
            productId: `${repairId}_labor`,
            repairTicketId: repairId,
            productName: 'E2E repair service',
            quantity: 1,
            price: REPAIR_PRICE,
            isRepairTicket: true,
          }],
          total_amount: REPAIR_PRICE + customerCharge,
          discount_amount: 0,
          deposit_amount: 0,
          payment_method: 'CASH',
          repair_shipping: {
            repairTicketId: repairId,
            mode,
            fee: SHIPPING_FEE,
            recipientName: 'E2E Recipient',
            recipientPhone: '0901234567',
            recipientAddress: 'Quận 12, TP.HCM',
            ...(mode === 'shop_advance_on_credit' ? { billingCustomerId: customerId } : {}),
            ...(mode !== 'customer_paid_now' ? { shopPaymentMethod: 'BANK' } : {}),
          },
        },
      });
      if (!res.ok()) {
        throw new Error(`Repair shipping checkout failed (${res.status()}): ${await res.text()}`);
      }
      return res.json() as Promise<{ orderId: string }>;
    }

    const customerPaidRepair = await createRepair('customer');
    const customerPaid = await checkoutRepair(customerPaidRepair, 'customer_paid_now');
    const customerPaidOrder = (await db.doc(`orders/${customerPaid.orderId}`).get()).data();
    expect(customerPaidOrder?.total_amount).toBe(REPAIR_PRICE + SHIPPING_FEE);
    expect(customerPaidOrder?.shipping_fee).toBe(SHIPPING_FEE);
    expect(customerPaidOrder?.repairShipping?.mode).toBe('customer_paid_now');
    expect((await db.doc(`repairs/${customerPaidRepair}`).get()).data()?.delivery?.status).toBe('pending_dispatch');

    const shopAbsorbsRepair = await createRepair('shop-absorbs');
    const shopAbsorbs = await checkoutRepair(shopAbsorbsRepair, 'shop_absorbs');
    const expenseSnap = await db.collection('expenses').where('e2eRunId', '==', runId).get();
    expect(expenseSnap.docs.some(doc => doc.data().category === 'shipping' && doc.data().amount === SHIPPING_FEE)).toBe(true);

    const advanceRepair = await createRepair('advance');
    const advance = await checkoutRepair(advanceRepair, 'shop_advance_on_credit');
    const advanceOrders = await db.collection('orders').where('e2eRunId', '==', runId).where('isShippingAdvance', '==', true).get();
    expect(advanceOrders.size).toBe(1);
    expect(advanceOrders.docs[0].data().total_amount).toBe(SHIPPING_FEE);
    expect(advanceOrders.docs[0].data().parentOrderId).toBe(advance.orderId);
    expect((await db.doc(`customers/${customerId}`).get()).data()?.totalDebt).toBe(SHIPPING_FEE);

    const ownOrderIds = new Set([customerPaid.orderId, shopAbsorbs.orderId, advance.orderId]);
    const movements = (await db.collection('cashier_shift_movements').where('shiftId', '==', shiftId).get()).docs
      .map(document => document.data())
      .filter(movement => ownOrderIds.has(String(movement.orderId || '')));
    const cashIn = movements
      .filter(movement => movement.direction === 'income')
      .reduce((sum, movement) => sum + Number(movement.cashAmount || 0), 0);
    const bankOut = movements
      .filter(movement => movement.direction === 'expense' && movement.movementType === 'repair_shipping')
      .reduce((sum, movement) => sum + Number(movement.bankAmount || 0), 0);
    expect(cashIn).toBe(REPAIR_PRICE * 3 + SHIPPING_FEE);
    expect(bankOut).toBe(SHIPPING_FEE * 2);

    const aggregate = (await db.doc(`revenue_daily_aggregates/${toRevenueDateId(new Date())}`).get()).data();
    expect(aggregate?.shippingRevenue).toBe(SHIPPING_FEE);
    expect(aggregate?.shippingExpense).toBe(SHIPPING_FEE);
  });
});
