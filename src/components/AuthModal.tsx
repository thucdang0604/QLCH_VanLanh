'use client';

import { useState } from 'react';
import { X, Mail, Lock, User, Phone, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Form states
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');

    const { login, signup, googleSignIn } = useAuth();

    const resetForm = () => {
        setEmail('');
        setPassword('');
        setDisplayName('');
        setPhone('');
        setError('');
    };

    const handleTabChange = (tab: 'login' | 'register') => {
        setActiveTab(tab);
        setError('');
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
            resetForm();
            onClose();
        } catch (err: any) {
            console.error('Login error:', err);
            if (err.code === 'auth/user-not-found') {
                setError('Tài khoản không tồn tại');
            } else if (err.code === 'auth/wrong-password') {
                setError('Mật khẩu không đúng');
            } else if (err.code === 'auth/invalid-email') {
                setError('Email không hợp lệ');
            } else {
                setError('Đăng nhập thất bại. Vui lòng thử lại.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Mật khẩu phải có ít nhất 6 ký tự');
            return;
        }

        setIsLoading(true);

        try {
            await signup(email, password, displayName, phone);
            resetForm();
            onClose();
        } catch (err: any) {
            console.error('Signup error:', err);
            if (err.code === 'auth/email-already-in-use') {
                setError('Email đã được sử dụng');
            } else if (err.code === 'auth/weak-password') {
                setError('Mật khẩu quá yếu');
            } else if (err.code === 'auth/invalid-email') {
                setError('Email không hợp lệ');
            } else {
                setError('Đăng ký thất bại. Vui lòng thử lại.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setIsLoading(true);

        try {
            await googleSignIn();
            onClose();
        } catch (err: any) {
            console.error('Google sign-in error:', err);
            setError('Đăng nhập bằng Google thất bại');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1 text-white/80 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                            <span className="text-white font-bold text-xl">VL</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Smember</h2>
                            <p className="text-white/80 text-sm">Văn Lành Service</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b">
                    <button
                        onClick={() => handleTabChange('login')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'login'
                            ? 'text-orange-600 border-b-2 border-orange-500'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Đăng nhập
                    </button>
                    <button
                        onClick={() => handleTabChange('register')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'register'
                            ? 'text-orange-600 border-b-2 border-orange-500'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Đăng ký
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {activeTab === 'login' ? (
                        <form onSubmit={handleLogin} className="space-y-4">
                            {/* Email */}
                            <div className="relative">
                                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email"
                                    required
                                    className="w-full h-12 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                />
                            </div>

                            {/* Password */}
                            <div className="relative">
                                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mật khẩu"
                                    required
                                    className="w-full h-12 pl-10 pr-12 border rounded-lg focus:border-orange-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {/* Forgot Password */}
                            <div className="text-right">
                                <a href="#" className="text-sm text-orange-600 hover:underline">
                                    Quên mật khẩu?
                                </a>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoading && <Loader2 size={18} className="animate-spin" />}
                                Đăng nhập
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-4">
                            {/* Display Name */}
                            <div className="relative">
                                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="Họ và tên"
                                    required
                                    className="w-full h-12 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                />
                            </div>

                            {/* Phone */}
                            <div className="relative">
                                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Số điện thoại"
                                    required
                                    className="w-full h-12 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                />
                            </div>

                            {/* Email */}
                            <div className="relative">
                                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email"
                                    required
                                    className="w-full h-12 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                />
                            </div>

                            {/* Password */}
                            <div className="relative">
                                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mật khẩu (ít nhất 6 ký tự)"
                                    required
                                    minLength={6}
                                    className="w-full h-12 pl-10 pr-12 border rounded-lg focus:border-orange-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoading && <Loader2 size={18} className="animate-spin" />}
                                Đăng ký
                            </button>
                        </form>
                    )}

                    {/* Divider */}
                    <div className="relative my-6">
                        <hr className="border-gray-200" />
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-sm text-gray-400">
                            hoặc
                        </span>
                    </div>

                    {/* Google Sign In */}
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={isLoading}
                        className="w-full h-12 border-2 border-gray-200 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        Tiếp tục với Google
                    </button>

                    {/* Terms */}
                    <p className="mt-4 text-xs text-gray-500 text-center">
                        Bằng việc đăng ký, bạn đồng ý với{' '}
                        <a href="/policy/terms" className="text-orange-600 hover:underline">
                            Điều khoản sử dụng
                        </a>{' '}
                        và{' '}
                        <a href="/policy/privacy" className="text-orange-600 hover:underline">
                            Chính sách bảo mật
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
