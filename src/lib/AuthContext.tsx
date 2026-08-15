'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getAuthInstance } from './firebase';
import type { CatalogFieldPermissions } from './catalogEditPolicy';

// User type with role
export interface AppUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    phone?: string;
    role: 'admin' | 'customer' | 'staff';
    permissions?: string[];
    catalogFieldPermissions?: CatalogFieldPermissions;
}

interface AuthContextType {
    user: AppUser | null;
    loading: boolean;
    sessionBootstrapReady: boolean;
    rtdbRoleSynced: boolean;
    sessionBootstrapError: string | null;
    retrySessionBootstrap: () => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, displayName: string, phone: string) => Promise<void>;
    logout: () => Promise<void>;
    googleSignIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [shouldInitializeAuth, setShouldInitializeAuth] = useState(false);
    const [sessionBootstrapReady, setSessionBootstrapReady] = useState(false);
    const [rtdbRoleSynced, setRtdbRoleSynced] = useState(false);
    const [sessionBootstrapError, setSessionBootstrapError] = useState<string | null>(null);

    const sessionGenRef = useRef(0);
    const activeAbortControllerRef = useRef<AbortController | null>(null);

    const cancelInFlightRequests = useCallback(() => {
        sessionGenRef.current += 1;
        if (activeAbortControllerRef.current) {
            activeAbortControllerRef.current.abort();
            activeAbortControllerRef.current = null;
        }
    }, []);

    // Determine if we should lazy-load Auth based on pathname or history
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const hasLoggedIn = localStorage.getItem('has_logged_in') === 'true';
            const isAdminRoute = pathname?.startsWith('/admin');
            if (hasLoggedIn || isAdminRoute) {
                setShouldInitializeAuth(true);
            } else {
                setLoading(false); // Fast path for anonymous customers
            }
        }
    }, [pathname]);

    // Fetch user role and data from Firestore
    const fetchUserData = useCallback(async (firebaseUser: User): Promise<AppUser> => {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

        if (userDoc.exists()) {
            const data = userDoc.data();
            return {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: data.displayName || firebaseUser.displayName,
                photoURL: firebaseUser.photoURL,
                phone: data.phone,
                role: data.role || 'customer',
                permissions: data.permissions || [],
                catalogFieldPermissions: data.catalogFieldPermissions || {},
            };
        }

        // If no Firestore doc exists (e.g., first Google sign-in), create one
        const newUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: 'customer',
        };

        await setDoc(doc(db, 'users', firebaseUser.uid), {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            role: 'customer',
            createdAt: serverTimestamp(),
        });

        return newUser;
    }, []);

    const performSessionBootstrap = useCallback(async (firebaseUser: User, gen: number): Promise<boolean> => {
        try {
            const controller = new AbortController();
            activeAbortControllerRef.current = controller;
            const timeout = window.setTimeout(() => controller.abort(), 8000);

            const idToken = await firebaseUser.getIdToken();
            if (sessionGenRef.current !== gen) return false;

            const sessionRes = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
                signal: controller.signal,
            }).finally(() => {
                window.clearTimeout(timeout);
                if (activeAbortControllerRef.current === controller) {
                    activeAbortControllerRef.current = null;
                }
            });

            if (sessionGenRef.current !== gen) return false;
            const payload = await sessionRes.json().catch(() => ({}));
            if (sessionGenRef.current !== gen) return false;
            // A 202 has a valid web session, but its RTDB role projection is
            // still pending. Chat must wait for a confirmed grant.
            setRtdbRoleSynced(sessionRes.ok && payload.rtdbRoleSynced === true);
            return sessionRes.ok;
        } catch {
            if (sessionGenRef.current === gen) setRtdbRoleSynced(false);
            return false;
        }
    }, []);

    // Listen to auth state AND token refresh — lazily load firebase/auth only when needed.
    useEffect(() => {
        if (!shouldInitializeAuth) return;

        let unsubscribe: (() => void) | undefined;
        let isMounted = true;
        let initialAuthResolved = false;

        (async () => {
            try {
                const auth = await getAuthInstance();
                const { onIdTokenChanged } = await import('firebase/auth');

                if (!isMounted) return;

                const localUnsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
                    if (firebaseUser) {
                        const gen = ++sessionGenRef.current;
                        const currentUid = firebaseUser.uid;

                        if (firebaseUser.isAnonymous) {
                            if (isMounted && sessionGenRef.current === gen) {
                                setUser(null);
                                setSessionBootstrapReady(true);
                                setRtdbRoleSynced(false);
                                setSessionBootstrapError(null);
                                setLoading(false);
                            }
                            initialAuthResolved = true;
                            return;
                        }
                        localStorage.setItem('has_logged_in', 'true');

                        if (!initialAuthResolved) {
                            try {
                                const appUser = await fetchUserData(firebaseUser);
                                if (sessionGenRef.current !== gen) return;

                                if (appUser.role === 'admin' || appUser.role === 'staff') {
                                    const bootstrapped = await performSessionBootstrap(firebaseUser, gen);
                                    if (isMounted && sessionGenRef.current === gen && auth.currentUser?.uid === currentUid) {
                                        if (bootstrapped) {
                                            setUser(appUser);
                                            setSessionBootstrapReady(true);
                                            setSessionBootstrapError(null);
                                        } else {
                                            setUser(null);
                                            setSessionBootstrapReady(false);
                                            setSessionBootstrapError('Không thể khởi tạo phiên làm việc trên máy chủ. Vui lòng bấm thử lại.');
                                        }
                                    }
                                } else {
                                    if (isMounted && sessionGenRef.current === gen && auth.currentUser?.uid === currentUid) {
                                        setUser(appUser);
                                        setSessionBootstrapReady(true);
                                        setRtdbRoleSynced(false);
                                        setSessionBootstrapError(null);
                                    }
                                }
                            } catch (error) {
                                console.error('Error fetching user data:', error);
                                if (isMounted && sessionGenRef.current === gen) {
                                    setUser(null);
                                    setSessionBootstrapReady(false);
                                    setRtdbRoleSynced(false);
                                }
                            }
                            if (isMounted && sessionGenRef.current === gen) {
                                setLoading(false);
                            }
                            initialAuthResolved = true;
                        } else {
                            // Token refresh — re-sync session cookie
                            try {
                                const idToken = await firebaseUser.getIdToken();
                                if (sessionGenRef.current !== gen) return;

                                const controller = new AbortController();
                                activeAbortControllerRef.current = controller;
                                const timeout = window.setTimeout(() => controller.abort(), 5000);
                                fetch('/api/auth/session', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ idToken }),
                                    signal: controller.signal,
                                })
                                    .then(async (response) => {
                                        const payload = await response.json().catch(() => ({}));
                                        if (isMounted && sessionGenRef.current === gen) {
                                            setRtdbRoleSynced(response.ok && payload.rtdbRoleSynced === true);
                                        }
                                    })
                                    .catch((error) => console.warn('Session refresh failed:', error))
                                    .finally(() => {
                                        window.clearTimeout(timeout);
                                        if (activeAbortControllerRef.current === controller) {
                                            activeAbortControllerRef.current = null;
                                        }
                                    });
                            } catch (error) {
                                console.warn('Token refresh session sync error:', error);
                            }
                        }
                    } else {
                        cancelInFlightRequests();
                        initialAuthResolved = false;
                        if (isMounted) {
                            setUser(null);
                            setSessionBootstrapReady(true);
                            setRtdbRoleSynced(false);
                            setSessionBootstrapError(null);
                            setLoading(false);
                        }
                    }
                });

                if (!isMounted) {
                    localUnsubscribe();
                } else {
                    unsubscribe = localUnsubscribe;
                }
            } catch (err) {
                console.error("Failed to initialize auth", err);
                if (isMounted) setLoading(false);
            }
        })();

        return () => {
            isMounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [cancelInFlightRequests, fetchUserData, performSessionBootstrap, shouldInitializeAuth]);

    const retrySessionBootstrap = useCallback(async () => {
        const gen = ++sessionGenRef.current;
        setLoading(true);
        setSessionBootstrapError(null);
        try {
            const auth = await getAuthInstance();
            const currentUser = auth.currentUser;
            if (!currentUser || sessionGenRef.current !== gen) {
                setLoading(false);
                return;
            }
            const appUser = await fetchUserData(currentUser);
            if (sessionGenRef.current !== gen) return;

            if (appUser.role === 'admin' || appUser.role === 'staff') {
                const bootstrapped = await performSessionBootstrap(currentUser, gen);
                if (sessionGenRef.current === gen && auth.currentUser?.uid === currentUser.uid) {
                    if (bootstrapped) {
                        setUser(appUser);
                        setSessionBootstrapReady(true);
                        setSessionBootstrapError(null);
                    } else {
                        setUser(null);
                        setSessionBootstrapReady(false);
                        setSessionBootstrapError('Không thể khởi tạo phiên làm việc trên máy chủ. Vui lòng bấm thử lại.');
                    }
                }
            } else {
                if (sessionGenRef.current === gen) {
                    setUser(appUser);
                    setSessionBootstrapReady(true);
                    setSessionBootstrapError(null);
                }
            }
        } catch {
            if (sessionGenRef.current === gen) {
                setSessionBootstrapError('Không thể khởi tạo phiên làm việc. Vui lòng thử lại.');
            }
        } finally {
            if (sessionGenRef.current === gen) {
                setLoading(false);
            }
        }
    }, [fetchUserData, performSessionBootstrap]);

    // Open-Tab Sliding Session Refresh: Active admin/staff tabs automatically
    // refresh the page session cookie every 8 minutes while mounted to prevent
    // 20-minute server-side exp expiration.
    useEffect(() => {
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) return;

        const REFRESH_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes
        const interval = setInterval(async () => {
            try {
                const gen = sessionGenRef.current;
                const auth = await getAuthInstance();
                const currentUser = auth.currentUser;
                if (!currentUser || sessionGenRef.current !== gen) return;

                const idToken = await currentUser.getIdToken();
                if (sessionGenRef.current !== gen) return;

                const controller = new AbortController();
                activeAbortControllerRef.current = controller;
                const timeout = window.setTimeout(() => controller.abort(), 8000);
                const response = await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken }),
                    signal: controller.signal,
                }).finally(() => {
                    window.clearTimeout(timeout);
                    if (activeAbortControllerRef.current === controller) {
                        activeAbortControllerRef.current = null;
                    }
                });
                const payload = await response.json().catch(() => ({}));
                if (sessionGenRef.current === gen) {
                    setRtdbRoleSynced(response.ok && payload.rtdbRoleSynced === true);
                }
            } catch (error) {
                console.warn('Background session refresh failed:', error);
            }
        }, REFRESH_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [user]);

    const triggerAuthInit = useCallback(() => {
        setShouldInitializeAuth(true);
        if (typeof window !== 'undefined') {
            localStorage.setItem('has_logged_in', 'true');
        }
    }, []);

    // Login with email/password
    const login = useCallback(async (email: string, password: string): Promise<void> => {
        triggerAuthInit();
        const auth = await getAuthInstance();
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        await signInWithEmailAndPassword(auth, email, password);
    }, [triggerAuthInit]);

    // Signup with email/password
    const signup = useCallback(async (
        email: string,
        password: string,
        displayName: string,
        phone: string
    ): Promise<void> => {
        triggerAuthInit();
        const auth = await getAuthInstance();
        const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        // Update display name in Firebase Auth
        await updateProfile(firebaseUser, { displayName });

        // Create Firestore document
        await setDoc(doc(db, 'users', firebaseUser.uid), {
            email,
            displayName,
            phone,
            role: 'customer',
            createdAt: serverTimestamp(),
        });
    }, [triggerAuthInit]);

    // Logout
    const logout = useCallback(async (): Promise<void> => {
        cancelInFlightRequests();
        const auth = await getAuthInstance();
        const currentUser = auth.currentUser;
        let serverCleanupFailed = false;

        try {
            const idToken = currentUser ? await currentUser.getIdToken() : null;
            const response = await fetch('/api/auth/session', {
                method: 'DELETE',
                headers: idToken ? { Authorization: 'Bearer ' + idToken } : undefined,
            });
            if (!response.ok) {
                serverCleanupFailed = true;
                console.error('Logout server cleanup failed:', await response.text().catch(() => ''));
            }
        } catch (error) {
            serverCleanupFailed = true;
            console.error('Logout server cleanup failed:', error);
        }

        const { signOut } = await import('firebase/auth');
        await signOut(auth);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('has_logged_in');
        }
        setUser(null);
        setSessionBootstrapReady(true);
        setRtdbRoleSynced(false);
        setSessionBootstrapError(serverCleanupFailed
            ? 'Phiên cục bộ đã đăng xuất nhưng máy chủ chưa xác nhận thu hồi. Vui lòng đăng nhập lại để thử đồng bộ.'
            : null);
    }, [cancelInFlightRequests]);

    // Google Sign In
    const googleSignIn = useCallback(async (): Promise<void> => {
        triggerAuthInit();
        const auth = await getAuthInstance();
        const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    }, [triggerAuthInit]);

    return (
        <AuthContext.Provider value={{ user, loading, sessionBootstrapReady, rtdbRoleSynced, sessionBootstrapError, retrySessionBootstrap, login, signup, logout, googleSignIn }}>
            {children}
        </AuthContext.Provider>
    );
}

// Custom hook to use auth context
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
