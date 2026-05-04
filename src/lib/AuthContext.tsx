'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getAuthInstance } from './firebase';

// User type with role
export interface AppUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    phone?: string;
    role: 'admin' | 'customer' | 'staff';
    permissions?: string[];
}

interface AuthContextType {
    user: AppUser | null;
    loading: boolean;
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

    // Listen to auth state changes — lazily load firebase/auth only when needed
    useEffect(() => {
        if (!shouldInitializeAuth) return;

        let unsubscribe: (() => void) | undefined;
        let isMounted = true;

        (async () => {
            try {
                const auth = await getAuthInstance();
                const { onAuthStateChanged } = await import('firebase/auth');

                if (!isMounted) return;

                unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                    if (firebaseUser) {
                        localStorage.setItem('has_logged_in', 'true');
                        try {
                            const appUser = await fetchUserData(firebaseUser);
                            if (isMounted) setUser(appUser);
                        } catch (error) {
                            console.error('Error fetching user data:', error);
                            if (isMounted) setUser(null);
                        }
                    } else {
                        if (isMounted) setUser(null);
                    }
                    if (isMounted) setLoading(false);
                });
            } catch (err) {
                console.error("Failed to initialize auth", err);
                if (isMounted) setLoading(false);
            }
        })();

        return () => {
            isMounted = false;
            unsubscribe?.();
        };
    }, [fetchUserData, shouldInitializeAuth]);

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
    }, []);

    // Logout
    const logout = useCallback(async (): Promise<void> => {
        const auth = await getAuthInstance();
        const { signOut } = await import('firebase/auth');
        await signOut(auth);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('has_logged_in');
        }
        setUser(null);
    }, []);

    // Google Sign In
    const googleSignIn = useCallback(async (): Promise<void> => {
        triggerAuthInit();
        const auth = await getAuthInstance();
        const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    }, [triggerAuthInit]);

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout, googleSignIn }}>
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
