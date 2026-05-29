import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { toSafeRtdbKey } from '@/lib/chatChannels';
import { getAdminDb, getAdminRtdb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
const ROOM_LINK_TIMEOUT_MS = 8000;

interface StoredCustomer {
  phone: string;
  name: string;
  totalOrders?: number;
  totalRepairs?: number;
  totalSpent?: number;
}

function normalizePhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^0-9]/g, '') : '';
}

function parseRoomId(roomId: string): string | null {
  const safeRoomId = toSafeRtdbKey(roomId);
  return safeRoomId && safeRoomId === roomId ? safeRoomId : null;
}

function storedCustomer(
  phone: string,
  data: Record<string, unknown> | undefined,
  permissions: { viewOrders: boolean; viewRepairs: boolean },
): StoredCustomer | null {
  if (!data) return null;
  return {
    phone,
    name: typeof data.name === 'string' ? data.name : '',
    ...(permissions.viewOrders ? {
      totalOrders: Number(data.totalOrders || 0),
      totalSpent: Number(data.totalSpent || 0),
    } : {}),
    ...(permissions.viewRepairs ? { totalRepairs: Number(data.totalRepairs || 0) } : {}),
  };
}

function getMetricPermissions(user: { role: string; permissions: string[] }) {
  return {
    viewOrders: user.role === 'admin' || user.permissions.includes('manage_orders'),
    viewRepairs: user.role === 'admin' || user.permissions.includes('manage_repairs'),
  };
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const lower = message.toLowerCase();
  const status = lower.includes('missing authorization')
    ? 401
    : lower.includes('forbidden')
      ? 403
      : 500;
  if (status === 500) {
    console.error('[AdminChat] Customer API failed:', error);
    return NextResponse.json({ success: false, error: 'Customer profile operation failed' }, { status });
  }
  return NextResponse.json({ success: false, error: message }, { status });
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Customer room link timed out after ${ms}ms`)), ms);
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const user = await requirePermission(request, 'chat_support');
    const { roomId } = await context.params;
    if (!parseRoomId(roomId)) {
      return NextResponse.json({ success: false, error: 'Invalid roomId' }, { status: 400 });
    }

    const phone = normalizePhone(request.nextUrl.searchParams.get('phone'));
    if (phone.length < 9 || phone.length > 15) {
      return NextResponse.json({ success: false, error: 'Invalid phone' }, { status: 400 });
    }

    const snapshot = await getAdminDb().collection('customers').doc(phone).get();
    return NextResponse.json({
      success: true,
      customer: storedCustomer(phone, snapshot.exists ? snapshot.data() : undefined, getMetricPermissions(user)),
    });
  } catch (error: unknown) {
    return routeError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const user = await requirePermission(request, 'chat_support');
    const { roomId } = await context.params;
    const safeRoomId = parseRoomId(roomId);
    if (!safeRoomId) {
      return NextResponse.json({ success: false, error: 'Invalid roomId' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as Partial<{ name: string; phone: string }>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = normalizePhone(body.phone);
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ success: false, error: 'Invalid customer name' }, { status: 400 });
    }
    if (phone.length < 9 || phone.length > 15) {
      return NextResponse.json({ success: false, error: 'Invalid phone' }, { status: 400 });
    }

    const customerRef = getAdminDb().collection('customers').doc(phone);
    const existing = await customerRef.get();
    await customerRef.set({
      phone,
      name,
      updatedAt: FieldValue.serverTimestamp(),
      lastVisit: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : {
        type: 'retail',
        totalSpent: 0,
        totalOrders: 0,
        totalRepairs: 0,
        totalAppointments: 0,
        tags: [],
        createdAt: FieldValue.serverTimestamp(),
      }),
    }, { merge: true });

    let roomLinked = true;
    try {
      await Promise.race([
        getAdminRtdb().ref(`chats/${safeRoomId}/info`).update({
          customerId: phone,
          customerName: name,
          customerPhone: phone,
          phone,
          displayName: name.slice(0, 50),
        }),
        timeoutAfter(ROOM_LINK_TIMEOUT_MS),
      ]);
    } catch (linkError) {
      roomLinked = false;
      console.error('[AdminChat] Customer stored but room link failed:', linkError);
    }

    const customer = storedCustomer(phone, {
      ...(existing.exists ? existing.data() : {}),
      phone,
      name,
    }, getMetricPermissions(user));
    return NextResponse.json({ success: true, customer, roomLinked });
  } catch (error: unknown) {
    return routeError(error);
  }
}
