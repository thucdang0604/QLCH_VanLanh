'use client';

import Image, { ImageProps } from 'next/image';
import { useState } from 'react';
import { Skeleton } from './Skeleton';

interface LazyImageProps extends Omit<ImageProps, 'onLoad'> {
    fallback?: React.ReactNode;
    wrapperClassName?: string;
    /** Responsive sizes hint - giúp trình duyệt chọn đúng kích thước ảnh tải về */
    sizes?: string;
}

export function LazyImage({
    src,
    alt,
    width,
    height,
    className = '',
    wrapperClassName = '',
    fallback,
    ...props
}: LazyImageProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    return (
        <div className={`relative overflow-hidden ${wrapperClassName}`}>
            {isLoading && !hasError && (
                <div className="absolute inset-0">
                    {fallback || <Skeleton className="w-full h-full" animation="wave" />}
                </div>
            )}

            {hasError ? (
                <div className="flex items-center justify-center w-full h-full bg-gray-100 text-gray-400">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            ) : (
                <Image
                    src={src}
                    alt={alt}
                    width={width}
                    height={height}
                    className={`transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'} ${className}`}
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                        setIsLoading(false);
                        setHasError(true);
                    }}
                    loading={props.priority ? undefined : 'lazy'}
                    sizes={props.sizes || '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'}
                    {...props}
                />
            )}
        </div>
    );
}

// Optimized product thumbnail
export function ProductThumbnail({
    src,
    alt,
    className = '',
}: {
    src: string;
    alt: string;
    className?: string;
}) {
    return (
        <LazyImage
            src={src}
            alt={alt}
            width={300}
            height={300}
            className={`object-cover ${className}`}
            wrapperClassName="aspect-square"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
        />
    );
}

// Banner image with blur placeholder
export function BannerImage({
    src,
    alt,
    priority = false,
}: {
    src: string;
    alt: string;
    priority?: boolean;
}) {
    return (
        <Image
            src={src}
            alt={alt}
            fill
            className="object-cover"
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
        />
    );
}
