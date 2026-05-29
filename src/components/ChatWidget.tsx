'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Minimize2, Maximize2, ArrowRight, Sparkles } from 'lucide-react';
import type { ChatMessage } from '@/lib/realtimedb';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { getAuthInstance } from '@/lib/firebase';

export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAiTyping, setIsAiTyping] = useState(false);
    const [roomId, setRoomId] = useState<string>('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [identityError, setIdentityError] = useState('');

    // Registration State
    const [isRegistered, setIsRegistered] = useState(false);
    const [regForm, setRegForm] = useState({ name: '', phone: '' });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [botActive, setBotActive] = useState(true);

    const { user } = useAuth();
    const { config } = useConfig();

    // Check registration status on load
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('vanlanh_guest_id');
            localStorage.removeItem('vanlanh_customer_info');
            if (user) {
                setIsRegistered(true);
            }
        }
    }, [user]);

    // Use an authenticated anonymous Firebase identity for public chat rooms.
    useEffect(() => {
        let cancelled = false;
        if (user?.uid) {
            setRoomId(user.uid);
            setIdentityError('');
            return;
        }

        setIsRegistered(false);
        setRegForm({ name: '', phone: '' });
        void (async () => {
            const auth = await getAuthInstance();
            const currentUser = auth.currentUser;
            const { signInAnonymously } = await import('firebase/auth');
            const firebaseUser = currentUser || (await signInAnonymously(auth)).user;
            if (!cancelled) {
                setRoomId(firebaseUser.uid);
                setIdentityError('');
            }
        })().catch((error) => {
            console.error('Anonymous chat identity failed:', error);
            if (!cancelled) {
                setIdentityError('Khong the khoi tao phien chat an toan. Vui long thu lai.');
            }
        });

        return () => {
            cancelled = true;
        };
    }, [user]);

    // Listen to messages for this room — only when chat is OPEN
    useEffect(() => {
        if (!roomId || !isRegistered || !isOpen) return;

        let isMounted = true;
        let unsubscribe: (() => void) | undefined;

        // Defer listener to not block main thread
        const deferFn = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));

        deferFn(async () => {
            if (!isMounted) return;
            const { subscribeToMessages } = await import('@/lib/realtimedb');
            subscribeToMessages(roomId, (messageList) => {
                // Detect if last message is from staff (admin)
                const lastMsg = messageList[messageList.length - 1];
                if (lastMsg && lastMsg.senderType === 'admin' && lastMsg.senderId !== 'bot') {
                    // Staff replied — cancel pending AI and set botActive=false
                    if (aiTimeoutRef.current) {
                        clearTimeout(aiTimeoutRef.current);
                        aiTimeoutRef.current = null;
                    }
                    setBotActive(false);
                    // Update Firebase
                    import('@/lib/realtimedb').then(({ updateRoomInfo }) =>
                        updateRoomInfo(roomId, { botActive: false }).catch(() => { })
                    );
                }

                setMessages(messageList);

                // Count unread admin messages when chat is closed
                if (!isOpen) {
                    const adminMessages = messageList.filter(m => m.senderType === 'admin');
                    const lastReadTime = parseInt(localStorage.getItem(`chat_last_read_${roomId}`) || '0');
                    const unread = adminMessages.filter(m => m.timestamp > lastReadTime).length;
                    setUnreadCount(unread);
                }
            }).then(unsub => { unsubscribe = unsub; });
        });

        return () => {
            isMounted = false;
            if (unsubscribe) unsubscribe();
        };
    }, [roomId, isOpen, isRegistered]);

    // Read botActive status from Firebase — only when chat is OPEN
    useEffect(() => {
        if (!roomId || !isOpen) return;
        let unsub: (() => void) | undefined;
        import('@/lib/realtimedb').then(({ subscribeToRoomInfo }) => {
            subscribeToRoomInfo(roomId, (info) => {
                setBotActive(info?.botActive !== false);
                if (!user && typeof info?.displayName === 'string' && info.displayName.trim()) {
                    setRegForm({
                        name: info.displayName,
                        phone: typeof info.phone === 'string' ? info.phone : '',
                    });
                    setIsRegistered(true);
                }
            }).then(fn => { unsub = fn; });
        });
        return () => { if (unsub) unsub(); };
    }, [roomId, isOpen, user]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (aiTimeoutRef.current) {
                clearTimeout(aiTimeoutRef.current);
            }
        };
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isRegistered]);

    // Mark as read when opening chat
    useEffect(() => {
        if (isOpen && roomId && isRegistered) {
            localStorage.setItem(`chat_last_read_${roomId}`, Date.now().toString());
            setUnreadCount(0);
        }
    }, [isOpen, roomId, isRegistered]);

    // Update room metadata (for admin to see user info)
    const updateRoomMetadata = useCallback(async () => {
        if (!roomId) return;

        const metadata: {
            odId: string;
            displayName?: string;
            phone?: string;
            email?: string | null;
            isGuest: boolean;
            lastActivity: number;
        } = {
            odId: roomId,
            isGuest: !user,
            lastActivity: Date.now(),
        };

        if (user) {
            metadata.displayName = user.displayName || 'Khach';
            metadata.phone = user.phone || '';
            metadata.email = user.email || null;
        } else if (regForm.name.trim() && regForm.phone.trim()) {
            metadata.displayName = regForm.name.trim().slice(0, 50);
            metadata.phone = regForm.phone.replace(/[^0-9]/g, '').slice(0, 15);
        }

        try {
            const { updateRoomInfo } = await import('@/lib/realtimedb');
            await updateRoomInfo(roomId, metadata);
        } catch (error) {
            console.error('Error updating room metadata:', error);
        }
    }, [regForm.name, regForm.phone, roomId, user]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!regForm.name.trim() || !regForm.phone.trim()) return;

        setIsRegistered(true);

        // Update metadata immediately (full phone sent to server for admin support)
        if (roomId) {
            try {
                const { updateRoomInfo } = await import('@/lib/realtimedb');
                await updateRoomInfo(roomId, {
                    odId: roomId,
                    displayName: regForm.name.trim().slice(0, 50),
                    phone: regForm.phone.replace(/[^0-9]/g, '').slice(0, 15),
                    isGuest: true,
                    lastActivity: Date.now(),
                    startedAt: Date.now()
                });
            } catch (error) {
                console.error('Error registering chat room:', error);
            }
        }
    };

    const sendUserMessage = async () => {
        if (!inputMessage.trim() || !roomId || isLoading) return;

        const messageText = inputMessage.trim();
        setInputMessage('');
        setIsLoading(true);

        try {
            // Update room metadata
            await updateRoomMetadata();

            // Send user message via realtimedb.ts
            const { sendMessage } = await import('@/lib/realtimedb');
            await sendMessage(roomId, messageText, roomId, 'user');

            // ── User message sent successfully — unlock input immediately ──
            setIsLoading(false);
            inputRef.current?.focus();

            // ── AI Auto-reply via Gemini (30s delay) ──
            if (aiTimeoutRef.current) {
                clearTimeout(aiTimeoutRef.current);
                aiTimeoutRef.current = null;
            }

            // Show AI typing indicator after a short delay
            aiTimeoutRef.current = setTimeout(async () => {
                if (!botActive) return;

                setIsAiTyping(true);
                try {
                    const { handleAIAutoReply } = await import('@/lib/realtimedb');
                    await handleAIAutoReply(roomId, messages, messageText);
                } catch (aiErr) {
                    console.error('AI auto-reply error:', aiErr);
                } finally {
                    setIsAiTyping(false);
                    aiTimeoutRef.current = null;
                }
            }, 30000); // 30 second delay

        } catch (error) {
            console.error('Error sending message:', error);
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendUserMessage();
        }
    };

    const toggleChat = () => {
        setIsOpen(!isOpen);
        setIsMinimized(false);
    };

    // Listen for custom event from MobileBottomNav
    useEffect(() => {
        const handleOpenChat = () => {
            setIsOpen(true);
            setIsMinimized(false);
        };
        window.addEventListener('open-chat-widget', handleOpenChat);
        return () => window.removeEventListener('open-chat-widget', handleOpenChat);
    }, []);

    if (!isOpen) {
        const zaloLink = config.contact_info?.zalo_link || 'https://zalo.me/0932242026';
        const fbLink = config.contact_info?.facebook_link || 'https://www.facebook.com/vanlanh.vn';

        return (
            <div className="fixed bottom-6 right-6 z-50 hidden md:flex flex-col items-center gap-3">
                {/* Zalo */}
                <a
                    href={zaloLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative w-12 h-12 bg-[#0068FF] text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
                    aria-label="Chat qua Zalo"
                >
                    <svg viewBox="0 0 48 48" className="w-7 h-7" fill="currentColor">
                        <path d="M12.5 7C9.46 7 7 9.46 7 12.5v23C7 38.54 9.46 41 12.5 41H24l8.15 5.44A1.5 1.5 0 0034.5 45V41h1C38.54 41 41 38.54 41 35.5v-23C41 9.46 38.54 7 35.5 7h-23zm3 10h17a1.5 1.5 0 010 3h-17a1.5 1.5 0 010-3zm0 6h13a1.5 1.5 0 010 3h-13a1.5 1.5 0 010-3zm0 6h9a1.5 1.5 0 010 3h-9a1.5 1.5 0 010-3z"/>
                    </svg>
                    <span className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">Chat Zalo</span>
                    <span className="absolute inset-0 rounded-full bg-[#0068FF] animate-ping opacity-20" />
                </a>

                {/* Messenger */}
                <a
                    href={fbLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative w-12 h-12 bg-gradient-to-br from-[#00B2FF] to-[#006AFF] text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
                    aria-label="Chat qua Messenger"
                >
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.2 5.42 3.15 7.2.16.15.26.36.27.58l.05 1.82c.02.62.67 1.03 1.24.78l2.03-.9c.18-.08.38-.1.57-.06.9.23 1.86.36 2.85.36 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm5.95 7.56l-2.9 4.62c-.46.74-1.45.93-2.14.42l-2.31-1.73a.58.58 0 00-.7 0l-3.12 2.37c-.42.32-.96-.18-.68-.63l2.9-4.62c.46-.74 1.45-.93 2.14-.42l2.31 1.73a.58.58 0 00.7 0l3.12-2.37c.42-.32.96.18.68.63z"/>
                    </svg>
                    <span className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">Messenger</span>
                </a>

                {/* AI Chatbot */}
                <button
                    onClick={toggleChat}
                    className="group relative w-14 h-14 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
                    aria-label="Mở chat hỗ trợ"
                >
                    <MessageCircle size={24} className="group-hover:scale-110 transition-transform" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce">
                            {unreadCount}
                        </span>
                    )}
                    <span className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">Chat AI hỗ trợ</span>
                    <span className="absolute inset-0 rounded-full bg-orange-500 animate-ping opacity-25" />
                </button>
            </div>
        );
    }

    return (
        <div
            className={`fixed bottom-6 right-6 bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300 ${isMinimized ? 'w-80 h-14' : 'w-80 sm:w-96 h-[500px]'
                }`}
        >
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                        <Bot size={20} />
                    </div>
                    <div>
                        <h3 className="font-semibold">Hỗ trợ trực tuyến</h3>
                        <p className="text-xs opacity-80">Văn Lành Service</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        {isMinimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
                    </button>
                    <button
                        onClick={toggleChat}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Content Area */}
                    {!isRegistered ? (
                        // Registration Form
                        <div className="flex-1 p-6 bg-gray-50 flex flex-col justify-center animate-[fadeIn_0.3s_ease]">
                            <div className="text-center mb-6">
                                <h4 className="text-lg font-bold text-gray-900 mb-2">Xin chào! 👋</h4>
                                <p className="text-gray-500 text-sm">Vui lòng để lại thông tin để chúng tôi hỗ trợ bạn tốt nhất.</p>
                            </div>
                            <form onSubmit={handleRegister} className="space-y-4">
                                {identityError && (
                                    <p className="text-sm text-red-600">{identityError}</p>
                                )}
                                <div>
                                    <input
                                        type="text"
                                        placeholder="Tên của bạn *"
                                        value={regForm.name}
                                        onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                                        required
                                    />
                                </div>
                                <div>
                                    <input
                                        type="tel"
                                        placeholder="Số điện thoại *"
                                        value={regForm.phone}
                                        onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!roomId || !!identityError}
                                    className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    Bắt đầu chat
                                    <ArrowRight size={18} />
                                </button>
                            </form>
                        </div>
                    ) : (
                        // Chat Area
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                                {messages.length === 0 && (
                                    <div className="text-center py-8">
                                        <Bot size={48} className="mx-auto text-gray-300 mb-3" />
                                        <p className="text-gray-500 text-sm">
                                            Xin chào <b>{regForm.name || user?.displayName}</b>!<br />
                                            Bạn cần hỗ trợ gì?
                                        </p>
                                    </div>
                                )}

                                {messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`flex ${message.senderType === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`flex items-end gap-2 max-w-[80%] ${message.senderType === 'user' ? 'flex-row-reverse' : ''
                                            }`}>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.senderType === 'user'
                                                ? 'bg-orange-100 text-orange-600'
                                                : message.senderId === 'bot'
                                                    ? 'bg-purple-100 text-purple-600'
                                                    : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                {message.senderType === 'user'
                                                    ? <User size={16} />
                                                    : message.senderId === 'bot'
                                                        ? <Sparkles size={16} />
                                                        : <Bot size={16} />
                                                }
                                            </div>
                                            <div>
                                                {message.senderId === 'bot' && (
                                                    <span className="text-[10px] text-purple-500 font-medium ml-1 mb-0.5 block">🤖 AI Trợ lý</span>
                                                )}
                                                <div className={`px-4 py-2 rounded-2xl ${message.senderType === 'user'
                                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-br-sm'
                                                    : message.senderId === 'bot'
                                                        ? 'bg-purple-50 text-gray-800 shadow-sm rounded-bl-sm border border-purple-100'
                                                        : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                                                    }`}>
                                                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {isAiTyping && (
                                    <div className="flex justify-start">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                                <Bot size={16} className="text-gray-600" />
                                            </div>
                                            <div className="bg-white px-4 py-3 rounded-2xl shadow-sm">
                                                <div className="flex gap-1">
                                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-4 border-t bg-white flex-shrink-0">
                                {identityError && (
                                    <p className="text-xs text-red-600 mb-2">{identityError}</p>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputMessage}
                                        onChange={(e) => setInputMessage(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        placeholder="Nhập tin nhắn..."
                                        className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                        disabled={isLoading || !roomId || !!identityError}
                                    />
                                    <button
                                        onClick={sendUserMessage}
                                        disabled={!inputMessage.trim() || isLoading || !roomId || !!identityError}
                                        className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                                    >
                                        <Send size={18} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
