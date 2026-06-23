'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig } from '@/lib/ConfigContext';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { normalizeVietnamPhone } from '@/lib/phone';

declare global {
    interface Window {
        recaptchaVerifier?: RecaptchaVerifier | null;
    }
}

function getBountyAuth() {
    const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };
    try {
        return getAuth(getApp('bounty-otp'));
    } catch {
        const app = initializeApp(config, 'bounty-otp');
        return getAuth(app);
    }
}

type MissionStatusMap = Record<string, boolean>;
type ClaimStatus = 'created' | 'already_claimed_unused' | 'already_claimed_used';
type MissionStyle = { icon: string; bg: string; btn: string };

const FIREBASE_AUTH_ERROR_PATTERN = /auth\/[a-z0-9-]+|auth\/error-code:-?\d+/i;
const DEFAULT_MISSION_STYLE: MissionStyle = {
    icon: '★',
    bg: 'bg-gray-100 text-gray-600',
    btn: 'bg-gray-600 hover:bg-gray-700',
};
const MISSION_STYLES: Record<string, MissionStyle> = {
    facebook: { icon: 'f', bg: 'bg-blue-100 text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700' },
    tiktok: { icon: '♪', bg: 'bg-black text-white', btn: 'bg-black hover:bg-gray-800' },
    youtube: { icon: '▶', bg: 'bg-red-100 text-red-600', btn: 'bg-red-600 hover:bg-red-700' },
};

interface BountyPreflightResponse {
    success?: boolean;
    allowedToSendSms?: boolean;
    status?: 'eligible' | 'already_claimed_unused' | 'already_claimed_used';
    code?: string;
    message?: string;
    error?: string;
    phone?: string;
    e164?: string;
}

interface BountyClaimResponse {
    status?: ClaimStatus;
    code?: string;
    message?: string;
    error?: string;
}

function getErrorText(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string') return message;
    }
    return '';
}

function getFirebaseErrorCode(error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'string') return code;
    }
    const message = getErrorText(error);
    const match = message.match(FIREBASE_AUTH_ERROR_PATTERN);
    return match?.[0] || '';
}

function getOtpErrorMessage(error: unknown) {
    const message = getErrorText(error);
    const code = getFirebaseErrorCode(error);
    const source = code || message;
    const lower = source.toLowerCase();
    if (lower.includes('captcha-check-failed')) {
        return 'reCAPTCHA chưa hợp lệ hoặc đã hết hạn. Vui lòng tích lại ô reCAPTCHA rồi thử lại.';
    }
    if (lower.includes('too-many-requests')) {
        return 'Firebase đang tạm giới hạn số điện thoại, IP hoặc thiết bị này do gửi OTP quá nhiều lần. Vui lòng đợi rồi thử lại bằng số thật khác hoặc dùng số test Firebase.';
    }
    if (lower.includes('invalid-app-credential') || lower.includes('error code: 39') || lower.includes('error-code:-39')) {
        return `Firebase từ chối yêu cầu OTP (${code || 'mã -39'}). Thường do reCAPTCHA hết hạn/không hợp lệ hoặc Firebase chống spam sau nhiều lần test. Vui lòng tích lại reCAPTCHA, đợi vài phút rồi thử lại.`;
    }
    if (lower.includes('network-request-failed')) {
        return 'Không kết nối được dịch vụ OTP. Vui lòng kiểm tra mạng hoặc thử lại sau.';
    }
    return message ? `${message}${code ? ` (${code})` : ''}` : 'Không thể gửi mã SMS.';
}

