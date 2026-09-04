import type { RepairTicket, WorkflowNode } from '@/lib/types';

/**
 * A node can require payment without hard-coding its ID.  The gate must be
 * checked before terminal handover semantics so an unpaid repair always goes
 * through the POS checkout transaction.
 */
export function requiresRepairPaymentAtPos(ticket: RepairTicket, currentNode: WorkflowNode | undefined) {
    if (!currentNode?.allowedFeatures?.includes('requirePaymentGate')) return false;
    if (ticket.ticketType === 'warranty') return false;

    const status = ticket.payment?.status;
    return status !== 'paid' && status !== 'refunded' && status !== 'warranty';
}
