

import { getRtdbInstance } from './firebase';
import { getChatChannelLabel, normalizeChatChannel, type ChatChannel } from './chatChannels';

export interface ChatRoomInfo {
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    displayName?: string;
    avatarUrl?: string;
    email?: string | null;
    phone?: string;
    isGuest?: boolean;
    channel?: ChatChannel;
    source?: ChatChannel;
    sourceLabel?: string;
    externalUserId?: string;
    externalPageId?: string;
    profileSyncedAt?: number;
    hasUnreadAdmin?: boolean;
    hasUnreadUser?: boolean;
    hasUnread?: boolean;
    lastMessage?: string;
    lastMessageTime?: number;
    botActive?: boolean;
    [key: string]: unknown;
}

export interface ChatMessage {
    id?: string;
    text: string;
    senderId: string;
    senderType: 'user' | 'admin' | 'bot' | 'guest' | 'ai';
    timestamp: number;
    channel?: ChatChannel;
    source?: ChatChannel;
    sourceLabel?: string;
    externalMessageId?: string | null;
    attachments?: Array<{
        type: 'image' | 'sticker' | 'audio' | 'video' | 'file' | 'unknown';
        url?: string;
        stickerId?: string;
        storagePath?: string;
        contentType?: string;
    }>;
}

export interface GeminiHistoryItem {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export async function subscribeToRooms(
    callback: (rooms: Record<string, ChatRoomInfo>) => void,
    onError?: (error: Error) => void
): Promise<() => void> {
    const rtdb = await getRtdbInstance();
    const { ref, onValue, off } = await import('firebase/database');

    const roomsRef = ref(rtdb, 'chats');
    const listener = onValue(roomsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const rooms: Record<string, ChatRoomInfo> = {};
            for (const roomId in data) {
                if (data[roomId].info) {
                    rooms[roomId] = data[roomId].info;
                }
            }
            callback(rooms);
        } else {
            callback({});
        }
    }, (error) => {
        onError?.(error);
    });
    return () => off(roomsRef, 'value', listener);
}

export async function subscribeToRoomInfo(
    roomId: string,
    callback: (info: ChatRoomInfo | null) => void,
    onError?: (error: Error) => void
): Promise<() => void> {
    const rtdb = await getRtdbInstance();
    const { ref, onValue, off } = await import('firebase/database');

    const infoRef = ref(rtdb, `chats/${roomId}/info`);
    const listener = onValue(infoRef, (snapshot) => {
        callback(snapshot.val() as ChatRoomInfo | null);
    }, (error) => {
        onError?.(error);
    });
    return () => off(infoRef, 'value', listener);
}

export async function subscribeToMessages(
    roomId: string,
    callback: (messages: ChatMessage[]) => void,
    onError?: (error: Error) => void
): Promise<() => void> {
    const rtdb = await getRtdbInstance();
    const { ref, onValue, off, query, orderByChild, limitToLast } = await import('firebase/database');

    const messagesRef = ref(rtdb, `chats/${roomId}/messages`);
    const q = query(messagesRef, orderByChild('timestamp'), limitToLast(100));
    
    const listener = onValue(q, (snapshot) => {
        const messages: ChatMessage[] = [];
        snapshot.forEach((child) => {
            messages.push({
                id: child.key!,
                ...child.val(),
            });
        });
        callback(messages);
    }, (error) => {
        onError?.(error);
    });

    return () => off(messagesRef, 'value', listener);
}

export async function sendMessage(
    roomId: string, 
    text: string, 
    senderId: string, 
    senderType: 'user' | 'admin' | 'bot' | 'guest' | 'ai',
    channel: ChatChannel = 'web'
): Promise<void> {
    const rtdb = await getRtdbInstance();
    const { ref, push, update } = await import('firebase/database');

    const normalizedChannel = normalizeChatChannel(channel);
    const sourceLabel = getChatChannelLabel(normalizedChannel);
    const messagesRef = ref(rtdb, `chats/${roomId}/messages`);
    await push(messagesRef, {
        text,
        senderId,
        senderType,
        timestamp: Date.now(),
        channel: normalizedChannel,
        source: normalizedChannel,
        sourceLabel
    });

    const infoRef = ref(rtdb, `chats/${roomId}/info`);
    const updates: Partial<ChatRoomInfo> = {
        channel: normalizedChannel,
        source: normalizedChannel,
        sourceLabel,
        lastMessage: senderType === 'user' ? text.substring(0, 50) : `[NV] ${text.substring(0, 50)}`,
        lastMessageTime: Date.now(),
    };
    
    if (senderType === 'user') {
        updates.hasUnreadAdmin = true;
    } else {
        updates.hasUnreadUser = true;
    }
    
    await update(infoRef, updates);
}

export async function updateRoomInfo(roomId: string, updates: Partial<ChatRoomInfo>): Promise<void> {
    const rtdb = await getRtdbInstance();
    const { ref, update } = await import('firebase/database');

    const infoRef = ref(rtdb, `chats/${roomId}/info`);
    await update(infoRef, updates);
}

export async function handleAIAutoReply(roomId: string, messages: ChatMessage[], newText: string): Promise<void> {
    try {
        const rtdb = await getRtdbInstance();
        const { ref, get } = await import('firebase/database');

        const infoRef = ref(rtdb, `chats/${roomId}/info`);
        const botActiveSnap = await get(infoRef);
        if (botActiveSnap.exists() && botActiveSnap.val().botActive === false) {
            return; // Bot is explicitly disabled
        }

        const rawHistory: GeminiHistoryItem[] = messages.slice(-5).map((m) => ({
            role: m.senderType === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        }));

        const recentHistory: GeminiHistoryItem[] = [];
        let expectedRole = 'user';
        for (const msg of rawHistory) {
            if (msg.role === expectedRole) {
                recentHistory.push(msg);
                expectedRole = expectedRole === 'user' ? 'model' : 'user';
            }
        }
        if (expectedRole === 'model') {
            recentHistory.pop();
        }
        recentHistory.push({ role: 'user', parts: [{ text: newText }] });

        const aiRes = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: newText,
                history: recentHistory,
                context: 'Hãy đóng vai nhân viên hỗ trợ khách hàng của Văn Lành Service. Trả lời ngắn gọn, thân thiện.',
                roomId: roomId,
                pushToRtdb: true
            }),
        });
        
        const aiData = await aiRes.json();
        if (!aiData.success) {
            console.error('AI API failed to process request');
        }
    } catch (error) {
        console.error('Error handling AI auto reply:', error);
    }
}