export default function MissionsWidget() {
    const { config } = useConfig();
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<1 | 1.5 | 2 | 3>(1);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [missions, setMissions] = useState<MissionStatusMap>({});
    const [loading, setLoading] = useState(false);
    const [voucherCode, setVoucherCode] = useState('');
    const [claimMessage, setClaimMessage] = useState('');
    const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
    const [claimError, setClaimError] = useState('');
    const [activeMission, setActiveMission] = useState<{ type: string; clickTime: number } | null>(null);
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [bountyToken, setBountyToken] = useState('');
    const [claimInitiated, setClaimInitiated] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [recaptchaResetKey, setRecaptchaResetKey] = useState(0);

    const activeBountyMissions = useMemo(
        () => config.bountyMissions?.filter((mission) => mission.isActive) || [],
        [config.bountyMissions]
    );

    useEffect(() => {
        const savedCode = localStorage.getItem('bounty_code');
        const savedPhone = localStorage.getItem('bounty_phone');
        const token = localStorage.getItem('bounty_token');
        const savedName = localStorage.getItem('bounty_name') || '';

        if (savedCode) {
            setVoucherCode(savedCode);
            setClaimStatus('already_claimed_unused');
            setClaimMessage('Số điện thoại này đã nhận voucher. Bạn có thể dùng lại mã bên dưới.');
            setStep(3);
            return;
        }

        if (savedPhone && token) {
            setPhone(savedPhone);
            setName(savedName);
            setBountyToken(token);
            setStep(2);

            const savedMissions = localStorage.getItem('bounty_missions');
            if (savedMissions) {
                try {
                    setMissions(JSON.parse(savedMissions));
                } catch (e) {
                    console.error('Error parsing bounty_missions:', e);
                }
            }
        }
    }, []);

    useEffect(() => {
        if (Object.keys(missions).length > 0) {
            localStorage.setItem('bounty_missions', JSON.stringify(missions));
        } else {
            localStorage.removeItem('bounty_missions');
        }
    }, [missions]);

    useEffect(() => {
        if (!isOpen || step !== 1) return;

        let active = true;

        const initRecaptcha = async () => {
            try {
                const auth = getBountyAuth();
                await new Promise((resolve) => setTimeout(resolve, 150));
                if (!active) return;

                const container = document.getElementById('recaptcha-container');
                if (!container) return;

                container.innerHTML = '';
                if (window.recaptchaVerifier) {
                    try { window.recaptchaVerifier.clear(); } catch {}
                }
                window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                    size: 'normal',
                    callback: () => {
                        setPhoneError('');
                    },
                    'expired-callback': () => {
                        setPhoneError('reCAPTCHA đã hết hạn. Vui lòng tích lại ô reCAPTCHA.');
                    },
                });
                await window.recaptchaVerifier.render();
            } catch (error) {
                console.error('Lỗi khởi tạo reCAPTCHA v2 Checkbox:', error);
                setPhoneError('Không thể khởi tạo reCAPTCHA. Vui lòng tải lại trang.');
            }
        };

        initRecaptcha();

        return () => {
            active = false;
            if (window.recaptchaVerifier) {
                try { window.recaptchaVerifier.clear(); } catch {}
                window.recaptchaVerifier = null;
            }
        };
    }, [isOpen, step, recaptchaResetKey]);

    const resetIdentity = () => {
        localStorage.removeItem('bounty_code');
        localStorage.removeItem('bounty_missions');
        localStorage.removeItem('bounty_phone');
        localStorage.removeItem('bounty_name');
        localStorage.removeItem('bounty_token');
        setPhone('');
        setName('');
        setOtp('');
        setVoucherCode('');
        setClaimMessage('');
        setClaimStatus(null);
        setMissions({});
        setBountyToken('');
        setConfirmationResult(null);
        setClaimInitiated(false);
        setStep(1);
    };

    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || name.trim().length < 2) {
            setPhoneError('Vui lòng nhập Họ tên (tối thiểu 2 ký tự).');
            return;
        }

        const normalized = normalizeVietnamPhone(phone);
        if (!normalized) {
            setPhoneError('Số điện thoại không hợp lệ.');
            return;
        }

        if (!window.recaptchaVerifier) {
            setPhoneError('reCAPTCHA chưa được khởi tạo. Vui lòng tải lại trang.');
            return;
        }

        setPhoneError('');
        setLoading(true);

        try {
            const preflightRes = await fetch('/api/bounty/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), phone: normalized.local }),
            });
            const preflight = await preflightRes.json() as BountyPreflightResponse;
            if (!preflightRes.ok) {
                throw new Error(preflight.error || 'Không thể kiểm tra trạng thái nhận voucher.');
            }

            if (preflight.status === 'already_claimed_unused') {
                setPhone(normalized.local);
                setVoucherCode(preflight.code || '');
                setClaimStatus('already_claimed_unused');
                setClaimMessage(preflight.message || 'Số điện thoại này đã nhận voucher. Bạn có thể dùng lại mã bên dưới.');
                if (preflight.code) localStorage.setItem('bounty_code', preflight.code);
                setStep(3);
                return;
            }

            if (preflight.status === 'already_claimed_used') {
                setPhone(normalized.local);
                setVoucherCode('');
                setClaimStatus('already_claimed_used');
                setClaimMessage(preflight.message || 'Số điện thoại này đã nhận voucher trước đó.');
                localStorage.removeItem('bounty_code');
                setStep(3);
                return;
            }

            const auth = getBountyAuth();
            const confirmation = await signInWithPhoneNumber(auth, normalized.e164, window.recaptchaVerifier);
            void fetch('/api/bounty/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'record', phone: normalized.local }),
            }).catch((recordError) => {
                console.warn('Không ghi nhận được lượt gửi OTP thành công:', recordError);
            });
            setConfirmationResult(confirmation);
            setPhone(normalized.local);
            setStep(1.5);
        } catch (error) {
            console.error('Lỗi gửi SMS CHI TIẾT:', error);
            if (window.recaptchaVerifier) {
                try { window.recaptchaVerifier.clear(); } catch {}
                window.recaptchaVerifier = null;
            }
            setPhoneError(`Lỗi: ${getOtpErrorMessage(error)}`);
            setStep(1);
            setRecaptchaResetKey((key) => key + 1);
        } finally {
            setLoading(false);
        }
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otp || otp.length < 6) {
            setPhoneError('Mã OTP phải có 6 chữ số.');
            return;
        }

        setLoading(true);
        setPhoneError('');

        try {
            if (!confirmationResult) throw new Error('Chưa gửi OTP');
            const result = await confirmationResult.confirm(otp);
            const token = await result.user.getIdToken();

            // Lưu trạng thái để phục hồi khi refresh (F5)
            localStorage.setItem('bounty_phone', phone.replace(/[^0-9]/g, ''));
            localStorage.setItem('bounty_name', name.trim());
            localStorage.setItem('bounty_token', token);

            setBountyToken(token);
            setStep(2);
        } catch (error) {
            console.error('Xác nhận OTP lỗi:', error);
            setPhoneError('Mã OTP không đúng hoặc đã hết hạn.');
        } finally {
            setLoading(false);
        }
    };

    const doMission = (type: string, url: string) => {
        setActiveMission({ type, clickTime: Date.now() });
        setClaimError('');
        window.open(url, '_blank');
    };

    useEffect(() => {
        if (!activeMission) {
            setSecondsLeft(0);
            return;
        }

        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - activeMission.clickTime) / 1000);
            const left = Math.max(0, 25 - elapsed);
            setSecondsLeft(left);

            if (left === 0) {
                setMissions((prev) => ({ ...prev, [activeMission.type]: true }));
                setClaimError('');
                setActiveMission(null);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [activeMission]);

    useEffect(() => {
        const checkMission = () => {
            if (activeMission && !document.hidden) {
                const elapsed = (Date.now() - activeMission.clickTime) / 1000;
                if (elapsed >= 25) {
                    setMissions((prev) => ({ ...prev, [activeMission.type]: true }));
                    setClaimError('');
                    setActiveMission(null);
                } else {
                    setClaimError(`Bạn cần xem bài viết/video thêm ${Math.ceil(25 - elapsed)} giây nữa. Vui lòng quay lại xem tiếp!`);
                }
            }
        };

        window.addEventListener('focus', checkMission);
        document.addEventListener('visibilitychange', checkMission);
        return () => {
            window.removeEventListener('focus', checkMission);
            document.removeEventListener('visibilitychange', checkMission);
        };
    }, [activeMission]);

    const claimVoucher = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        setClaimError('');

        try {
            if (!bountyToken) throw new Error('Vui lòng xác thực lại bằng SMS.');

            const res = await fetch('/api/bounty/claim', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${bountyToken}`,
                },
                body: JSON.stringify({ name }),
            });
            const data = await res.json() as BountyClaimResponse;

            if (!res.ok) {
                if (data.status === 'already_claimed_used') {
                    setVoucherCode('');
                    setClaimStatus('already_claimed_used');
                    setClaimMessage(data.message || 'Số điện thoại này đã nhận voucher trước đó.');
                    localStorage.removeItem('bounty_code');
                    localStorage.removeItem('bounty_missions');
                    setStep(3);
                    return;
                }
                setClaimError(data.error || data.message || 'Có lỗi xảy ra, vui lòng thử lại.');
                return;
            }

            setVoucherCode(data.code || '');
            setClaimStatus(data.status || 'created');
            setClaimMessage(data.message || 'Mã Voucher của bạn đã sẵn sàng');
            if (data.code) localStorage.setItem('bounty_code', data.code);

            // Dọn dẹp trạng thái tạm thời sau khi nhận voucher thành công
            localStorage.removeItem('bounty_missions');
            localStorage.removeItem('bounty_phone');
            localStorage.removeItem('bounty_name');
            localStorage.removeItem('bounty_token');

            setStep(3);
        } catch (error) {
            setClaimError(getErrorText(error) || 'Không thể kết nối đến máy chủ.');
        } finally {
            setLoading(false);
        }
    }, [bountyToken, loading, name]);

    useEffect(() => {
        if (step === 2 && activeBountyMissions.length > 0 && !claimInitiated) {
            const allDone = activeBountyMissions.every((mission) => missions[mission.id]);
            if (allDone) {
                setClaimInitiated(true);
                claimVoucher();
            }
        }
    }, [missions, step, activeBountyMissions, claimInitiated, claimVoucher]);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-28 left-6 z-50 bg-rose-600 text-white p-4 rounded-full shadow-xl hover:bg-rose-700 transition-transform hover:scale-110 flex items-center justify-center animate-bounce md:bottom-6"
                title="Nhận quà tặng"
            >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path></svg>
            </button>
        );
    }

    return (
        <div className="fixed bottom-28 left-6 z-50 w-80 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col md:bottom-6">
            <div className="bg-gradient-to-r from-rose-500 to-pink-600 p-4 text-white relative">
                <h3 className="font-bold text-lg">🎁 Nhận Voucher {
                    config.bountyRewardType === 'percentage'
                        ? `giảm ${config.bountyRewardValue || 10}%${config.bountyRewardMaxDiscount ? ` (tối đa ${(config.bountyRewardMaxDiscount / 1000).toLocaleString('vi-VN')}K)` : ''}`
                        : `${((config.bountyRewardValue || 50000) / 1000).toLocaleString('vi-VN')}K`
                }</h3>
                <p className="text-sm opacity-90 mt-1">Dành riêng cho khách hàng mới</p>
                <button
                    onClick={() => setIsOpen(false)}
                    aria-label="Đóng"
                    title="Đóng"
                    className="absolute top-4 right-4 text-white/80 hover:text-white"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <div className="p-5">
                {step === 1 && (
                    <form onSubmit={handlePhoneSubmit}>
                        <p className="text-sm text-gray-600 mb-4">Nhập Họ tên và Số điện thoại để nhận mã xác thực (OTP).</p>
                        <input
                            type="text"
                            placeholder="Họ và tên của bạn"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-shadow mb-3"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                        <input
                            type="tel"
                            placeholder="Số điện thoại. Ví dụ: 0912345678"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-shadow mb-2"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                        />
                        {phoneError && <p className="text-red-500 text-xs mb-3">{phoneError}</p>}
                        <div id="recaptcha-container" className="my-3 flex justify-center min-h-[78px]"></div>
                        <button disabled={loading} type="submit" className="w-full bg-rose-600 text-white py-2.5 rounded-lg font-medium hover:bg-rose-700 transition-colors mt-2 disabled:opacity-50">
                            {loading ? 'Đang gửi...' : 'Nhận mã OTP'}
                        </button>
                    </form>
                )}

                {step === 1.5 && (
                    <form onSubmit={handleOtpSubmit}>
                        <p className="text-sm text-gray-600 mb-4">Mã OTP đã được gửi đến số <strong className="text-gray-900">{phone}</strong>. Vui lòng kiểm tra SMS.</p>
                        <input
                            type="text"
                            placeholder="Mã gồm 6 chữ số"
                            maxLength={6}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-shadow mb-2 text-center tracking-widest font-mono text-lg"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                        />
                        {phoneError && <p className="text-red-500 text-xs mb-3 text-center">{phoneError}</p>}
                        <div className="flex gap-2 mt-2">
                            <button
                                type="button"
                                onClick={resetIdentity}
                                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium"
                            >
                                Đổi số
                            </button>
                            <button disabled={loading} type="submit" className="flex-1 bg-rose-600 text-white py-2.5 rounded-lg font-medium hover:bg-rose-700 transition-colors disabled:opacity-50">
                                {loading ? 'Xác thực...' : 'Xác thực OTP'}
                            </button>
                        </div>
                    </form>
                )}

                {step === 2 && (
                    <div>
                        <p className="text-sm text-gray-600 mb-4">Hoàn thành các bước sau để nhận mã ngay lập tức!</p>

                        <div className="space-y-3">
                            {activeBountyMissions.length === 0 ? (
                                <div className="text-center py-4">
                                    <p className="text-sm text-gray-500 mb-3">Hiện tại không có nhiệm vụ nào.</p>
                                    <button
                                        type="button"
                                        onClick={claimVoucher}
                                        disabled={loading}
                                        className="text-xs bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-rose-700 transition-colors disabled:opacity-50"
                                    >
                                        Nhận mã
                                    </button>
                                </div>
                            ) : (
                                activeBountyMissions.map((mission) => {
                                    const style = MISSION_STYLES[mission.id] || DEFAULT_MISSION_STYLE;
                                    const isDone = missions[mission.id];
                                    const isDoing = activeMission?.type === mission.id;

                                    return (
                                        <div key={mission.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${style.bg}`}>{style.icon}</div>
                                                <span className="text-sm font-medium text-gray-700 capitalize">Truy cập {mission.id}</span>
                                            </div>
                                            {isDone ? (
                                                <span className="text-green-500 font-bold text-sm">✓ Xong</span>
                                            ) : (
                                                <button
                                                    onClick={() => doMission(mission.id, mission.url)}
                                                    className={`text-xs text-white px-3 py-1.5 rounded-md font-medium transition-colors ${isDoing ? 'bg-orange-500 hover:bg-orange-600' : style.btn}`}
                                                >
                                                    {isDoing ? `Còn ${secondsLeft}s` : 'Thực hiện'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {loading && (
                            <p className="text-sm text-center text-rose-600 font-medium mt-4 animate-pulse">Đang tạo mã...</p>
                        )}
                        {claimError && (
                            <div className="text-center mt-4">
                                <p className="text-sm text-red-500 font-medium mb-2">{claimError}</p>
                                <button
                                    type="button"
                                    onClick={claimVoucher}
                                    className="text-xs bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-rose-700 transition-colors"
                                >
                                    Thử lại
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {step === 3 && (
                    <div className="text-center">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${claimStatus === 'already_claimed_used' ? 'bg-amber-100' : 'bg-green-100'}`}>
                            <svg className={`w-8 h-8 ${claimStatus === 'already_claimed_used' ? 'text-amber-500' : 'text-green-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h4 className="font-bold text-gray-800 text-lg mb-1">
                            {claimStatus === 'already_claimed_used' ? 'Đã nhận voucher' : 'Thành công!'}
                        </h4>
                        <p className="text-sm text-gray-500 mb-4">{claimMessage || 'Mã Voucher của bạn đã sẵn sàng'}</p>

                        {voucherCode ? (
                            <>
                                <div className="bg-gray-100 p-3 rounded-lg border border-dashed border-gray-300 flex items-center justify-between mb-4">
                                    <span className="font-mono font-bold text-rose-600 text-lg tracking-wider">{voucherCode}</span>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(voucherCode)}
                                        className="text-xs text-gray-500 hover:text-gray-700 flex flex-col items-center"
                                    >
                                        <svg className="w-4 h-4 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        Copy
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500">Nhập mã này ở bước Thanh toán cùng với Số điện thoại đã nhận voucher.</p>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={resetIdentity}
                                className="text-xs bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                            >
                                Nhập số khác
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
