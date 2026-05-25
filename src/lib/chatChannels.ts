export type ChatChannel = 'web' | 'zalo' | 'facebook';

export const CHAT_CHANNEL_LABELS: Record<ChatChannel, string> = {
  web: 'Web',
  zalo: 'Zalo',
  facebook: 'Facebook',
};

export function normalizeChatChannel(value: unknown): ChatChannel {
  return value === 'zalo' || value === 'facebook' ? value : 'web';
}

export function getChatChannelLabel(value: unknown): string {
  return CHAT_CHANNEL_LABELS[normalizeChatChannel(value)];
}

export function isExternalChatChannel(value: unknown): value is Exclude<ChatChannel, 'web'> {
  return value === 'zalo' || value === 'facebook';
}

export function toSafeRtdbKey(value: string): string {
  return value.replace(/[.#$/[\]\s]/g, '_').slice(0, 180);
}

export function buildExternalChatRoomId(channel: Exclude<ChatChannel, 'web'>, pageId: string, userId: string): string {
  const safePage = toSafeRtdbKey(pageId || 'default');
  const safeUser = toSafeRtdbKey(userId);
  return `${channel}_${safePage}_${safeUser}`;
}
