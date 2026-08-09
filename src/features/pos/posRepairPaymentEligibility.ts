import { isRepairStatus, REPAIR_STATUS } from '@/lib/repairStatus';

type RepairPaymentCandidate = Record<string, unknown> & {
    status?: unknown;
    payment?: unknown;
};

/**
 * A repair can be collected in POS only after the technician has explicitly
 * moved it to the customer-handover step. Payment status alone is not enough:
 * early-stage tickets must remain in the repair workflow.
 */
export function isRepairReadyForPosPayment(candidate: RepairPaymentCandidate) {
    const payment = (candidate.payment || {}) as Record<string, unknown>;
    const paymentStatus = typeof payment.status === 'string' ? payment.status : '';
    const repairStatus = typeof candidate.status === 'string' ? candidate.status : '';

    return (
        isRepairStatus(repairStatus, REPAIR_STATUS.CUSTOMER_HANDOVER)
        && (paymentStatus === '' || paymentStatus === 'unpaid' || paymentStatus === 'partial')
    );
}
