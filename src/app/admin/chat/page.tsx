'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Search,
    Send,
    User,
    Circle,
    MessageSquare,
    Loader2,
    Users,

    ChevronLeft,
    Bot,
    ToggleLeft,
    ToggleRight
} from 'lucide-react';
import { subscribeToRooms, subscribeToMessages, subscribeToRoomInfo, sendMessage, updateRoomInfo, ChatMessage } from '@/lib/realtimedb';

interface ChatRoom {
    odId: string;
    displayName: string;
    email: string | null;
    isGuest: boolean;
    lastMessage: string;
    lastMessageTime: number;
    hasUnread: boolean;
}

export default function AdminChatPage() {
    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileList, setShowMobileList] = useState(true);
    const [botActive, setBotActive] = useState(true);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load all chat rooms
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        subscribeToRooms((roomsMap) => {
            const roomList: ChatRoom[] = Object.entries(roomsMap)
                .map(([roomId, info]) => {
                    return {
                        odId: roomId,
                        displayName: String(info.displayName || 'Khách'),
                        email: info.email ? String(info.email) : null,
                        isGuest: (info.isGuest as boolean) ?? true,
                        lastMessage: String(info.lastMessage || ''),
                        lastMessageTime: Number(info.lastMessageTime || 0),
                        hasUnread: !!(info.hasUnreadAdmin), // Check admin unread
                    };
                })
                .filter(room => room.lastMessage) // Only show rooms with messages
                .sort((a, b) => b.lastMessageTime - a.lastMessageTime);

            setRooms(roomList);
            setLoading(false);
        }).then(fn => { unsubscribe = fn; });

        return () => { if (unsubscribe) unsubscribe(); };
    }, []);

    // Load messages for selected room
    useEffect(() => {
        if (!selectedRoom) {
            setMessages([]);
            return;
        }

        let unsubscribe: (() => void) | undefined;
        subscribeToMessages(selectedRoom, (messageList) => {
            setMessages(messageList);
        }).then(fn => { unsubscribe = fn; });

        // Mark room as read
        updateRoomInfo(selectedRoom, { hasUnreadAdmin: false }).catch(() => {});

        return () => { if (unsubscribe) unsubscribe(); };
    }, [selectedRoom]);

    // Listen to botActive status for selected room
    useEffect(() => {
        if (!selectedRoom) return;
        let unsub: (() => void) | undefined;
        subscribeToRoomInfo(selectedRoom, (info) => {
            setBotActive(info?.botActive !== false); // default true
        }).then(fn => { unsub = fn; });
        return () => { if (unsub) unsub(); };
    }, [selectedRoom]);

    const toggleBot = async () => {
        if (!selectedRoom) return;
        const newVal = !botActive;
        setBotActive(newVal);
        await updateRoomInfo(selectedRoom, { botActive: newVal });
    };

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send message as admin
    const sendAdminMessage = async () => {
        if (!inputMessage.trim() || !selectedRoom) return;

        const messageText = inputMessage.trim();
        setInputMessage('');
        setSendingMessage(true);

        try {
            await sendMessage(selectedRoom, messageText, 'admin', 'admin');
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setSendingMessage(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAdminMessage();
        }
    };

    const selectRoom = (roomId: string) => {
        setSelectedRoom(roomId);
        setShowMobileList(false);
    };

    const formatTime = (timestamp: number) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        // Within last minute
        if (diff < 60000) return 'Vừa xong';
        // Within last hour
        if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
        // Within today
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
        // Within this year
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        }
        return date.toLocaleDateString('vi-VN');
    };

    const selectedRoomData = rooms.find(r => r.odId === selectedRoom);
    const filteredRooms = rooms.filter(room =>
        room.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.odId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const unreadCount = rooms.filter(r => r.hasUnread).length;

    return (
        <div className="h-[calc(100vh-120px)] flex bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Left Sidebar - Conversation List */}
            <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col ${!showMobileList ? 'hidden md:flex' : 'flex'
                }`}>
                {/* Header */}
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="text-orange-500" size={24} />
                            <h2 className="text-xl font-bold text-gray-800">Tin nhắn</h2>
                            {unreadCount > 0 && (
                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Users size={16} />
                            <span>{rooms.length}</span>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm hội thoại..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                    </div>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <Loader2 className="animate-spin text-gray-400" size={24} />
                        </div>
                    ) : filteredRooms.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <MessageSquare size={48} className="mx-auto text-gray-300 mb-3" />
                            <p>Chưa có tin nhắn nào</p>
                        </div>
                    ) : (
                        filteredRooms.map((room) => (
                            <button
                                key={room.odId}
                                onClick={() => selectRoom(room.odId)}
                                className={`w-full p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b ${selectedRoom === room.odId ? 'bg-orange-50' : ''
                                    }`}
                            >
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${room.isGuest ? 'bg-gray-200' : 'bg-orange-100'
                                        }`}>
                                        <User size={20} className={room.isGuest ? 'text-gray-500' : 'text-orange-600'} />
                                    </div>
                                    {room.hasUnread && (
                                        <Circle size={12} className="absolute -top-0.5 -right-0.5 text-red-500 fill-red-500" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`font-medium truncate ${room.hasUnread ? 'text-gray-900' : 'text-gray-700'
                                            }`}>
                                            {room.displayName}
                                        </span>
                                        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                            {formatTime(room.lastMessageTime)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {room.isGuest && (
                                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                                Guest
                                            </span>
                                        )}
                                        <p className={`text-sm truncate ${room.hasUnread ? 'text-gray-800 font-medium' : 'text-gray-500'
                                            }`}>
                                            {room.lastMessage}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel - Chat View */}
            <div className={`flex-1 flex flex-col ${showMobileList ? 'hidden md:flex' : 'flex'
                }`}>
                {!selectedRoom ? (
                    <div className="flex-1 flex items-center justify-center bg-gray-50">
                        <div className="text-center">
                            <MessageSquare size={64} className="mx-auto text-gray-300 mb-4" />
                            <h3 className="text-lg font-medium text-gray-600 mb-2">
                                Chọn một hội thoại
                            </h3>
                            <p className="text-gray-400">
                                Chọn khách hàng từ danh sách bên trái để bắt đầu hỗ trợ
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b bg-white flex items-center gap-3">
                            <button
                                onClick={() => setShowMobileList(true)}
                                className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
                            >
                                <ChevronLeft size={20} />
                            </button>

                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedRoomData?.isGuest ? 'bg-gray-200' : 'bg-orange-100'
                                }`}>
                                <User size={18} className={selectedRoomData?.isGuest ? 'text-gray-500' : 'text-orange-600'} />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-800 truncate">
                                    {selectedRoomData?.displayName || 'Khách'}
                                </h3>
                                <p className="text-xs text-gray-500 truncate">
                                    {selectedRoomData?.email || selectedRoomData?.odId}
                                </p>
                            </div>

                            {/* Bot Toggle */}
                            <button
                                onClick={toggleBot}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${botActive
                                        ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                        : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                                    }`}
                                title={botActive ? 'AI Bot đang bật — click để tắt' : 'AI Bot đang tắt — click để bật'}
                            >
                                <Bot size={14} />
                                {botActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                {botActive ? 'Bot Bật' : 'Bot Tắt'}
                            </button>

                            {selectedRoomData?.isGuest && (
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                                    Khách vãng lai
                                </span>
                            )}
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                            {messages.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <p>Chưa có tin nhắn nào trong hội thoại này</p>
                                </div>
                            ) : (
                                messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`flex ${message.senderType === 'admin' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`flex items-end gap-2 max-w-[70%] ${message.senderType === 'admin' ? 'flex-row-reverse' : ''
                                            }`}>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.senderType === 'admin'
                                                ? 'bg-orange-100 text-orange-600'
                                                : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                <User size={14} />
                                            </div>

                                            <div>
                                                <div className={`px-4 py-2 rounded-2xl ${message.senderType === 'admin'
                                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-br-sm'
                                                    : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                                                    }`}>
                                                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                                </div>
                                                <p className={`text-[10px] text-gray-400 mt-1 ${message.senderType === 'admin' ? 'text-right' : ''
                                                    }`}>
                                                    {formatTime(message.timestamp)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 border-t bg-white">
                            <div className="flex gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={inputMessage}
                                    onChange={(e) => setInputMessage(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Nhập tin nhắn..."
                                    className="flex-1 px-4 py-2.5 border rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    disabled={sendingMessage}
                                />
                                <button
                                    onClick={sendAdminMessage}
                                    disabled={!inputMessage.trim() || sendingMessage}
                                    className="w-11 h-11 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    {sendingMessage ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Send size={18} />
                                    )}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
