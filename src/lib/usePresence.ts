'use client';

import { useEffect, useRef } from 'react';
import { doc, setDoc, increment } from 'firebase/firestore';
import { db, getRtdbInstance } from './firebase';

export function usePresence() {

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // ── 1. Daily Visitors (Firestore) — runs immediately, lightweight ──
        const trackVisitor = async () => {
            try {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const date = String(now.getDate()).padStart(2, '0');
                const todayStr = `${year}-${month}-${date}`;

                const lastVisitDate = localStorage.getItem('vl_last_visit');

                if (lastVisitDate !== todayStr) {
                    localStorage.setItem('vl_last_visit', todayStr);

                    await setDoc(doc(db, 'analytics', todayStr), {
                        visitors: increment(1)
                    }, { merge: true });
                }
            } catch (err) {
                console.error('Visitor tracking error:', err);
            }
        };

        trackVisitor();

        // ── 2. Online Presence (Realtime Database) — Tạm tắt để tối ưu hiệu suất ──
        // Việc theo dõi online_users bằng RTDB gây ra số lượng lớn kết nối (.lp / WebSockets)
        // làm nghẽn luồng chính và tốn chi phí kết nối đồng thời.
        /*
        let cleanupRtdb: (() => void) | undefined;

        const presenceTimer = setTimeout(async () => {
            try {
                const rtdb = await getRtdbInstance();
                const { ref, onValue, onDisconnect, set, serverTimestamp: rtdbServerTimestamp } = await import('firebase/database');

                const sessionId = Math.random().toString(36).substring(2, 15);
                const userStatusDatabaseRef = ref(rtdb, `/online_users/${sessionId}`);
                const connectedRef = ref(rtdb, '.info/connected');

                const unsubscribeConnected = onValue(connectedRef, (snap) => {
                    if (snap.val() === true) {
                        onDisconnect(userStatusDatabaseRef).remove().then(() => {
                            set(userStatusDatabaseRef, {
                                timestamp: rtdbServerTimestamp()
                            });
                        });
                    }
                });

                cleanupRtdb = () => {
                    unsubscribeConnected();
                    set(userStatusDatabaseRef, null).catch(console.error);
                };
            } catch (err) {
                console.error('Presence setup error:', err);
            }
        }, 3000);
        */

        // Cleanup function
        return () => {
            // clearTimeout(presenceTimer);
            // cleanupRtdb?.();
        };
    }, []);
}
