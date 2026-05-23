'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, getRtdbInstance } from '@/lib/firebase';
import type { FirestoreDateValue } from '@/lib/types';

// ── Types ──

export interface AdminBadgeCounts {
    orders: number;
    appointments: number;
    repairs: number;       // Tổng phiếu "Chờ tiếp nhận"
    technician: number;    // Phiếu assigned cho KTV hiện tại cần action
    chats: number;
    reviews: number;
}

export interface ActivityItem {
    id: string;
    type: 'login' | 'order' | 'import' | 'article' | 'other';
    message: string;
    amount?: number;
    read: boolean;
    createdAt: FirestoreDateValue;
}

interface RepairBadgeDoc {
    id: string;
    status: string;
    staff?: {
        assignedTechnician?: string;
        assignedTechnicianName?: string;
    };
    parts?: {
        status: string;
        productName?: string;
    }[];
}

// ── Hook ──

/**
 * Single source of truth for all admin sidebar badge counts.
 * Consolidates all realtime listeners into ONE hook to avoid duplicate reads.
 * Listeners are conditionally enabled based on user permissions to reduce reads.
 * 
 * @param userUid - Current user UID (for KTV badge filtering)
 * @param userRole - Current user role ('admin' | 'staff')
 * @param userPermissions - Array of permission strings for the current user
 */
