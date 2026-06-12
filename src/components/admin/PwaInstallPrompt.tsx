'use client';

import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

const INSTALL_DISMISSED_KEY = 'qlch_admin_pwa_install_dismissed_v1';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneMode() {
    if (typeof window === 'undefined') return false;

    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function isIosDevice() {
    if (typeof window === 'undefined') return false;

    return /iPad|iPhone|iPod/.test(window.navigator.userAgent)
        || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

export default function PwaInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isIos, setIsIos] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || isStandaloneMode()) return;

        const dismissed = window.localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
        if (dismissed) return;

        setIsIos(isIosDevice());
        if (isIosDevice()) {
            setIsVisible(true);
        }

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setDeferredPrompt(event as BeforeInstallPromptEvent);
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const dismissPrompt = () => {
        window.localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
        setIsVisible(false);
    };

    const installApp = async () => {
        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        dismissPrompt();
    };

    if (!isVisible) return null;

    return (
        <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-gray-700">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">
                    {isIos && !deferredPrompt ? <Share2 size={18} /> : <Download size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">Dùng như app trên điện thoại</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                        {isIos && !deferredPrompt
                            ? 'Trên iPhone/iPad: bấm Chia sẻ rồi chọn Thêm vào Màn hình chính.'
                            : 'Cài lối tắt để mở admin toàn màn hình, không cần vào thanh địa chỉ trình duyệt.'}
                    </p>
                    {deferredPrompt && (
                        <button
                            type="button"
                            onClick={installApp}
                            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
                        >
                            <Download size={14} />
                            Cài app
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={dismissPrompt}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-700"
                    aria-label="Ẩn gợi ý cài app"
                    title="Ẩn gợi ý"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
