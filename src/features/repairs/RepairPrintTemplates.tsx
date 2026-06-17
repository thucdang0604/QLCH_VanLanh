import PrintableReceipt from '@/components/admin/PrintableReceipt';
import PrintableRepairInvoice from '@/components/admin/PrintableRepairInvoice';
import PrintableWarranty from '@/components/admin/PrintableWarranty';
import type { ReceiptConfig } from '@/components/admin/PrintableReceipt';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';
import type { RepairTicket } from '@/lib/types';
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

    const payload = {
        customerName: ticket.customer.name,
        customerPhone: ticket.customer.phone,
        deviceModel: ticket.deviceInfo?.model || '—',
        deviceColor: ticket.deviceInfo?.color,
        deviceImei: ticket.deviceInfo?.imei,
        devicePasscode: ticket.deviceInfo?.passcode,
        services: ticket.issues?.map(issue => issue.label).join(', ') || ticket.issue?.description,
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
