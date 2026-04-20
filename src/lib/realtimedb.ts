import {
    ref,
    push,
    set,
    onValue,
    off,
    query,
    orderByChild,
    limitToLast,
    DataSnapshot,
    update,
    get
} from 'firebase/database';
import { rtdb } from './firebase';

export interface ChatRoomInfo {
    customerId: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    hasUnreadAdmin?: boolean;
    hasUnreadUser?: boolean;
    lastMessage?: string;
    lastMessageTime?: number;
    botActive?: boolean;
    [key: string]: any;
}

export interface ChatMessage {
    id?: string;
    text: string;
    senderId: string;
    senderType: 'user' | 'admin' | 'bot';
    timestamp: number;
}

export interface GeminiHistoryItem {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export function subscribeToRooms(callback: (rooms: Record<string, ChatRoomInfo>) => void): () => void {
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
    });
    return () => off(roomsRef, 'value', listener);
}

export function subscribeToRoomInfo(roomId: string, callback: (info: ChatRoomInfo | null) => void): () => void {
    const infoRef = ref(rtdb, `chats/${roomId}/info`);
    const listener = onValue(infoRef, (snapshot) => {
        callback(snapshot.val() as ChatRoomInfo | null);
    });
    return () => off(infoRef, 'value', listener);
}

export function subscribeToMessages(roomId: string, callback: (messages: ChatMessage[]) => void): () => void {
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
    });

    return () => off(messagesRef, 'value', listener);
}

export async function sendMessage(
    roomId: string, 
    text: string, 
    senderId: string, 
    senderType: 'user' | 'admin' | 'bot'
): Promise<void> {
    const messagesRef = ref(rtdb, `chats/${roomId}/messages`);
    await push(messagesRef, {
        text,
        senderId,
        senderType,
        timestamp: Date.now()
    });

    const infoRef = ref(rtdb, `chats/${roomId}/info`);
    const updates: Partial<ChatRoomInfo> = {
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
    const infoRef = ref(rtdb, `chats/${roomId}/info`);
    await update(infoRef, updates);
}

export async function handleAIAutoReply(roomId: string, messages: ChatMessage[], newText: string): Promise<void> {
    try {
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
            }),
        });
        const aiData = await aiRes.json();
        
        if (aiData.success && aiData.content) {
            const messagesRef = ref(rtdb, `chats/${roomId}/messages`);
            await push(messagesRef, {
                text: aiData.content,
                senderId: 'bot',
                senderType: 'admin',
                timestamp: Date.now(),
            });
            
            const updatedInfo = (await get(infoRef)).val() || {};
            await set(infoRef, {
                ...updatedInfo,
                lastMessage: '[AI] ' + aiData.content.substring(0, 50),
                lastMessageTime: Date.now(),
                hasUnreadUser: true,
            });
        }
    } catch (error) {
        console.error("Lỗi AI Auto Reply:", error);
    }
}
