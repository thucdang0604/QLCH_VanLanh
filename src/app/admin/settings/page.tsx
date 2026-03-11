'use client';

import { useState, useEffect } from 'react';
import { useConfig, DEFAULT_CONFIG, type ContactInfo } from '@/lib/ConfigContext';
import { Save, RotateCcw, Loader2, Store, Phone, Mail, MapPin, Facebook, MessageCircle, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
    const { config, updateConfig, loading } = useConfig();
    const [formData, setFormData] = useState<ContactInfo>(DEFAULT_CONFIG.contact_info);
    const [shopName, setShopName] = useState('');
    const [topBarText, setTopBarText] = useState('');
    const [saving, setSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Sync state with config when loaded
    useEffect(() => {
        if (!loading) {
            if (config.contact_info) setFormData(config.contact_info);
            setShopName(config.siteName || 'Văn Lành Repair Center');
            setTopBarText(config.topBarText || '');
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
            await updateConfig({
                contact_info: formData,
                siteName: shopName,
                topBarText: topBarText
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
            const res = await fetch('/api/seed-config', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: 'Đã khôi phục cài đặt gốc!' });
                // ConfigContext listens to Firestore, so it should auto-update
            } else {
                throw new Error(data.error);
            }
        } catch (error: any) {
            console.error('Seed error:', error);
            setMessage({ type: 'error', text: `Lỗi: ${error.message}` });
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

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            setFormData(config.contact_info || DEFAULT_CONFIG.contact_info);
                            setShopName(config.siteName || '');
                            setTopBarText(config.topBarText || '');
                        }}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        Hủy thay đổi
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 shadow-lg shadow-orange-500/30 disabled:opacity-50 transition-all transform active:scale-95"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Lưu cài đặt
                    </button>
                </div>
            </form>
        </div>
    );
}
