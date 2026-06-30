export interface ChatWorkflowHandoff {
  roomId: string;
  customerName: string;
  customerPhone: string;
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
    handoffName: input.customerName.trim().slice(0, 100),
    handoffPhone: input.customerPhone.replace(/[^0-9]/g, '').slice(0, 15),
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
  const customerName = searchParams.get('handoffName') || '';
  const customerPhone = searchParams.get('handoffPhone') || '';

  if (!roomId || (!customerName && !customerPhone)) return null;

  return {
    roomId: roomId.slice(0, 220),
    customerName: customerName.trim().slice(0, 100),
    customerPhone: customerPhone.replace(/[^0-9]/g, '').slice(0, 15),
  };
}
