'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { getDoc } from '@/lib/firestoreLogger';
import { db, getAuthInstance } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { Lock, Mail, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { useEffect } from 'react';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { user, loading } = useAuth();
    const router = useRouter();
    const { config } = useConfig();

    // If already logged in as admin/staff, redirect away
    useEffect(() => {
        if (!loading && user && (user.role === 'admin' || user.role === 'staff')) {
            router.replace('/admin');
        }
    }, [user, loading, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Step 1: Sign in with Firebase Auth
            const auth = await getAuthInstance();
            const { signInWithEmailAndPassword } = await import('firebase/auth');
            const cred = await signInWithEmailAndPassword(auth, email, password);

            // Step 2: Fetch role from Firestore
            const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
            const role = userDoc.data()?.role;

            // Step 3: Check role
            if (role === 'admin' || role === 'staff') {
                // ✅ Authorized — redirect to dashboard
                router.push('/admin');
            } else {
                // ❌ Not authorized — sign out immediately and show error
                const { signOut } = await import('firebase/auth');
                await signOut(auth);
                setError('Tài khoản này không có quyền truy cập hệ thống quản trị.');
            }
        } catch (err: unknown) {
            console.error(err);
            const code = (err as { code?: string }).code;
            if (
                code === 'auth/user-not-found' ||
                code === 'auth/wrong-password' ||
                code === 'auth/invalid-credential'
            ) {
                setError('Email hoặc mật khẩu không chính xác.');
            } else {
                setError('Đã xảy ra lỗi. Vui lòng thử lại.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setIsLoading(true);
        try {
            const auth = await getAuthInstance();
            const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
            const provider = new GoogleAuthProvider();
            const cred = await signInWithPopup(auth, provider);

            // Check if user document exists in Firestore
            const userRef = doc(db, 'users', cred.user.uid);
            const userDoc = await getDoc(userRef);

            // If new user → create Firestore document first
            if (!userDoc.exists()) {
                const { setDoc, serverTimestamp } = await import('firebase/firestore');
                await setDoc(userRef, {
                    email: cred.user.email,
                    displayName: cred.user.displayName,
                    role: 'customer',
                    createdAt: serverTimestamp(),
                });
            }

            const role = userDoc.exists() ? userDoc.data()?.role : 'customer';

            if (role === 'admin' || role === 'staff') {
                router.push('/admin');
            } else {
                const { signOut: signOutFn } = await import('firebase/auth');
                await signOutFn(auth);
                setError('Tài khoản Google này không có quyền truy cập hệ thống quản trị. Tài khoản đã được tạo — hãy cấp quyền từ trang quản lý nhân viên.');
            }
        } catch (err: unknown) {
            console.error('Google login error:', err);
            const code = (err as { code?: string }).code;
            if (code !== 'auth/popup-closed-by-user') {
                const message = err instanceof Error ? err.message : 'Vui lòng thử lại.';
                setError(`Đăng nhập Google thất bại: ${message} (${code || 'unknown'})`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Show nothing while checking existing session
    if (loading) return null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
            <ThemeToggle className="absolute right-4 top-4 z-10 h-10 w-10 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
            {/* Background decorations */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Top accent stripe */}
                    <div className="h-1 bg-gradient-to-r from-orange-500 to-red-500" />

                    <div className="p-8 space-y-7">
                        {/* Header */}
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-orange-500/30">
                                <ShieldCheck size={30} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Cổng Quản Trị</h1>
                                <p className="text-gray-400 text-sm mt-1">
                                    {config.siteName || 'Văn Lành'} — Chỉ dành cho nhân viên
                                </p>
                            </div>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl flex items-start gap-3">
                                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Form */}
                        <form onSubmit={handleLogin} className="space-y-5">
                            {/* Email */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-gray-300">
                                    Email
                                </label>
                                <div className="relative">
                                    <Mail
                                        size={18}
                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500"
                                    />
                                    <input
                                        type="email"
                                        required
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all text-sm"
                                        placeholder="admin@vanlanh.com"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-gray-300">
                                    Mật khẩu
                                </label>
                                <div className="relative">
                                    <Lock
                                        size={18}
                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500"
                                    />
                                    <input
                                        type="password"
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all text-sm"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/30 hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Đang kiểm tra...
                                    </>
                                ) : (
                                    'Đăng nhập'
                                )}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="px-3 bg-transparent text-gray-500">Hoặc tiếp tục với</span>
                            </div>
                        </div>

                        {/* Google Sign-In */}
                        <button
                            type="button"
                            onClick={handleGoogleLogin}
                            disabled={isLoading}
                            className="w-full py-3 bg-white/5 border border-white/10 text-gray-300 font-medium rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Đăng nhập với Google
                        </button>

                        {/* Footer note */}
                        <p className="text-center text-xs text-gray-600">
                            Trang này chỉ dành cho nhân viên có thẩm quyền.
                            <br />Mọi hoạt động đăng nhập đều được ghi lại.
                        </p>
                    </div>
                </div>

                {/* Copyright */}
                <p className="text-center text-xs text-gray-600 mt-5">
                    © {new Date().getFullYear()} {config.siteName || 'Văn Lành'}. All rights reserved.
                </p>
            </div>
        </div>
    );
}
