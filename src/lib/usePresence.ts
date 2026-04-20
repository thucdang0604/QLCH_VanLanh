'use client';

import { useEffect, useRef } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { doc, setDoc, increment } from 'firebase/firestore';
import { rtdb, db } from './firebase';

export function usePresence() {

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // 1. Online Presence (Realtime Database)
        const sessionId = Math.random().toString(36).substring(2, 15);
        const userStatusDatabaseRef = ref(rtdb, `/online_users/${sessionId}`);
        const connectedRef = ref(rtdb, '.info/connected');

        const unsubscribeConnected = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                // When connected, set up onDisconnect to remove the node
                onDisconnect(userStatusDatabaseRef).remove().then(() => {
                    // Then set the user as online
                    set(userStatusDatabaseRef, {
                        timestamp: rtdbServerTimestamp()
                    });
                });
            }
        });

        // 2. Daily Visitors (Firestore)
        const trackVisitor = async () => {
            try {
                // Determine current local date YYYY-MM-DD
                const now = new Date();
                // To avoid timezone issues, format manually in local timezone
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const date = String(now.getDate()).padStart(2, '0');
                const todayStr = `${year}-${month}-${date}`;

                const lastVisitDate = localStorage.getItem('vl_last_visit');

                if (lastVisitDate !== todayStr) {
                    // Mark as visited today in this browser (cross-tab dedup)
                    localStorage.setItem('vl_last_visit', todayStr);

                    // Increment in Firestore
                    await setDoc(doc(db, 'analytics', todayStr), {
                        visitors: increment(1)
                    }, { merge: true });
                }
            } catch (err) {
                console.error('Visitor tracking error:', err);
            }
        };

        trackVisitor();

        // Cleanup function
        return () => {
            unsubscribeConnected();
            // Remove node immediately if component unmounts
            set(userStatusDatabaseRef, null).catch(console.error);
        };
    }, []);
}
