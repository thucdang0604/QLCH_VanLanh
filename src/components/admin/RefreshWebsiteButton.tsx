'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toastError, toastSuccess } from '@/lib/toast';

export default function RefreshWebsiteButton() {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const response = await fetch('/api/revalidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tags: ['homepage', 'layout', 'products', 'services', 'articles', 'categories', 'config', 'reviews']
                })
            });

            if (!response.ok) {
                throw new Error('Failed to refresh cache');
            }

            toastSuccess('Đã làm mới dữ liệu trang web thành công!');
        } catch (error) {
            console.error('Lỗi khi làm mới website:', error);
            toastError('Có lỗi xảy ra khi làm mới website.');
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 text-sm font-medium rounded-xl transition-colors border ${
                isRefreshing 
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-orange-600 shadow-sm'
            }`}
            title="Làm mới bộ nhớ đệm (Cache) của trang web khách hàng"
        >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="hidden md:inline">Làm mới Website</span>
        </button>
    );
}
