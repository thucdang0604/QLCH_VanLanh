import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';

const TERMINAL_REPAIR_STATUSES = new Set(['da_giao_khach', 'huy_phieu']);

type RepairPartData = {
    productId?: string;
    quantity?: number;
    reservedQuantity?: number;
    status?: string;
};

function reservedQuantity(part: RepairPartData): number {
    const quantity = Math.max(0, Number(part.quantity) || 0);
    const explicitReserved = Number(part.reservedQuantity);
    if (Number.isFinite(explicitReserved)) {
        return Math.max(0, Math.min(quantity, explicitReserved));
    }
    return part.status === 'selected' ? quantity : 0;
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_inventory');
        const db = getAdminDb();
        const [productsSnap, repairsSnap] = await Promise.all([
            db.collection('products').get(),
            db.collection('repairs').get(),
        ]);

        const heldMap = new Map<string, number>();
        for (const repairDoc of repairsSnap.docs) {
            const repair = repairDoc.data() as { status?: string; parts?: RepairPartData[] };
            if (TERMINAL_REPAIR_STATUSES.has(repair.status || '')) continue;

            for (const part of repair.parts || []) {
                if (!part.productId) continue;
                const reserved = reservedQuantity(part);
                if (reserved <= 0) continue;
                heldMap.set(part.productId, (heldMap.get(part.productId) || 0) + reserved);
            }
        }

        const writer = db.bulkWriter();
        for (const productDoc of productsSnap.docs) {
            writer.update(productDoc.ref, { held: heldMap.get(productDoc.id) || 0 });
        }
        await writer.close();

        return NextResponse.json({
            success: true,
            updatedProducts: productsSnap.size,
            heldByProduct: Object.fromEntries(heldMap),
            executedBy: caller.uid,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.startsWith('Forbidden') || message.startsWith('Missing Authorization') ? 403 : 500;
        return NextResponse.json({ success: false, error: message }, { status });
    }
}
