export interface ChatWorkflowHandoff {
  roomId: string;
  customerName: string;
  customerPhone: string;
}

const STORAGE_KEY = 'vanlanh_chat_workflow_handoff';

export function storeChatWorkflowHandoff(input: ChatWorkflowHandoff): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(input));
}

export function consumeChatWorkflowHandoff(): ChatWorkflowHandoff | null {
  if (typeof window === 'undefined') return null;

  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<ChatWorkflowHandoff>;
    const roomId = typeof value.roomId === 'string' ? value.roomId.slice(0, 220) : '';
    const customerName = typeof value.customerName === 'string' ? value.customerName.trim().slice(0, 100) : '';
    const customerPhone = typeof value.customerPhone === 'string'
      ? value.customerPhone.replace(/[^0-9]/g, '').slice(0, 15)
      : '';

    if (!roomId || (!customerName && !customerPhone)) return null;
    return { roomId, customerName, customerPhone };
  } catch {
    return null;
  }
}
