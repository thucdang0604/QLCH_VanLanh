'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
    User,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

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
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user role and data from Firestore
    const fetchUserData = async (firebaseUser: User): Promise<AppUser> => {
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
    };

    // Listen to auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    const appUser = await fetchUserData(firebaseUser);
                    setUser(appUser);
                } catch (error) {
                    console.error('Error fetching user data:', error);
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Login with email/password
    const login = async (email: string, password: string): Promise<void> => {
        await signInWithEmailAndPassword(auth, email, password);
    };

    // Signup with email/password
    const signup = async (
        email: string,
        password: string,
        displayName: string,
        phone: string
    ): Promise<void> => {
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
    };

    // Logout
    const logout = async (): Promise<void> => {
        await signOut(auth);
        setUser(null);
    };

    // Google Sign In
    const googleSignIn = async (): Promise<void> => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    };

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
