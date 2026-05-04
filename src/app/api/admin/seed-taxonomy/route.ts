import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_CONFIG } from '@/lib/config-defaults';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET() {
    try {
        const db = getAdminDb();
        await db.collection('system_config').doc('taxonomy_settings').set({
            taxonomy: DEFAULT_CONFIG.taxonomy,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        
        return NextResponse.json({ success: true, message: 'Taxonomy seeded successfully' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
