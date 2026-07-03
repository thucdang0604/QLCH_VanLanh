export interface ChatWorkflowHandoff {
  roomId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  primaryContactType?: string | null;
  primaryContactValue?: string;
}

/**
 * Build a handoff URL with query params instead of sessionStorage.
 * Each tab navigates to its own URL, so data is tab-isolated (BUG-CHAT-001).
 */
export function buildHandoffUrl(
  basePath: '/admin/repairs' | '/admin/pos',
  input: ChatWorkflowHandoff,
): string {
  const params = new URLSearchParams({
    source: 'chat',
    handoffRoom: input.roomId.slice(0, 220),
    handoffCustomerId: (input.customerId || '').trim().slice(0, 120),
    handoffName: input.customerName.trim().slice(0, 100),
    handoffPhone: input.customerPhone.replace(/[^0-9]/g, '').slice(0, 15),
    handoffContactType: (input.primaryContactType || '').trim().slice(0, 30),
    handoffContactValue: (input.primaryContactValue || '').trim().slice(0, 160),
  });
  return `${basePath}?${params.toString()}`;
}

/**
 * Read handoff data from URL search params (one-shot: returns null if absent).
 * Replaces the old sessionStorage-based consumeChatWorkflowHandoff().
 */
export function consumeChatWorkflowHandoff(
  searchParams: URLSearchParams,
): ChatWorkflowHandoff | null {
  const roomId = searchParams.get('handoffRoom');
  const customerId = searchParams.get('handoffCustomerId') || '';
  const customerName = searchParams.get('handoffName') || '';
  const customerPhone = searchParams.get('handoffPhone') || '';
  const primaryContactType = searchParams.get('handoffContactType') || '';
  const primaryContactValue = searchParams.get('handoffContactValue') || '';

  if (!roomId || (!customerId && !customerName && !customerPhone && !primaryContactValue)) return null;

  return {
    roomId: roomId.slice(0, 220),
    customerId: customerId.trim().slice(0, 120),
    customerName: customerName.trim().slice(0, 100),
    customerPhone: customerPhone.replace(/[^0-9]/g, '').slice(0, 15),
    primaryContactType: primaryContactType.trim().slice(0, 30),
    primaryContactValue: primaryContactValue.trim().slice(0, 160),
  };
}
