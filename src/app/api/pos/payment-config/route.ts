import { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/handler';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { buildPaymentBankConfig } from '@/lib/paymentBankConfig';

/**
 * Read-only QR payment details for a completed POS receipt.
 * This deliberately excludes admin-only TOTP and contact configuration.
 */
export const GET = withApi({ name: 'pos/payment-config' }, async (request: NextRequest, context) => {
    await requirePermission(request, 'manage_orders');

    const snapshot = await getAdminDb().collection('settings').doc('bank_config').get();
    return context.json({
        success: true,
        config: snapshot.exists ? buildPaymentBankConfig(snapshot.data()) : null,
    });
});
