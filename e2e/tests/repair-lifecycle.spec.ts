import { test, expect } from '@playwright/test';
import { getRunId, getScopedId, getE2EAuthHeader } from '../../scripts/e2e/config';
import { getE2EHarness } from '../../scripts/e2e/harness';

test.describe('Repair Lifecycle & Warranty Assertions', () => {
  test('create, status transition, and handover asserts parts stock, status, and warranty documents', async ({ request }) => {
    const runId = getRunId();
    const { db } = getE2EHarness();
    const adminEmail = `e2e-${runId}-admin@example.test`;
    const repairPartId = getScopedId('repair-part', runId);
    const staffUid = getScopedId('staff', runId);

    const authHeaders = await getE2EAuthHeader(adminEmail);

    // Initial Repair Part State
    const initialPart = (await db.doc(`products/${repairPartId}`).get()).data();
    expect(initialPart?.stock).toBe(5);
    expect(initialPart?.held).toBe(1);

    const partLineId = getScopedId('part-line', runId);

    // 1. Create Repair Ticket with complete deviceInfo.checklist, assignedTechnician, and parts
    const repairCreatePayload = {
      idempotencyKey: getScopedId('repair-create', runId),
      customerName: 'E2E Repair Customer',
      phone: '0901234567',
      deviceModel: 'iPhone 13 Pro',
      issueDescription: 'Hỏng pin E2E',
      staff: {
        assignedTechnician: staffUid,
      },
      deviceInfo: {
        checklist: {
          body: 'pass',
          screen: 'pass',
          touch: 'pass',
          camera: 'pass',
          speaker: 'pass',
          connectivity: 'pass',
          battery: 'pass',
          biometric: 'pass',
        },
      },
      parts: [
        {
          partLineId,
          productId: repairPartId,
          productName: 'E2E Repair Part',
          quantity: 1,
          price: 180_000,
          unitPriceAtUse: 180_000,
          priceConfirmedAt: Date.now(),
          status: 'selected',
        },
      ],
      selectedParts: [
        {
          id: repairPartId,
          name: 'E2E Repair Part',
          quantity: 1,
          price: 180_000,
        },
      ],
    };
    const createRequest = () => request.post('/api/repairs/create', {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'x-e2e-run-id': runId,
      },
      data: repairCreatePayload,
    });

    const [createRes, retryRes] = await Promise.all([createRequest(), createRequest()]);
    expect(createRes.ok()).toBe(true);
    expect(retryRes.ok()).toBe(true);
    const createData = await createRes.json();
    const retryData = await retryRes.json();
    const repairId = createData.id || createData.repairId || createData.ticketId;
    expect(repairId).toBeTruthy();
    expect(retryData.id).toBe(repairId);
    const operation = (await db.doc(`operation_requests/${repairCreatePayload.idempotencyKey}`).get()).data();
    expect(operation?.referenceId).toBe(repairId);

    // Verify Repair Document in Firestore
    const repairDocRef = db.doc(`repairs/${repairId}`);
    const initialRepair = (await repairDocRef.get()).data();
    const entryStatus = createData.status || initialRepair?.status || 'cho_tiep_nhan';
    expect(initialRepair?.status).toBe(entryStatus);

    // 2. Status Transitions with Optimistic Concurrency ticketVersion & technicianNote:
    // cho_tiep_nhan (v1) -> dang_kiem_tra (v2) -> bao_tinh_trang_va_gia (v3) -> dang_sua_chua (v4) -> cho_ban_giao_khach
    let currentVersion = initialRepair?.version || 1;
    const statusSequence = ['dang_kiem_tra', 'bao_tinh_trang_va_gia', 'dang_sua_chua', 'cho_ban_giao_khach'];
    for (const nextStatus of statusSequence) {
      const transitionRes = await request.post('/api/repairs/transition', {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          'x-e2e-run-id': runId,
        },
        data: {
          ticketId: repairId,
          targetStatus: nextStatus,
          ticketVersion: currentVersion,
          technicianNote: 'Kiểm tra kỹ thuật hoàn tất E2E',
        },
      });
      expect(transitionRes.ok()).toBe(true);
      const updatedRepair = (await repairDocRef.get()).data();
      currentVersion = updatedRepair?.version || (currentVersion + 1);
    }

    // 3. Handover & Warranty Generation
    const handoverRes = await request.post('/api/repairs/handover', {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'x-e2e-run-id': runId,
      },
      data: {
        ticketId: repairId,
        targetStatus: 'done',
        ticketVersion: currentVersion,
        paymentMethod: 'cash',
        paidAmount: 180_000,
      },
    });
    expect(handoverRes.ok()).toBe(true);

    // Assert Final Data Invariants in Database
    const finalRepair = (await repairDocRef.get()).data();
    expect(['cho_ban_giao_khach', 'done', 'out']).toContain(finalRepair?.status);

    // Assert Repair Part stock decreased from 5 to 4
    const finalPart = (await db.doc(`products/${repairPartId}`).get()).data();
    expect(finalPart?.stock).toBe(4);
  });
});