export function useAdminBadges(userUid?: string, userRole?: string, userPermissions?: string[]) {
    // Helper: check if user has permission (admin always has all)
    const hasPerm = useCallback((perm: string) => {
        return userRole === 'admin' || (userPermissions?.includes(perm) ?? false);
    }, [userRole, userPermissions]);

    const [pendingOrders, setPendingOrders] = useState(0);
    const [pendingAppointments, setPendingAppointments] = useState(0);
    const [unreadChats, setUnreadChats] = useState(0);
    const [pendingReviews, setPendingReviews] = useState(0);
    const [repairDocs, setRepairDocs] = useState<RepairBadgeDoc[]>([]);
    const [activities, setActivities] = useState<ActivityItem[]>([]);

    // ── 1. Orders: status == 'Pending' ──
    useEffect(() => {
        if (!hasPerm('manage_orders')) { setPendingOrders(0); return; }
        const q = query(collection(db, 'orders'), where('status', '==', 'Pending'));
        const unsub = onSnapshot(q,
            (snap) => setPendingOrders(snap.size),
            (err) => console.error('[Badges] orders error:', err)
        );
        return () => unsub();
    }, [hasPerm]);

    // ── 2. Appointments: status == 'pending' ──
    useEffect(() => {
        if (!hasPerm('manage_orders')) { setPendingAppointments(0); return; }
        const q = query(collection(db, 'appointments'), where('status', '==', 'pending'));
        const unsub = onSnapshot(q,
            (snap) => setPendingAppointments(snap.size),
            (err) => console.error('[Badges] appointments error:', err)
        );
        return () => unsub();
    }, [hasPerm]);

    // ── 3. Chats: Realtime DB — info.hasUnread ──
    useEffect(() => {
        if (!hasPerm('chat_support')) { setUnreadChats(0); return; }
        let unsub: (() => void) | undefined;
        let isMounted = true;

        (async () => {
            try {
                const rtdb = await getRtdbInstance();
                const { ref, onValue } = await import('firebase/database');

                if (!isMounted) return;

                const chatsRef = ref(rtdb, 'chats');
                unsub = onValue(chatsRef, (snapshot) => {
                    const data = snapshot.val() as unknown;
                    if (!data) { setUnreadChats(0); return; }
                    let count = 0;
                    if (typeof data === 'object' && data !== null) {
                        Object.values(data as Record<string, unknown>).forEach((room) => {
                            const info = (typeof room === 'object' && room !== null) ? (room as { info?: unknown }).info : undefined;
                            const hasUnread = (typeof info === 'object' && info !== null) ? (info as { hasUnread?: unknown }).hasUnread : undefined;
                            if (hasUnread) count++;
                        });
                    }
                    setUnreadChats(count);
                }, (err) => console.error('[Badges] chats error:', err));
            } catch (err) {
                console.error('[Badges] chats setup error:', err);
            }
        })();

        return () => {
            isMounted = false;
            if (unsub) unsub();
        };
    }, [hasPerm]);

    // ── 4. Repairs: cho_tiep_nhan + da_dat_linh_kien (for badge and KTV logic) ──
    // Query repairs with status in the 2 relevant statuses only — keeps reads minimal
    useEffect(() => {
        if (!hasPerm('manage_repairs')) { setRepairDocs([]); return; }
        const q = query(
            collection(db, 'repairs'),
            where('status', 'in', ['cho_tiep_nhan', 'da_dat_linh_kien'])
        );
        const unsub = onSnapshot(q,
            (snap) => {
                const docs = snap.docs.map(d => ({
                    id: d.id,
                    status: d.data().status,
                    staff: d.data().staff,
                    parts: d.data().parts,
                })) as RepairBadgeDoc[];
                setRepairDocs(docs);
            },
            (err) => console.error('[Badges] repairs error:', err)
        );
        return () => unsub();
    }, [hasPerm]);

    // ── 5. Reviews: status == 'pending' (admin only) ──
    useEffect(() => {
        if (userRole !== 'admin') {
            setPendingReviews(0);
            return;
        }
        const q = query(collection(db, 'reviews'), where('status', '==', 'pending'));
        const unsub = onSnapshot(q,
            (snap) => setPendingReviews(snap.size),
            (err) => console.error('[Badges] reviews error:', err)
        );
        return () => unsub();
    }, [userRole]);

    // ── 6. Activities (unread) — kept here to consolidate ──
    useEffect(() => {
        if (userRole !== 'admin' && userRole !== 'staff') {
            setActivities([]);
            return;
        }
        let unsub = () => { };
        try {
            const q = query(collection(db, 'activities'), where('read', '==', false));
            unsub = onSnapshot(q, (snap) => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ActivityItem[];
                const toMillis = (v: unknown): number => {
                    if (!v) return 0;
                    if (typeof v === 'object' && v !== null) {
                        if ('toMillis' in v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
                            return (v as { toMillis: () => number }).toMillis();
                        }
                        if ('toDate' in v && typeof (v as { toDate?: unknown }).toDate === 'function') {
                            return (v as { toDate: () => Date }).toDate().getTime();
                        }
                    }
                    if (v instanceof Date) return v.getTime();
                    if (typeof v === 'number') return v;
                    const d = new Date(v as never);
                    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
                };
                data.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
                setActivities(data);
            }, () => {
                // Silently ignore — collection may not exist or permissions not set
                setActivities([]);
            });
        } catch {
            // Ignore setup errors
        }
        return () => unsub();
    }, [userRole]);

    // ── Computed: repairs badge (all "Chờ tiếp nhận") ──
    const repairsBadge = useMemo(() => {
        return repairDocs.filter(d => d.status === 'cho_tiep_nhan').length;
    }, [repairDocs]);

    // ── Computed: technician badge ──
    // For staff: only their assigned tickets in "cho_tiep_nhan"
    //   + tickets in "da_dat_linh_kien" with at least 1 part status == 'in_stock'
    // For admin: same logic but for ALL technicians  
    const technicianBadge = useMemo(() => {
        let count = 0;

        for (const d of repairDocs) {
            const isAssignedToMe = !userUid || userRole === 'admin' || d.staff?.assignedTechnician === userUid;
            if (!isAssignedToMe) continue;

            if (d.status === 'cho_tiep_nhan') {
                count++;
            } else if (d.status === 'da_dat_linh_kien') {
                // Check if any part has status 'in_stock' → linh kiện đã về
                const hasPartsReady = d.parts?.some(p => p.status === 'in_stock');
                if (hasPartsReady) count++;
            }
        }

        return count;
    }, [repairDocs, userUid, userRole]);

    const badges: AdminBadgeCounts = useMemo(() => ({
        orders: pendingOrders,
        appointments: pendingAppointments,
        repairs: repairsBadge,
        technician: technicianBadge,
        chats: unreadChats,
        reviews: pendingReviews,
    }), [pendingOrders, pendingAppointments, repairsBadge, technicianBadge, unreadChats, pendingReviews]);

    return { badges, activities };
}
