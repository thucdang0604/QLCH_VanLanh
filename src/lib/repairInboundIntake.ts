import type { WorkflowNode } from '@/lib/types';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function hasText(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0;
}

function hasReportedIssue(ticket: RecordValue) {
    const issue = asRecord(ticket.issue);
    if (hasText(issue.description)) return true;

    return Array.isArray(ticket.issues) && ticket.issues.some(entry => {
        const repairIssue = asRecord(entry);
        return hasText(repairIssue.label) || hasText(repairIssue.serviceName);
    });
}

export function isIncomingRepairTicket(ticket: unknown) {
    return asRecord(ticket).appointmentIntakeMethod === 'send_to_store';
}

export function requiresInboundArrival(ticket: unknown, currentNode: WorkflowNode | undefined) {
    return isIncomingRepairTicket(ticket)
        && currentNode?.allowedFeatures?.includes('requireInboundArrival') === true;
}

/**
 * Reception chooses the expected parts only once the device is physically at
 * the shop.  Before then product stock must not be held for a draft shipment.
 */
export function canSelectInitialPartsDuringInboundIntake(ticket: unknown, currentNode: WorkflowNode | undefined) {
    if (!requiresInboundArrival(ticket, currentNode)) return false;

    const inboundShipping = asRecord(asRecord(ticket).inboundShipping);
    return inboundShipping.status === 'received' && !inboundShipping.intakeCompletedAt;
}

/**
 * Walk-in tickets may reserve expected parts while they are still editable.
 * A ticket with the configurable inbound-arrival gate keeps the stricter
 * physical-receipt rule above so stock is never held for a shipment in transit.
 */
export function canSelectInitialPartsWhenEditingRepair(ticket: unknown, currentNode: WorkflowNode | undefined) {
    if (currentNode?.isTerminal) return false;
    return !requiresInboundArrival(ticket, currentNode)
        || canSelectInitialPartsDuringInboundIntake(ticket, currentNode);
}

/**
 * Keep the technician view aligned with the physical intake flow. A customer
 * shipment is not available for technical work until reception has both
 * confirmed its arrival and completed the device intake.
 */
export function getInboundTechnicianHoldMessage(ticket: unknown, currentNode: WorkflowNode | undefined): string | null {
    const repairTicket = asRecord(ticket);
    if (!requiresInboundArrival(repairTicket, currentNode)) return null;

    const inboundShipping = asRecord(repairTicket.inboundShipping);
    if (inboundShipping.intakeCompletedAt) return null;

    return inboundShipping.status === 'received'
        ? 'Tiếp nhận đang hoàn tất thông tin máy.'
        : 'Khách đang gửi máy đến shop.';
}

/**
 * The first draft for a customer-posted device can intentionally omit physical
 * device details. Before it starts the normal repair workflow, ensure the
 * shipment was paid and reception has completed the actual intake.
 */
export function getInboundIntakeDetailsError(ticket: unknown): string | null {
    const repairTicket = asRecord(ticket);
    if (!isIncomingRepairTicket(repairTicket)) return null;

    const customer = asRecord(repairTicket.customer);
    const deviceInfo = asRecord(repairTicket.deviceInfo);
    const missingFields = [
        !hasText(customer.name) ? 'tên khách hàng' : '',
        !hasText(customer.phone) ? 'số điện thoại' : '',
        !hasText(deviceInfo.model) ? 'model thiết bị' : '',
        !hasReportedIssue(repairTicket) ? 'lỗi/nhu cầu sửa chữa' : '',
    ].filter(Boolean);
    if (missingFields.length > 0) {
        return `Vui lòng hoàn tất tiếp nhận máy: ${missingFields.join(', ')}.`;
    }

    return null;
}

export function getInboundArrivalPrerequisiteError(ticket: unknown): string | null {
    const repairTicket = asRecord(ticket);
    if (!isIncomingRepairTicket(repairTicket)) return null;

    const inboundShipping = asRecord(repairTicket.inboundShipping);
    const settlementType = inboundShipping.settlementType;
    const paidAmount = Number(inboundShipping.paidAmount) || 0;
    const paymentMethod = inboundShipping.lastPaymentMethod;
    const customerSettled = settlementType === 'customer_paid'
        && paymentMethod === 'CUSTOMER';
    const shopSettled = paidAmount > 0 && (paymentMethod === 'CASH' || paymentMethod === 'BANK');
    if (!customerSettled && !shopSettled) {
        return 'Phiếu khách gửi máy cần xác nhận khách đã thanh toán phí ship hoặc chi ship nhận máy trước.';
    }

    return getInboundIntakeDetailsError(repairTicket);
}

export function assertInboundArrivalConfirmedForTransition(ticket: unknown, currentNode: WorkflowNode | undefined) {
    const repairTicket = asRecord(ticket);
    if (!requiresInboundArrival(repairTicket, currentNode)) return;

    const inboundShipping = asRecord(repairTicket.inboundShipping);
    if (inboundShipping.status !== 'received') {
        throw new Error('Phiếu khách gửi máy chưa xác nhận máy đã đến shop nên chưa thể chuyển trạng thái.');
    }

    const prerequisiteError = getInboundArrivalPrerequisiteError(repairTicket);
    if (prerequisiteError) throw new Error(prerequisiteError);

    if (!inboundShipping.intakeCompletedAt) {
        throw new Error('Phiếu khách gửi máy chưa hoàn tất cập nhật thông tin tiếp nhận nên chưa thể chuyển trạng thái.');
    }
}
