import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_CONFIG } from '@/lib/config-defaults';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
    // Block in production — this is a one-time seed/migration route
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Seed routes are disabled in production' }, { status: 403 });
    }

    try {
        await requireAdmin(request);

        const db = getAdminDb();
        await db.collection('system_config').doc('taxonomy_settings').set({
            taxonomy: DEFAULT_CONFIG.taxonomy,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        
        return NextResponse.json({ success: true, message: 'Taxonomy seeded successfully' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: message },
            { status: message.toLowerCase().includes('forbidden') ? 403 : message.toLowerCase().includes('missing authorization') ? 401 : 500 }
        );
    }
}
