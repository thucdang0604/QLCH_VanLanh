import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { normalizeChatChannel, toSafeRtdbKey, type ChatChannel } from '@/lib/chatChannels';
import {
  buildContactlessDocumentBaseId,
  buildContactMethods,
  buildContactSearchKeywords,
  getPrimaryContact,
} from '@/lib/contactIdentity';
import { getAdminDb, getAdminRtdb } from '@/lib/firebaseAdmin';
import type { ContactMethod, ContactMethodType } from '@/lib/types/contact';
import { getApiErrorMessage, getApiErrorStatus, withApi, type ApiRouteContext } from '@/lib/api/handler';

export const runtime = 'nodejs';
const ROOM_LINK_TIMEOUT_MS = 8000;

interface StoredCustomer {
  customerId: string;
  phone: string;
  name: string;
  primaryContactType?: ContactMethodType | null;
  primaryContactValue?: string;
  totalOrders?: number;
  totalRepairs?: number;
  totalSpent?: number;
}

function normalizePhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^0-9]/g, '') : '';
}

function normalizeCustomerId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/[\/#?\[\]]/g, '-').slice(0, 120)
    : '';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseRoomId(roomId: string): string | null {
  const safeRoomId = toSafeRtdbKey(roomId);
  return safeRoomId && safeRoomId === roomId ? safeRoomId : null;
}

function storedCustomer(
  customerId: string,
  data: Record<string, unknown> | undefined,
  permissions: { viewOrders: boolean; viewRepairs: boolean },
): StoredCustomer | null {
  if (!data) return null;
  return {
    customerId,
    phone: typeof data.phone === 'string' ? data.phone : '',
    name: typeof data.name === 'string' ? data.name : '',
    primaryContactType: data.primaryContactType as ContactMethodType | null | undefined,
    primaryContactValue: typeof data.primaryContactValue === 'string' ? data.primaryContactValue : '',
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

function routeError(error: unknown, context: ApiRouteContext) {
  const status = getApiErrorStatus(error);
  if (status === 500) {
    console.error('[AdminChat] Customer API failed:', error);
    return context.json({ success: false, error: 'Customer profile operation failed' }, { status });
  }
  return context.json({ success: false, error: getApiErrorMessage(error) }, { status });
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Customer room link timed out after ${ms}ms`)), ms);
  });
}

function buildRoomContactInput(input: {
  name: string;
  phone: string;
  channel: ChatChannel;
  externalUserId: string;
  roomId: string;
}) {
  const platformIdentity = input.externalUserId || input.roomId;
  const primaryType: ContactMethodType = input.phone
    ? 'phone'
    : input.channel === 'facebook'
      ? 'facebook'
      : input.channel === 'zalo'
        ? 'zalo'
        : 'other';

  return {
    name: input.name,
    phone: input.phone,
    facebook: input.channel === 'facebook' ? platformIdentity : '',
    zalo: input.channel === 'zalo' ? platformIdentity : '',
    other: input.channel === 'web' ? `web:${platformIdentity}` : '',
    primaryType,
    source: 'chat' as const,
  };
}

function mergeContactMethods(existing: unknown, incoming: ContactMethod[]): ContactMethod[] {
  const byKey = new Map<string, ContactMethod>();
  const add = (method: ContactMethod) => {
    const value = method.normalizedValue || method.value;
    if (!method.type || !value) return;
    byKey.set(`${method.type}:${value}`, method);
  };
  if (Array.isArray(existing)) {
    existing.forEach(method => add(method as ContactMethod));
  }
  incoming.forEach(method => add(method));
  return Array.from(byKey.values()).map((method, index) => ({
    ...method,
    isPrimary: incoming.some(item => item.type === method.type && (item.normalizedValue || item.value) === (method.normalizedValue || method.value) && item.isPrimary)
      || (index === 0 && !incoming.some(item => item.isPrimary)),
  }));
}

export const GET = withApi({ name: 'admin/chat/room-customer', onError: routeError }, async (
  request: NextRequest,
  _context,
  routeContext: { params: Promise<{ roomId: string }> },
) => {
    const user = await requirePermission(request, 'chat_support');
    const { roomId } = await routeContext.params;
    if (!parseRoomId(roomId)) {
      return NextResponse.json({ success: false, error: 'Invalid roomId' }, { status: 400 });
    }

    const customerId = normalizeCustomerId(request.nextUrl.searchParams.get('customerId'));
    const phone = normalizePhone(request.nextUrl.searchParams.get('phone'));
    if (phone && (phone.length < 9 || phone.length > 15)) {
      return NextResponse.json({ success: false, error: 'Invalid phone' }, { status: 400 });
    }
    const lookupId = customerId || phone;
    if (!lookupId) {
      return NextResponse.json({ success: true, customer: null });
    }

    const snapshot = await getAdminDb().collection('customers').doc(lookupId).get();
    return NextResponse.json({
      success: true,
      customer: storedCustomer(snapshot.id, snapshot.exists ? snapshot.data() : undefined, getMetricPermissions(user)),
    });
});

export const POST = withApi({ name: 'admin/chat/room-customer', onError: routeError }, async (
  request: NextRequest,
  context,
  routeContext: { params: Promise<{ roomId: string }> },
) => {
    const user = await requirePermission(request, 'chat_support');
    const { roomId } = await routeContext.params;
    const safeRoomId = parseRoomId(roomId);
    if (!safeRoomId) {
      return NextResponse.json({ success: false, error: 'Invalid roomId' }, { status: 400 });
    }

    const body = await context.readJson<Partial<{
      name: string;
      phone: string;
      customerId: string;
      channel: ChatChannel;
      externalUserId: string;
    }>>(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = normalizePhone(body.phone);
    const requestedCustomerId = normalizeCustomerId(body.customerId);
    const channel = normalizeChatChannel(body.channel);
    const externalUserId = readString(body.externalUserId);
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ success: false, error: 'Invalid customer name' }, { status: 400 });
    }
    if (phone && (phone.length < 9 || phone.length > 15)) {
      return NextResponse.json({ success: false, error: 'Invalid phone' }, { status: 400 });
    }

    const contactInput = buildRoomContactInput({ name, phone, channel, externalUserId, roomId: safeRoomId });
    const incomingContactMethods = buildContactMethods(contactInput);
    const incomingPrimaryContact = getPrimaryContact(incomingContactMethods);
    const resolvedCustomerId = requestedCustomerId
      || (phone ? phone : buildContactlessDocumentBaseId('KH', contactInput));

    const customerRef = getAdminDb().collection('customers').doc(resolvedCustomerId);
    const existing = await customerRef.get();
    const existingData = existing.exists ? existing.data() : undefined;
    const contactMethods = mergeContactMethods(existingData?.contactMethods, incomingContactMethods);
    const primaryContact = getPrimaryContact(contactMethods) || incomingPrimaryContact;
    await customerRef.set({
      code: resolvedCustomerId,
      phone,
      ...(phone ? { primaryPhone: phone } : {}),
      name,
      primaryContactType: primaryContact?.type || null,
      primaryContactValue: primaryContact?.value || '',
      contactMethods,
      searchKeywords: buildContactSearchKeywords(contactInput, contactMethods),
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
          customerId: resolvedCustomerId,
          customerName: name,
          customerPhone: phone || null,
          phone: phone || null,
          primaryContactType: primaryContact?.type || null,
          primaryContactValue: primaryContact?.value || '',
          displayName: name.slice(0, 50),
        }),
        timeoutAfter(ROOM_LINK_TIMEOUT_MS),
      ]);
    } catch (linkError) {
      roomLinked = false;
      console.error('[AdminChat] Customer stored but room link failed:', linkError);
    }

    const customer = storedCustomer(resolvedCustomerId, {
      ...(existingData || {}),
      phone,
      name,
      primaryContactType: primaryContact?.type || null,
      primaryContactValue: primaryContact?.value || '',
    }, getMetricPermissions(user));
    return NextResponse.json({ success: true, customer, roomLinked });
});
