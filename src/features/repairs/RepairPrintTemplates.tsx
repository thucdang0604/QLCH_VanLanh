import PrintableReceipt from '@/components/admin/PrintableReceipt';
import PrintableRepairInvoice from '@/components/admin/PrintableRepairInvoice';
import PrintableWarranty from '@/components/admin/PrintableWarranty';
import type { ReceiptConfig } from '@/components/admin/PrintableReceipt';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';
import type { RepairTicket } from '@/lib/types';
import { isSelectedRepairPart, isWarrantyEligibleRepairPart } from '@/lib/repairStatus';
import {
    mapWarrantyTypeToPrintType,
    type WarrantyPrintType,
} from './repairPageUtils';

type RepairPrintMode = 'receipt' | 'invoice' | 'warranty' | null;

function getDateMillis(value: unknown): number {
    if (typeof value === 'number') return value;
    return (value as { toDate?: () => Date; toMillis?: () => number } | undefined)?.toMillis?.()
        || (value as { toDate?: () => Date } | undefined)?.toDate?.()?.getTime()
        || 0;
}

interface RepairPrintTemplatesProps {
    ticket: RepairTicket | null;
    mode: RepairPrintMode;
    receiptConfig?: ReceiptConfig;
    warrantyType: WarrantyPrintType | null;
    getWarrantyConfigForType: (type: WarrantyPrintType | null) => WarrantyTemplateConfig | undefined;
}

export function RepairPrintTemplates({
    ticket,
    mode,
    receiptConfig,
    warrantyType,
    getWarrantyConfigForType,
}: RepairPrintTemplatesProps) {
    if (!ticket) return null;

    if (mode === 'receipt') {
        return <PrintableReceipt ticket={ticket} receiptConfig={receiptConfig} />;
    }

    if (mode === 'invoice') {
        return <PrintableRepairInvoice ticket={ticket} receiptConfig={receiptConfig} />;
    }

    if (mode !== 'warranty' || !warrantyType || !receiptConfig) {
        return null;
    }

    const warrantyConfig = getWarrantyConfigForType(warrantyType);
    if (!warrantyConfig) return null;

    const warrantyParts = (ticket.parts || [])
        .filter(part => {
            if (!isSelectedRepairPart(part) || !isWarrantyEligibleRepairPart(part)) return false;
            if (Number(part.warrantyMonths || 0) <= 0 || !part.warrantyExpiresAt) return false;
            return getDateMillis(part.warrantyExpiresAt) > Date.now();
        });
    const issueLabels = ticket.issues?.map(issue => issue.label).filter(Boolean) || [];
    const serviceWarrantyExpiresAt = getDateMillis(ticket.serviceWarrantyExpiresAt);
    const serviceWarrantyMonths = serviceWarrantyExpiresAt > Date.now()
        ? Math.max(1, Math.round((serviceWarrantyExpiresAt - Date.now()) / (30 * 24 * 60 * 60 * 1000)))
        : 0;
    const warrantyLines = warrantyParts.map(part => ({
        label: part.productName || part.name || part.partName || 'Linh kiện sửa chữa',
        type: part.partType || part.quality || 'Linh kiện',
        warrantyMonths: Number(part.warrantyMonths || 0),
        expiresAt: part.warrantyExpiresAt,
    }));
    if (warrantyLines.length === 0 && serviceWarrantyExpiresAt > Date.now()) {
        warrantyLines.push({
            label: ticket.serviceName || issueLabels.join(', ') || ticket.issue?.description || 'Dịch vụ sửa chữa',
            type: 'Dịch vụ',
            warrantyMonths: serviceWarrantyMonths,
            expiresAt: ticket.serviceWarrantyExpiresAt,
        });
    }
    const serviceLines = [
        ...issueLabels,
        ticket.issue?.description,
        warrantyLines.length > 0 ? `Bảo hành: ${warrantyLines.map(line => line.label).join(', ')}` : '',
    ].filter(Boolean);
    const payload = {
        customerName: ticket.customer.name,
        customerPhone: ticket.customer.phone,
        deviceModel: ticket.deviceInfo?.model || '—',
        deviceColor: ticket.deviceInfo?.color,
        deviceImei: ticket.deviceInfo?.imei,
        devicePasscode: ticket.deviceInfo?.passcode,
        services: serviceLines.join(', '),
        totalCost: Number(ticket.payment?.amount || 0),
        createdAt: ticket.createdAt,
        sourceCode: ticket.id.slice(-6).toUpperCase(),
        warrantyLines,
    };

    return (
        <PrintableWarranty
            payload={payload}
            globalConfig={receiptConfig}
            warrantyConfig={warrantyConfig}
            type={mapWarrantyTypeToPrintType(warrantyType)}
        />
    );
}
