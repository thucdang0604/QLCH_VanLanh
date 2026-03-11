import { NextRequest, NextResponse } from 'next/server';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// This API route creates an admin user in Firestore
// Usage: POST /api/seed-admin with body { uid, email }
// Or call directly with a known email

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { uid, email, secretKey } = body;

        // Simple security check - in production, use environment variable
        const validSecret = process.env.ADMIN_SEED_SECRET || 'vanlanh-admin-secret-2024';
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
        const userRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            // Update to admin
            await setDoc(userRef, {
                ...userDoc.data(),
                role: 'admin',
                updatedAt: serverTimestamp(),
            }, { merge: true });
        } else {
            // Create new admin user
            await setDoc(userRef, {
                email,
                displayName: 'Admin',
                role: 'admin',
                createdAt: serverTimestamp(),
            });
        }

        return NextResponse.json({
            success: true,
            message: `User ${email} is now an admin`,
        });
    } catch (error: any) {
        console.error('Seed admin error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// GET endpoint to check admin status
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    if (!uid) {
        return NextResponse.json(
            { success: false, error: 'UID is required' },
            { status: 400 }
        );
    }

    try {
        const userRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            return NextResponse.json({
                success: true,
                isAdmin: false,
                exists: false,
            });
        }

        const data = userDoc.data();
        return NextResponse.json({
            success: true,
            isAdmin: data.role === 'admin',
            exists: true,
            role: data.role,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
