import { NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

/**
 * Migration: Parse legacy string prices → numeric price_original
 * 
 * GET /api/dev/migrate-prices → dry run (preview changes)
 * POST /api/dev/migrate-prices → execute migration
 */

function parseLegacyPrice(s: string): number {
    const cleaned = s.replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
}

export async function GET() {
    if (!isAdminAvailable()) {
        return NextResponse.json({ error: 'Admin SDK not available' }, { status: 500 });
    }
    const db = getAdminDb();
    const snapshot = await db.collection('services').get();

    const preview: Array<{ id: string; name: string; oldPrice: string; newPrice: number }> = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        // Only migrate docs that have string `price` and no `price_original`
        if (typeof data.price === 'string' && !data.price_original) {
            const parsed = parseLegacyPrice(data.price);
            preview.push({
                id: doc.id,
                name: data.name || '(no name)',
                oldPrice: data.price,
                newPrice: parsed,
            });
        }
    }

    return NextResponse.json({
        message: `Dry run: ${preview.length} services need migration`,
        total: snapshot.size,
        toMigrate: preview.length,
        preview,
    });
}

export async function POST() {
    if (!isAdminAvailable()) {
        return NextResponse.json({ error: 'Admin SDK not available' }, { status: 500 });
    }
    const db = getAdminDb();
    const snapshot = await db.collection('services').get();

    let migrated = 0;
    const results: Array<{ id: string; name: string; oldPrice: string; newPrice: number }> = [];

    const batch = db.batch();
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (typeof data.price === 'string' && !data.price_original) {
            const parsed = parseLegacyPrice(data.price);
            batch.update(doc.ref, {
                price_original: parsed,
                price: null, // clear legacy field
            });
            results.push({
                id: doc.id,
                name: data.name || '(no name)',
                oldPrice: data.price,
                newPrice: parsed,
            });
            migrated++;
        }
    }

    if (migrated > 0) {
        await batch.commit();
    }

    return NextResponse.json({
        message: `Migrated ${migrated} services`,
        migrated,
        results,
    });
}
