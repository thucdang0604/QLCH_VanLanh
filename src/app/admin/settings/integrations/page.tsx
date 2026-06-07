'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cable, CheckCircle2, Copy, Facebook, Loader2, MessageCircle, MessageSquarePlus, Plus, Save, ShieldCheck, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthInstance } from '@/lib/firebase';

type PublicIntegrations = {
    facebook: {
        enabled: boolean;
        pageId: string;
        graphVersion: string;
        pageAccessTokenSet: boolean;
        appSecretSet: boolean;
        verifyTokenSet: boolean;
    };
    zalo: {
        enabled: boolean;
        oaId: string;
        oaAccessTokenSet: boolean;
        webhookSecretSet: boolean;
    };
    quickReplies: QuickReplyForm[];
};

type QuickReplyForm = {
    id: string;
    title: string;
    shortcut: string;
    text: string;
    enabled: boolean;
};

type FormState = {
    facebook: {
        enabled: boolean;
        pageId: string;
        graphVersion: string;
        pageAccessToken: string;
        appSecret: string;
        verifyToken: string;
    };
    zalo: {
        enabled: boolean;
        oaId: string;
        oaAccessToken: string;
        webhookSecret: string;
    };
    quickReplies: QuickReplyForm[];
};

const emptyForm: FormState = {
    facebook: {
        enabled: false,
        pageId: '',
        graphVersion: 'v25.0',
        pageAccessToken: '',
        appSecret: '',
        verifyToken: '',
    },
    zalo: {
        enabled: false,
        oaId: '',
        oaAccessToken: '',
        webhookSecret: '',
    },
    quickReplies: [],
};

