'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
    id: string;
    name: string;
    image: string;
    price: number;
    originalPrice: number;
    quantity: number;
    color?: string;
    storage?: string;
    stock: number;
}

interface CartContextType {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, quantity: number) => void;
    clearCart: () => void;
    totalItems: number;
    totalAmount: number;
    isDrawerOpen: boolean;
    setIsDrawerOpen: (open: boolean) => void;
}

const CART_STORAGE_KEY = 'vanlanh_cart_items';

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
    const [isMounted, setIsMounted] = useState(false);
    const [items, setItems] = useState<CartItem[]>([]);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Initial load from localStorage
    useEffect(() => {
        setIsMounted(true);
        try {
            const saved = localStorage.getItem(CART_STORAGE_KEY);
            if (saved) {
                setItems(JSON.parse(saved));
            }
        } catch {
            // ignore
        }
    }, []);

    // Persist cart to localStorage whenever items change
    useEffect(() => {
        if (!isMounted) return;
        try {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
        } catch {
            // localStorage might be full or unavailable
        }
    }, [items, isMounted]);

    const addItem = (item: CartItem) => {
        setItems((prev) => {
            const existingItem = prev.find(
                (i) => i.id === item.id && i.color === item.color && i.storage === item.storage
            );
            if (existingItem) {
                return prev.map((i) =>
                    i.id === item.id && i.color === item.color && i.storage === item.storage
                        ? { ...i, quantity: i.quantity + item.quantity }
                        : i
                );
            }
            return [...prev, item];
        });
        // Auto open drawer when adding item
        setIsDrawerOpen(true);
    };

    const removeItem = (id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    };

    const updateQuantity = (id: string, quantity: number) => {
        if (quantity <= 0) {
            removeItem(id);
            return;
        }
        setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, quantity } : item))
        );
    };

    const clearCart = () => {
        setItems([]);
    };

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                items,
                addItem,
                removeItem,
                updateQuantity,
                clearCart,
                totalItems,
                totalAmount,
                isDrawerOpen,
                setIsDrawerOpen,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
