import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_staff');
        const snapshot = await getAdminDb().collection('users').get();
        const users = snapshot.docs.map(userDoc => ({ id: userDoc.id, ...userDoc.data() }));
        return NextResponse.json(users);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