function randomToken(prefix: string) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export default function ChatIntegrationsPage() {
    const [form, setForm] = useState<FormState>(emptyForm);
    const [status, setStatus] = useState<PublicIntegrations | null>(null);
    const [webhookUrls, setWebhookUrls] = useState({ facebook: '', zalo: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);

    async function getToken() {
        const auth = await getAuthInstance();
        const user = auth.currentUser;
        if (!user) throw new Error('Phiên đăng nhập admin không còn hợp lệ.');
        return await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
    }

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch('/api/admin/chat/integrations', {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Không tải được cấu hình.');

            const config = data.config as PublicIntegrations;
            setStatus(config);
            setWebhookUrls(data.webhookUrls || { facebook: '', zalo: '' });
            setForm({
                facebook: {
                    enabled: config.facebook.enabled,
                    pageId: config.facebook.pageId || '',
                    graphVersion: config.facebook.graphVersion || 'v25.0',
                    pageAccessToken: '',
                    appSecret: '',
                    verifyToken: '',
                },
                zalo: {
                    enabled: config.zalo.enabled,
                    oaId: config.zalo.oaId || '',
                    oaAccessToken: '',
                    webhookSecret: '',
                },
                quickReplies: config.quickReplies || [],
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Không tải được cấu hình.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    async function saveConfig() {
        setSaving(true);
        try {
            const token = await getToken();
            const res = await fetch('/api/admin/chat/integrations', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Không lưu được cấu hình.');
            toast.success('Đã lưu cấu hình tích hợp chat.');
            await loadConfig();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Không lưu được cấu hình.');
        } finally {
            setSaving(false);
        }
    }

    async function testChannel(channel: 'facebook' | 'zalo' | 'rtdb') {
        setTesting(channel);
        try {
            const token = await getToken();
            const res = await fetch('/api/admin/chat/integrations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ channel }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Kiểm tra thất bại.');
            if (data.ok) { toast.success(data.message); } else { toast.warning(data.message); }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Kiểm tra thất bại.');
        } finally {
            setTesting(null);
        }
    }

    async function copy(value: string) {
        await navigator.clipboard.writeText(value);
        toast.success('Đã copy.');
    }

    function addQuickReply() {
        setForm(current => ({
            ...current,
            quickReplies: [
                ...current.quickReplies,
                { id: `reply_${Date.now()}`, title: '', shortcut: '', text: '', enabled: true },
            ],
        }));
    }

    function updateQuickReply(index: number, patch: Partial<QuickReplyForm>) {
        setForm(current => ({
            ...current,
            quickReplies: current.quickReplies.map((reply, replyIndex) => (
                replyIndex === index ? { ...reply, ...patch } : reply
            )),
        }));
    }

    function removeQuickReply(index: number) {
        setForm(current => ({
            ...current,
            quickReplies: current.quickReplies.filter((_, replyIndex) => replyIndex !== index),
        }));
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Cable className="text-orange-500" size={26} />
                        Tích hợp Live Chat
                    </h1>
                    <p className="text-gray-500 mt-1">Quản lý tài khoản Zalo OA và Facebook Page để nhận và phản hồi tin nhắn ngay trong Live Chat.</p>
                </div>
                <button
                    onClick={saveConfig}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Lưu cấu hình
                </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
                Token thật chỉ lưu phía server và không hiển thị lại sau khi lưu. Để đổi tài khoản, dán token mới rồi bấm lưu.
            </div>

            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Facebook size={20} className="text-blue-600" />
                        <h2 className="font-semibold text-gray-900">Facebook Messenger</h2>
                    </div>
                    <button
                        type="button"
                        title="Bật/Tắt Facebook"
                        onClick={() => setForm(p => ({ ...p, facebook: { ...p.facebook, enabled: !p.facebook.enabled } }))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border ${form.facebook.enabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                    >
                        {form.facebook.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        {form.facebook.enabled ? 'Đang bật' : 'Đang tắt'}
                    </button>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <label title="Webhook URL" className="text-sm font-medium text-gray-700">Webhook URL</label>
                        <div className="flex gap-2">
                            <input value={webhookUrls.facebook} readOnly className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 text-sm" />
                            <button onClick={() => copy(webhookUrls.facebook)} className="p-2 border rounded-lg hover:bg-gray-50" title="Copy">
                                <Copy size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label title="Graph API version" className="text-sm font-medium text-gray-700">Graph API version</label>
                        <input
                            value={form.facebook.graphVersion}
                            onChange={e => setForm(p => ({ ...p, facebook: { ...p.facebook, graphVersion: e.target.value } }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            placeholder="v25.0"
                        />
                    </div>
                    <div className="space-y-2">
                        <label title="Facebook Page ID" className="text-sm font-medium text-gray-700">Facebook Page ID</label>
                        <input
                            value={form.facebook.pageId}
                            onChange={e => setForm(p => ({ ...p, facebook: { ...p.facebook, pageId: e.target.value } }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            placeholder="Page ID"
                        />
                    </div>
                    <div className="space-y-2">
                        <label title="Page Access Token" className="text-sm font-medium text-gray-700">Page Access Token {status?.facebook.pageAccessTokenSet && <span className="text-green-600">(đã lưu)</span>}</label>
                        <input
                            type="password"
                            title="Page Access Token"
                            value={form.facebook.pageAccessToken}
                            onChange={e => setForm(p => ({ ...p, facebook: { ...p.facebook, pageAccessToken: e.target.value } }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            placeholder={status?.facebook.pageAccessTokenSet ? 'Để trống để giữ token hiện tại' : 'Dán Page Access Token'}
                        />
                    </div>
                    <div className="space-y-2">
                        <label title="App Secret" className="text-sm font-medium text-gray-700">App Secret {status?.facebook.appSecretSet && <span className="text-green-600">(đã lưu)</span>}</label>
                        <input
                            type="password"
                            title="App Secret"
                            value={form.facebook.appSecret}
                            onChange={e => setForm(p => ({ ...p, facebook: { ...p.facebook, appSecret: e.target.value } }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            placeholder={status?.facebook.appSecretSet ? 'Để trống để giữ secret hiện tại' : 'Dán App Secret'}
                        />
                    </div>
                    <div className="space-y-2">
                        <label title="Webhook Verify Token" className="text-sm font-medium text-gray-700">Webhook Verify Token {status?.facebook.verifyTokenSet && <span className="text-green-600">(đã lưu)</span>}</label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                title="Webhook Verify Token"
                                value={form.facebook.verifyToken}
                                onChange={e => setForm(p => ({ ...p, facebook: { ...p.facebook, verifyToken: e.target.value } }))}
                                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                                placeholder={status?.facebook.verifyTokenSet ? 'Để trống để giữ token hiện tại' : 'Tạo hoặc nhập verify token'}
                            />
                            <button title="Tạo webhook verify token" onClick={() => setForm(p => ({ ...p, facebook: { ...p.facebook, verifyToken: randomToken('fb_verify') } }))} className="px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm">
                                Tạo
                            </button>
                        </div>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <button title="Kiểm tra Facebook" onClick={() => testChannel('facebook')} disabled={testing === 'facebook'} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
                            {testing === 'facebook' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                            Kiểm tra Facebook
                        </button>
                    </div>
                </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageCircle size={20} className="text-sky-600" />
                        <h2 className="font-semibold text-gray-900">Zalo Official Account</h2>
                    </div>
                    <button
                        type="button"
                        title="Bật/Tắt Zalo"
                        onClick={() => setForm(p => ({ ...p, zalo: { ...p.zalo, enabled: !p.zalo.enabled } }))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border ${form.zalo.enabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                    >
                        {form.zalo.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        {form.zalo.enabled ? 'Đang bật' : 'Đang tắt'}
                    </button>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <label title="Webhook URL" className="text-sm font-medium text-gray-700">Webhook URL</label>
                        <div className="flex gap-2">
                            <input title="Webhook URL" value={webhookUrls.zalo} readOnly className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 text-sm" />
                            <button title="Copy" onClick={() => copy(webhookUrls.zalo)} className="p-2 border rounded-lg hover:bg-gray-50">
                                <Copy size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label title="Zalo OA ID" className="text-sm font-medium text-gray-700">Zalo OA ID</label>
                        <input
                            title="Zalo OA ID"
                            value={form.zalo.oaId}
                            onChange={e => setForm(p => ({ ...p, zalo: { ...p.zalo, oaId: e.target.value } }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            placeholder="OA ID"
                        />
                    </div>
                    <div className="space-y-2">
                        <label title="OA Access Token" className="text-sm font-medium text-gray-700">OA Access Token {status?.zalo.oaAccessTokenSet && <span className="text-green-600">(đã lưu)</span>}</label>
                        <input
                            type="password"
                            title="Zalo OA Access Token"
                            value={form.zalo.oaAccessToken}
                            onChange={e => setForm(p => ({ ...p, zalo: { ...p.zalo, oaAccessToken: e.target.value } }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            placeholder={status?.zalo.oaAccessTokenSet ? 'Để trống để giữ token hiện tại' : 'Dán Zalo OA Access Token'}
                        />
                    </div>
                    <div className="space-y-2">
                        <label title="Webhook Secret" className="text-sm font-medium text-gray-700">Webhook Secret {status?.zalo.webhookSecretSet && <span className="text-green-600">(đã lưu)</span>}</label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                title="Zalo Webhook Secret"
                                value={form.zalo.webhookSecret}
                                onChange={e => setForm(p => ({ ...p, zalo: { ...p.zalo, webhookSecret: e.target.value } }))}
                                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                                placeholder={status?.zalo.webhookSecretSet ? 'Để trống để giữ secret hiện tại' : 'Tạo hoặc nhập webhook secret'}
                            />
                            <button title="Tạo webhook secret" onClick={() => setForm(p => ({ ...p, zalo: { ...p.zalo, webhookSecret: randomToken('zalo_hook') } }))} className="px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm">
                                Tạo
                            </button>
                        </div>
                    </div>
                    <div className="md:col-span-2 flex justify-between items-center">
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                            <ShieldCheck size={14} />
                            Nếu Zalo không hỗ trợ header secret trong dashboard, dùng URL webhook kèm `?secret=...`.
                        </div>
                        <button title="Kiểm tra Zalo" onClick={() => testChannel('zalo')} disabled={testing === 'zalo'} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
                            {testing === 'zalo' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                            Kiểm tra Zalo
                        </button>
                    </div>
                </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquarePlus size={20} className="text-orange-600" />
                        <h2 className="font-semibold text-gray-900">Trả lời mẫu</h2>
                    </div>
                    <button
                        type="button"
                        title="Thêm mẫu"
                        onClick={addQuickReply}
                        className="flex items-center gap-1.5 px-3 py-2 border rounded-lg hover:bg-white text-sm"
                    >
                        <Plus size={16} />
                        Thêm mẫu
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {form.quickReplies.length === 0 ? (
                        <p className="text-sm text-gray-500">Chưa có câu trả lời mẫu.</p>
                    ) : form.quickReplies.map((reply, index) => (
                        <div key={reply.id} className="grid gap-3 border-b pb-4 last:border-b-0 last:pb-0 md:grid-cols-[180px_150px_1fr_auto]">
                            <input
                                title="Tên mẫu"
                                value={reply.title}
                                maxLength={60}
                                onChange={event => updateQuickReply(index, { title: event.target.value })}
                                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                placeholder="Tên mẫu"
                            />
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-gray-400">/</span>
                                <input
                                    title="Shortcut"
                                    value={reply.shortcut.replace(/^\//, '')}
                                    maxLength={24}
                                    onChange={event => updateQuickReply(index, { shortcut: event.target.value })}
                                    className="w-full pl-7 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    placeholder="baohanh"
                                />
                            </div>
                            <textarea
                                title="Nội dung gửi cho khách"
                                value={reply.text}
                                maxLength={500}
                                rows={2}
                                onChange={event => updateQuickReply(index, { text: event.target.value })}
                                className="px-3 py-2 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                placeholder="Nội dung gửi cho khách"
                            />
                            <div className="flex items-start gap-2">
                                <button
                                    type="button"
                                    title={reply.enabled ? 'Đang sử dụng' : 'Đã tắt'}
                                    onClick={() => updateQuickReply(index, { enabled: !reply.enabled })}
                                    className={`p-2 rounded-lg border ${reply.enabled ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-50'}`}
                                >
                                    {reply.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                </button>
                                <button
                                    type="button"
                                    title="Xóa mẫu"
                                    onClick={() => removeQuickReply(index)}
                                    className="p-2 rounded-lg border text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
