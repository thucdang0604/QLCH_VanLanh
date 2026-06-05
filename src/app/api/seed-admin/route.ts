import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';

// This API route creates an admin user in Firestore
// Usage: POST /api/seed-admin with body { uid, email }
// Or call directly with a known email

export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Endpoint chặn chạy trên Production để bảo vệ dữ liệu.' }, { status: 403 });
    }
    try {
        const body = await request.json();
        const { uid, email, secretKey } = body;

        // Security: REQUIRE env var — no hardcoded fallback
        const validSecret = process.env.ADMIN_SEED_SECRET;
        if (!validSecret) {
            return NextResponse.json(
                { success: false, error: 'Server misconfigured: missing ADMIN_SEED_SECRET' },
                { status: 500 }
            );
        }
        if (secretKey !== validSecret) {
            return NextResponse.json(
                { success: false, error: 'Invalid secret key' },
                { status: 401 }
            );
        }

        if (!uid || !email) {
            return NextResponse.json(
                { success: false, error: 'UID and email are required' },
                { status: 400 }
            );
        }

        // Check if user already exists
        const userRef = getAdminDb().collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            // Update to admin
            await userRef.set({
                ...userDoc.data(),
                role: 'admin',
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        } else {
            // Create new admin user
            await userRef.set({
                email,
                displayName: 'Admin',
                role: 'admin',
                createdAt: FieldValue.serverTimestamp(),
            });
        }

        return NextResponse.json({
            success: true,
            message: `User ${email} is now an admin`,
        });
    } catch (error: unknown) {
        console.error('Seed admin error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// GET endpoint to check admin status
export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Endpoint chặn chạy trên Production để bảo vệ dữ liệu.' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    if (!uid) {
        return NextResponse.json(
            { success: false, error: 'UID is required' },
            { status: 400 }
        );
    }

    try {
        const userRef = getAdminDb().collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return NextResponse.json({
                success: true,
                isAdmin: false,
                exists: false,
            });
        }

        const data = userDoc.data() ?? {};
        return NextResponse.json({
            success: true,
            isAdmin: data.role === 'admin',
            exists: true,
            role: data.role,
        });
    } catch (error: unknown) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
