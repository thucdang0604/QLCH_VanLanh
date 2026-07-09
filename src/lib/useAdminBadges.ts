'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getCountFromServer, getDocs, limit, query, where, onSnapshot } from 'firebase/firestore';
import { db, getRtdbInstance } from '@/lib/firebase';
import type { FirestoreDateValue } from '@/lib/types';
import { REPAIR_PART_STATUS, REPAIR_STATUS, isRepairPartStatus, isRepairStatus } from '@/lib/repairStatus';

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

const REPAIR_BADGE_DOC_LIMIT = 200;
const ACTIVITY_BADGE_DOC_LIMIT = 20;

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

// Module-level cache for badges to prevent repeated reads on navigation
let lastBadgeFetchTime = 0;
const BADGE_CACHE_TTL_MS = 120_000; // 2 minutes

export function useAdminBadges(userUid?: string, userRole?: string, userPermissions?: string[]) {
    // Helper: check if user has permission (admin always has all)
    const hasPerm = useCallback((perm: string) => {
        return userRole === 'admin' || (userPermissions?.includes(perm) ?? false);
    }, [userRole, userPermissions]);

    const [pendingOrders, setPendingOrders] = useState(0);
    const [pendingAppointments, setPendingAppointments] = useState(0);
    const [unreadChats, setUnreadChats] = useState(0);
    const [pendingReviews, setPendingReviews] = useState(0);
    const [pendingRepairs, setPendingRepairs] = useState(0);
    const [repairDocs, setRepairDocs] = useState<RepairBadgeDoc[]>([]);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    
    const refreshFirestoreBadges = useCallback(async () => {
        const now = Date.now();
        if (now - lastBadgeFetchTime < BADGE_CACHE_TTL_MS && (pendingOrders !== 0 || pendingRepairs !== 0)) {
            // Already cached and populated, skip fetching to save reads
            return;
        }

        const tasks: Promise<void>[] = [];

        if (hasPerm('manage_orders')) {
            tasks.push(
                getCountFromServer(query(collection(db, 'orders'), where('status', '==', 'Pending')))
                    .then(snap => setPendingOrders(snap.data().count))
                    .catch(err => console.error('[Badges] orders count error:', err)),
                getCountFromServer(query(collection(db, 'appointments'), where('status', '==', 'pending')))
                    .then(snap => setPendingAppointments(snap.data().count))
                    .catch(err => console.error('[Badges] appointments count error:', err)),
            );
        } else {
            setPendingOrders(0);
            setPendingAppointments(0);
        }

        if (hasPerm('manage_reviews')) {
            tasks.push(
                getCountFromServer(query(collection(db, 'reviews'), where('status', '==', 'pending')))
                    .then(snap => setPendingReviews(snap.data().count))
                    .catch(err => console.error('[Badges] reviews count error:', err)),
            );
        } else {
            setPendingReviews(0);
        }

        if (hasPerm('manage_repairs')) {
            tasks.push(
                getCountFromServer(query(collection(db, 'repairs'), where('status', '==', REPAIR_STATUS.INTAKE)))
                    .then(snap => setPendingRepairs(snap.data().count))
                    .catch(err => console.error('[Badges] repairs count error:', err)),
                getDocs(query(
                    collection(db, 'repairs'),
                    where('status', 'in', [REPAIR_STATUS.INTAKE, REPAIR_STATUS.PARTS_ORDERED]),
                    limit(REPAIR_BADGE_DOC_LIMIT),
                ))
                    .then(snap => {
                        const docs = snap.docs.map(d => ({
                            id: d.id,
                            status: d.data().status,
                            staff: d.data().staff,
                            parts: d.data().parts,
                        })) as RepairBadgeDoc[];
                        setRepairDocs(docs);
                    })
                    .catch(err => console.error('[Badges] repairs docs error:', err)),
            );
        } else {
            setPendingRepairs(0);
            setRepairDocs([]);
        }

        await Promise.all(tasks);
        lastBadgeFetchTime = Date.now();
    }, [hasPerm]);

    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            if (cancelled) return;
            await refreshFirestoreBadges();
        };

        refresh();
        window.addEventListener('focus', refresh);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', refresh);
        };
    }, [refreshFirestoreBadges]);

    // Firestore badge counts use one-shot aggregation/bounded reads above.
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
                            const unreadInfo = (typeof info === 'object' && info !== null)
                                ? (info as { hasUnread?: unknown; hasUnreadAdmin?: unknown })
                                : {};
                            if (unreadInfo.hasUnread || unreadInfo.hasUnreadAdmin) count++;
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

    // ── 6. Activities (unread) — kept here to consolidate ──
    useEffect(() => {
        if (userRole !== 'admin' && userRole !== 'staff') {
            setActivities([]);
            return;
        }
        let unsub = () => { };
        try {
            const q = query(collection(db, 'activities'), where('read', '==', false), limit(ACTIVITY_BADGE_DOC_LIMIT));
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
        return pendingRepairs;
    }, [pendingRepairs]);

    // ── Computed: technician badge ──
    // For staff: assigned intake tickets + tickets with parts ready in stock.
    // For admin: same logic but for ALL technicians  
    const technicianBadge = useMemo(() => {
        let count = 0;

        for (const d of repairDocs) {
            const isAssignedToMe = !userUid || userRole === 'admin' || d.staff?.assignedTechnician === userUid;
            if (!isAssignedToMe) continue;

            if (isRepairStatus(d.status, REPAIR_STATUS.INTAKE)) {
                count++;
            } else if (isRepairStatus(d.status, REPAIR_STATUS.PARTS_ORDERED)) {
                const hasPartsReady = d.parts?.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK));
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
