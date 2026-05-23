'use client';

import { useEffect } from 'react';

export function usePresence() {

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // ── 1. Daily Visitors (API Route) ──
        const trackVisitor = async () => {
            try {
                // The API handles all the heavy lifting: 
                // device ID, rate limiting, TTL cookies, and Admin SDK DB writes.
                // We use POST instead of GET to prevent overly aggressive browser/CDN caching.
                await fetch('/api/analytics/visit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (err) {
                console.error('Visitor tracking error:', err);
            }
        };

        // We use a short timeout to defer the tracking slightly so it doesn't 
        // block critical rendering path (hydration).
        const timer = setTimeout(trackVisitor, 2000);

        // ── 2. Online Presence (Realtime Database) — Tạm tắt để tối ưu hiệu suất ──
        // Việc theo dõi online_users bằng RTDB gây ra số lượng lớn kết nối (.lp / WebSockets)
        // làm nghẽn luồng chính và tốn chi phí kết nối đồng thời.

        return () => {
            clearTimeout(timer);
        };
    }, []);
}
