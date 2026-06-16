'use client';

import { useState, useEffect } from 'react';
import { useConfig, DEFAULT_CONFIG, type ContactInfo, type GeofenceConfig } from '@/lib/ConfigContext';
import { Save, RotateCcw, Loader2, Store, Phone, Mail, MapPin, Facebook, MessageCircle, CheckCircle2, AlertCircle, ShieldCheck, Navigation, KeyRound } from 'lucide-react';
import { getAuthInstance } from '@/lib/firebase';

import CategoriesTab from './CategoriesTab';
import NavigationTab from './NavigationTab';
import BankIntegrationConfig from '@/components/admin/settings/BankIntegrationConfig';
import ChatIntegrationsTab from '@/components/admin/settings/ChatIntegrationsTab';
import RepairsConfigTab from '@/components/admin/settings/RepairsConfigTab';

export default function SettingsPage() {
    const { config, updateConfig, loading } = useConfig();
    const [activeTab, setActiveTab] = useState<'general' | 'categories' | 'navigation' | 'payment' | 'chat' | 'repairs'>('general');
    const [formData, setFormData] = useState<ContactInfo>(DEFAULT_CONFIG.contact_info);
    const [shopName, setShopName] = useState('');
    const [topBarText, setTopBarText] = useState('');
    const [forbiddenWords, setForbiddenWords] = useState('');
    const [geofence, setGeofence] = useState<GeofenceConfig>(DEFAULT_CONFIG.geofence);
    const [saving, setSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Sync state with config when loaded
    useEffect(() => {
        if (!loading) {
            if (config.contact_info) setFormData(config.contact_info);
            setShopName(config.siteName || 'Văn Lành Repair Center');
            setTopBarText(config.topBarText || '');
            if (config.forbiddenWords) {
                setForbiddenWords(config.forbiddenWords.join(', '));
            }
            if (config.geofence) {
                setGeofence(config.geofence);
            }
        }
    }, [config, loading]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            const fWords = forbiddenWords.split(',').map(w => w.trim()).filter(Boolean);
            await updateConfig({
                contact_info: formData,
                siteName: shopName,
                topBarText: topBarText,
                forbiddenWords: fWords,
                geofence: geofence,
            });
            setMessage({ type: 'success', text: 'Đã lưu cài đặt thành công!' });
        } catch (error) {
            console.error('Save settings error:', error);
            setMessage({ type: 'error', text: 'Lỗi khi lưu cài đặt. Vui lòng thử lại.' });
        } finally {
            setSaving(false);
        }
    };

    const handleSeed = async () => {
        if (!confirm('Bạn có chắc muốn khôi phục lại cài đặt gốc? Dữ liệu hiện tại sẽ bị ghi đè.')) return;

        setSeeding(true);
        setMessage(null);
        try {
            const auth = await getAuthInstance();
            const user = auth.currentUser;
            if (!user) {
                setMessage({ type: 'error', text: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' });
                setSeeding(false);
                return;
            }
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/seed-config', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${idToken}` },
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: 'Đã khôi phục cài đặt gốc!' });
                // ConfigContext listens to Firestore, so it should auto-update
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('Seed error:', error);
            setMessage({ type: 'error', text: `Lỗi: ${error instanceof Error ? error.message : 'Unknown error'}` });
        } finally {
            setSeeding(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-6 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'general'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Cài đặt chung
                </button>
                <button
                    onClick={() => setActiveTab('categories')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'categories'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Danh mục & Thương hiệu
                </button>
                <button
                    onClick={() => setActiveTab('navigation')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'navigation'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Quản lý Menu
                </button>
                <button
                    onClick={() => setActiveTab('payment')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'payment'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Thanh toán & Ngân hàng
                </button>
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'chat'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Tích hợp Live Chat
                </button>
                <button
                    onClick={() => setActiveTab('repairs')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'repairs'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Workflow Sửa chữa
                </button>
            </div>

            {activeTab === 'general' ? (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Cài đặt chung</h1>
                            <p className="text-gray-500 mt-1">Quản lý thông tin liên hệ và cấu hình toàn trang</p>
                        </div>
                        <button
                            onClick={handleSeed}
                            disabled={seeding || saving}
                            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
                        >
                            {seeding ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                            Khôi phục mặc định
                        </button>
                    </div>

                    {/* Notification */}
                    {message && (
                        <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                            <span>{message.text}</span>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 bg-gray-50 border-b flex items-center gap-2">
                            <Store size={20} className="text-orange-500" />
                            <h3 className="font-semibold text-gray-800">Thông tin cửa hàng</h3>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Shop Name */}
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Store size={16} className="text-gray-400" />
                                    Tên cửa hàng (Site Name)
                                </label>
                                <input
                                    type="text"
                                    value={shopName}
                                    onChange={(e) => setShopName(e.target.value)}
                                    className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium text-lg"
                                    placeholder="Văn Lành Repair Center"
                                />
                                <p className="text-xs text-gray-400">Dùng cho tiêu đề trang (SEO) và tên hiển thị ở tab trình duyệt.</p>
                            </div>



                            {/* Hotline */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Phone size={16} className="text-gray-400" />
                                    Hotline chính
                                </label>
                                <input
                                    type="text"
                                    name="main_phone"
                                    value={formData.main_phone}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder="0932242026"
                                />
                                <p className="text-xs text-gray-400">Số điện thoại hiển thị trên Header và Footer</p>
                            </div>

                            {/* Email */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Mail size={16} className="text-gray-400" />
                                    Email liên hệ
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder="contact@vanlanh.vn"
                                />
                            </div>

                            {/* Address - Full width */}
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <MapPin size={16} className="text-gray-400" />
                                    Địa chỉ trụ sở
                                </label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder="681 Nguyễn Kiệm, Phường 3, Gò Vấp, TP.HCM"
                                />
                            </div>

                            {/* Zalo Link */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <MessageCircle size={16} className="text-blue-500" />
                                    Link Zalo OA
                                </label>
                                <input
                                    type="url"
                                    name="zalo_link"
                                    value={formData.zalo_link}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder="https://zalo.me/..."
                                />
                            </div>

                            {/* Facebook Link */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Facebook size={16} className="text-blue-600" />
                                    Link Fanpage
                                </label>
                                <input
                                    type="url"
                                    name="facebook_link"
                                    value={formData.facebook_link}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder="https://facebook.com/..."
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-b flex items-center gap-2 mt-4">
                            <MessageCircle size={20} className="text-orange-500" />
                            <h3 className="font-semibold text-gray-800">Quản lý bình luận</h3>
                        </div>
                        <div className="p-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 block">
                                    Từ khóa bị cấm (Blacklist)
                                </label>
                                <textarea
                                    value={forbiddenWords}
                                    onChange={(e) => setForbiddenWords(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                    placeholder="Nhập các từ khóa, cách nhau bằng dấu phẩy. Ví dụ: lừa đảo, chửi thề..."
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Các bình luận chứa từ khóa này sẽ tự động bị chuyển sang trạng thái <strong>Chờ duyệt</strong> (Pending) thay vì tự động hiển thị (Approved).
                                </p>
                            </div>
                        </div>

                        {/* ── Geofence Settings ── */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-b flex items-center gap-2">
                            <ShieldCheck size={20} className="text-orange-500" />
                            <h3 className="font-semibold text-gray-800">Xác minh đánh giá (Geofence)</h3>
                        </div>
                        <div className="p-6 space-y-5">
                            {/* Toggle */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-700">Bật xác minh vị trí</p>
                                    <p className="text-xs text-gray-400">Khi bật, khách quét QR phải ở gần cửa hàng hoặc nhập mã PIN mới được đánh giá.</p>
                                </div>
                                <button
                                    type="button"
                                    title="Bật/Tắt xác minh vị trí"
                                    aria-label="Bật/Tắt xác minh vị trí"
                                    onClick={() => setGeofence(g => ({ ...g, enabled: !g.enabled }))}
                                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${geofence.enabled ? 'bg-orange-500' : 'bg-gray-300'
                                        }`}
                                >
                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${geofence.enabled ? 'translate-x-6' : 'translate-x-1'
                                        }`} />
                                </button>
                            </div>

                            {geofence.enabled && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                                <Navigation size={14} className="text-gray-400" />
                                                Vĩ độ (Latitude)
                                            </label>
                                            <input
                                                title="Vĩ độ"
                                                type="number"
                                                step="0.0001"
                                                value={geofence.lat}
                                                onChange={(e) => setGeofence(g => ({ ...g, lat: parseFloat(e.target.value) || 0 }))}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                                <Navigation size={14} className="text-gray-400" />
                                                Kinh độ (Longitude)
                                            </label>
                                            <input
                                                title="Kinh độ"
                                                type="number"
                                                step="0.0001"
                                                value={geofence.lng}
                                                onChange={(e) => setGeofence(g => ({ ...g, lng: parseFloat(e.target.value) || 0 }))}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                                <MapPin size={14} className="text-gray-400" />
                                                Bán kính (mét)
                                            </label>
                                            <input
                                                title="Bán kính"
                                                type="number"
                                                min={50}
                                                max={5000}
                                                value={geofence.radiusMeters}
                                                onChange={(e) => setGeofence(g => ({ ...g, radiusMeters: parseInt(e.target.value) || 500 }))}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        title="Lấy vị trí hiện tại"
                                        onClick={() => {
                                            if (!navigator.geolocation) {
                                                alert('Trình duyệt không hỗ trợ định vị.');
                                                return;
                                            }
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => {
                                                    setGeofence(g => ({
                                                        ...g,
                                                        lat: Math.round(pos.coords.latitude * 10000) / 10000,
                                                        lng: Math.round(pos.coords.longitude * 10000) / 10000,
                                                    }));
                                                    setMessage({ type: 'success', text: 'Đã cập nhật toạ độ từ vị trí hiện tại!' });
                                                },
                                                () => alert('Không thể lấy vị trí. Vui lòng kiểm tra quyền truy cập GPS.'),
                                                { enableHighAccuracy: true }
                                            );
                                        }}
                                        className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium transition-colors"
                                    >
                                        <Navigation size={16} />
                                        Lấy vị trí hiện tại
                                    </button>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                            <KeyRound size={14} className="text-gray-400" />
                                            Mã PIN (fallback khi GPS bị từ chối)
                                        </label>
                                        <input
                                            type="text"
                                            title="Mã PIN"
                                            value={geofence.pin}
                                            onChange={(e) => setGeofence(g => ({ ...g, pin: e.target.value }))}
                                            className="w-full max-w-xs px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono text-lg tracking-widest"
                                            placeholder="2026"
                                            maxLength={8}
                                        />
                                        <p className="text-xs text-gray-400">Nhân viên sẽ cung cấp mã này cho khách khi khách không bật được GPS.</p>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
                            <button
                                type="button"
                                title="Hủy thay đổi"
                                onClick={() => {
                                    setFormData(config.contact_info || DEFAULT_CONFIG.contact_info);
                                    setShopName(config.siteName || '');
                                    setTopBarText(config.topBarText || '');
                                    setForbiddenWords((config.forbiddenWords || []).join(', '));
                                    setGeofence(config.geofence || DEFAULT_CONFIG.geofence);
                                }}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Hủy thay đổi
                            </button>
                            <button
                                type="submit"
                                title="Lưu cài đặt"
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 shadow-lg shadow-orange-500/30 disabled:opacity-50 transition-all transform active:scale-95"
                            >
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                Lưu cài đặt
                            </button>
                        </div>
                    </form>
                </div>
            ) : activeTab === 'categories' ? (
                <CategoriesTab />
            ) : activeTab === 'navigation' ? (
                <NavigationTab />
            ) : activeTab === 'payment' ? (
                <div className="space-y-6">
                    <BankIntegrationConfig />
                </div>
            ) : activeTab === 'chat' ? (
                <ChatIntegrationsTab />
            ) : (
                <RepairsConfigTab />
            )}
        </div>
    );
}
