import { NextResponse } from 'next/server';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_CONFIG } from '@/lib/ConfigContext';

/**
 * POST /api/seed-config
 * Seeds the system_config/main_settings document with default values.
 * Only writes if the document does not already exist.
 */
export async function POST() {
    try {
        const docRef = doc(db, 'system_config', 'main_settings');
        const existing = await getDoc(docRef);

        if (existing.exists()) {
            return NextResponse.json({
                success: true,
                message: 'Config already exists, skipping seed.',
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
    } catch (error: any) {
        console.error('Seed config error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        const docRef = doc(db, 'system_config', 'main_settings');
        const snapshot = await getDoc(docRef);

        return NextResponse.json({
            exists: snapshot.exists(),
            data: snapshot.exists() ? snapshot.data() : null,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
