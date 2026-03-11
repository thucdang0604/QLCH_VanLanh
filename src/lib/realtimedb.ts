import {
    ref,
    push,
    set,
    onValue,
    off,
    query,
    orderByChild,
    limitToLast,
    DataSnapshot
} from 'firebase/database';
import { rtdb } from './firebase';
import { ChatMessage, ChatSession } from './types';

// ============ CHAT SESSIONS ============

export function subscribeToSessions(
    callback: (sessions: ChatSession[]) => void
): () => void {
    const sessionsRef = ref(rtdb, 'chat_sessions');
    const q = query(sessionsRef, orderByChild('lastMessageAt'), limitToLast(50));

    const listener = onValue(q, (snapshot: DataSnapshot) => {
        const sessions: ChatSession[] = [];
        snapshot.forEach((child) => {
            sessions.push({
                id: child.key!,
                ...child.val(),
            });
        });
        callback(sessions.reverse());
    });

    return () => off(sessionsRef);
}

export async function createChatSession(
    customerId: string,
    customerName: string
): Promise<string | null> {
    try {
        const sessionsRef = ref(rtdb, 'chat_sessions');
        const newSessionRef = push(sessionsRef);

        await set(newSessionRef, {
            customerId,
            customerName,
            status: 'active',
            createdAt: Date.now(),
            lastMessageAt: Date.now(),
        });

        return newSessionRef.key;
    } catch (error) {
        console.error('Error creating chat session:', error);
        return null;
    }
}

export async function updateSessionStatus(
    sessionId: string,
    status: 'active' | 'closed'
): Promise<boolean> {
    try {
        const sessionRef = ref(rtdb, `chat_sessions/${sessionId}/status`);
        await set(sessionRef, status);
        return true;
    } catch (error) {
        console.error('Error updating session status:', error);
        return false;
    }
}

// ============ CHAT MESSAGES ============

export function subscribeToMessages(
    sessionId: string,
    callback: (messages: ChatMessage[]) => void
): () => void {
    const messagesRef = ref(rtdb, `chat_messages/${sessionId}`);
    const q = query(messagesRef, orderByChild('timestamp'), limitToLast(100));

    const listener = onValue(q, (snapshot: DataSnapshot) => {
        const messages: ChatMessage[] = [];
        snapshot.forEach((child) => {
            messages.push({
                id: child.key!,
                ...child.val(),
            });
        });
        callback(messages);
    });

    return () => off(messagesRef);
}

export async function sendChatMessage(
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'timestamp'>
): Promise<string | null> {
    try {
        const messagesRef = ref(rtdb, `chat_messages/${sessionId}`);
        const newMessageRef = push(messagesRef);

        const messageData = {
            ...message,
            timestamp: Date.now(),
        };

        await set(newMessageRef, messageData);

        // Update session's last message
        const sessionRef = ref(rtdb, `chat_sessions/${sessionId}`);
        await set(ref(rtdb, `chat_sessions/${sessionId}/lastMessageAt`), Date.now());
        await set(ref(rtdb, `chat_sessions/${sessionId}/lastMessage`), message.content);

        return newMessageRef.key;
    } catch (error) {
        console.error('Error sending message:', error);
        return null;
    }
}

export async function markMessagesAsRead(sessionId: string): Promise<void> {
    try {
        const unreadRef = ref(rtdb, `chat_sessions/${sessionId}/unreadCount`);
        await set(unreadRef, 0);
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}
