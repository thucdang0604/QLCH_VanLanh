'use client';

import { useEffect } from 'react';

/**
 * Khởi tạo Firebase Performance Monitoring trên client.
 * Component này không render UI — chỉ chạy side-effect một lần
 * để SDK tự động thu thập page load, network request traces.
 */
export default function FirebasePerformance() {
    useEffect(() => {
        // Chỉ bật ở production hoặc khi có biến env cho phép
        if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_ENABLE_PERF_DEV) {
            return;
        }

        import('@/lib/firebase').then(({ getPerfInstance }) => {
            getPerfInstance().catch(() => {
                // Firebase Performance init lỗi (ad-blocker, unsupported browser…) — bỏ qua
            });
        });
    }, []);

    return null;
}
