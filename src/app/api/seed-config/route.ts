import { NextRequest, NextResponse } from 'next/server';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_CONFIG } from '@/lib/ConfigContext';
import { requireAdminOrStaff } from '@/lib/apiAuth';

/**
 * POST /api/seed-config
 * Seeds the system_config/main_settings document with default values.
 * Only writes if the document does not already exist.
 */
export async function POST(request: NextRequest) {
    try {
        await requireAdminOrStaff(request);

        const docRef = doc(db, 'system_config', 'main_settings');
        const force = request.nextUrl.searchParams.get('force') === 'true';
        const existing = await getDoc(docRef);

        if (existing.exists() && !force) {
            return NextResponse.json({
                success: true,
                message: 'Config already exists, skipping seed. Use ?force=true to overwrite.',
                data: existing.data(),
            });
        }

        await setDoc(docRef, {
            ...DEFAULT_CONFIG,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        return NextResponse.json({
            success: true,
            message: 'Default config seeded successfully!',
        });
    } catch (error: unknown) {
        console.error('Seed config error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: message },
            { status: message.toLowerCase().includes('forbidden') ? 403 : message.toLowerCase().includes('missing authorization') ? 401 : 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        await requireAdminOrStaff(request);

        const docRef = doc(db, 'system_config', 'main_settings');
        const snapshot = await getDoc(docRef);

        return NextResponse.json({
            exists: snapshot.exists(),
            data: snapshot.exists() ? snapshot.data() : null,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: message },
            { status: message.toLowerCase().includes('forbidden') ? 403 : message.toLowerCase().includes('missing authorization') ? 401 : 500 }
        );
    }
}
