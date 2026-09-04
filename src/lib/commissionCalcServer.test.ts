import assert from 'node:assert/strict';
import test from 'node:test';
import type { RepairTicket } from '@/lib/types';
import { getRepairCommissionRecipients } from './commissionCalcServer';

const repair = {
    id: 'repair-1',
    staff: {
        createdBy: 'seller-1',
        createdByName: 'Lễ tân',
        assignedTechnician: 'tech-1',
        assignedTechnicianName: 'KTV A',
    },
} as RepairTicket;

test('returns only workflow-enabled repair commission recipients', () => {
    assert.deepEqual(getRepairCommissionRecipients(repair, { technician: true }), [
        { uid: 'tech-1', displayName: 'KTV A' },
    ]);
    assert.deepEqual(getRepairCommissionRecipients(repair, { seller: true }), [
        { uid: 'seller-1', displayName: 'Lễ tân' },
    ]);
    assert.deepEqual(getRepairCommissionRecipients(repair, { technician: true, seller: true }), [
        { uid: 'tech-1', displayName: 'KTV A' },
        { uid: 'seller-1', displayName: 'Lễ tân' },
    ]);
});

test('does not create duplicate commission recipients for one staff member', () => {
    const sameStaffRepair = {
        ...repair,
        staff: {
            ...repair.staff,
            createdBy: 'tech-1',
            createdByName: 'KTV A',
        },
    } as RepairTicket;

    assert.deepEqual(getRepairCommissionRecipients(sameStaffRepair, { technician: true, seller: true }), [
        { uid: 'tech-1', displayName: 'KTV A' },
    ]);
});
