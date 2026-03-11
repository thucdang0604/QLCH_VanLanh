'use client';

import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
    className = '',
    variant = 'rectangular',
    width,
    height,
    animation = 'pulse'
}: SkeletonProps) {
    const baseClasses = 'bg-gray-200 dark:bg-gray-700';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg'
    };

    const animationClasses = {
        pulse: 'animate-pulse',
        wave: 'skeleton-wave',
        none: ''
    };

    const style: React.CSSProperties = {
        width: width,
        height: height
    };

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
            style={style}
        />
    );
}

// Product Card Skeleton
export function ProductCardSkeleton() {
    return (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <Skeleton className="w-full h-48" />
            <Skeleton className="w-3/4 h-4" variant="text" />
            <Skeleton className="w-1/2 h-4" variant="text" />
            <div className="flex justify-between items-center pt-2">
                <Skeleton className="w-24 h-6" variant="text" />
                <Skeleton className="w-16 h-4" variant="text" />
            </div>
        </div>
    );
}

// Banner Skeleton
export function BannerSkeleton() {
    return (
        <div className="relative w-full h-80 md:h-96 lg:h-[480px] rounded-2xl overflow-hidden">
            <Skeleton className="w-full h-full" animation="wave" />
        </div>
    );
}

// Service Card Skeleton
export function ServiceCardSkeleton() {
    return (
        <div className="bg-white rounded-xl p-5 flex flex-col items-center space-y-3">
            <Skeleton className="w-16 h-16" variant="circular" />
            <Skeleton className="w-24 h-4" variant="text" />
            <Skeleton className="w-16 h-3" variant="text" />
        </div>
    );
}

// Brand Logo Skeleton
export function BrandLogoSkeleton() {
    return (
        <Skeleton className="w-20 h-12" variant="rectangular" />
    );
}

// Article Card Skeleton
export function ArticleCardSkeleton() {
    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <Skeleton className="w-full h-40" />
            <div className="p-4 space-y-2">
                <Skeleton className="w-full h-5" variant="text" />
                <Skeleton className="w-3/4 h-4" variant="text" />
                <Skeleton className="w-1/4 h-3" variant="text" />
            </div>
        </div>
    );
}

// Table Row Skeleton
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
    return (
        <tr className="border-b">
            {Array.from({ length: columns }).map((_, i) => (
                <td key={i} className="p-4">
                    <Skeleton className="w-full h-4" variant="text" />
                </td>
            ))}
        </tr>
    );
}

// Chat Message Skeleton
export function ChatMessageSkeleton() {
    return (
        <div className="flex gap-3 p-3">
            <Skeleton className="w-10 h-10 flex-shrink-0" variant="circular" />
            <div className="flex-1 space-y-2">
                <Skeleton className="w-24 h-3" variant="text" />
                <Skeleton className="w-full h-16" />
            </div>
        </div>
    );
}
