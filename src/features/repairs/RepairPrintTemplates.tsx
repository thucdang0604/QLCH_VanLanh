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

    const warrantyPartNames = (ticket.parts || [])
        .filter(part => {
            if (!isSelectedRepairPart(part) || !isWarrantyEligibleRepairPart(part)) return false;
            if (!part.warrantyExpiresAt) return true;
            const expiresAt = typeof part.warrantyExpiresAt === 'number'
                ? part.warrantyExpiresAt
                : (part.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
            return expiresAt > Date.now();
        })
        .map(part => part.productName)
        .filter(Boolean);
    const issueLabels = ticket.issues?.map(issue => issue.label).filter(Boolean) || [];
    const serviceLines = [
        ...issueLabels,
        ticket.issue?.description,
        warrantyPartNames.length > 0 ? `Linh kiện bảo hành: ${warrantyPartNames.join(', ')}` : '',
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
