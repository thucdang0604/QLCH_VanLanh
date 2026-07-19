'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useConfig } from '@/lib/ConfigContext';

interface CatalogImageProps {
    src?: string;
    alt: string;
    sizes?: string;
    priority?: boolean;
    unoptimized?: boolean;
    imageClassName?: string;
    logoClassName?: string;
    fallbackClassName?: string;
}

/** Shows a catalog image, or the configured store logo when it is unavailable. */
export default function CatalogImage({
    src,
    alt,
    sizes,
    priority = false,
    unoptimized = false,
    imageClassName = 'object-cover',
    logoClassName = 'h-full w-full object-contain p-4',
    fallbackClassName = 'flex h-full w-full items-center justify-center bg-gray-50 p-4 text-center text-xs font-semibold text-gray-400',
}: CatalogImageProps) {
    const { config } = useConfig();
    const [imageFailed, setImageFailed] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const imageSrc = typeof src === 'string' ? src.trim() : '';
    const logoSrc = typeof config.logoUrl === 'string' ? config.logoUrl.trim() : '';

    useEffect(() => {
        setImageFailed(false);
    }, [imageSrc]);

    useEffect(() => {
        setLogoFailed(false);
    }, [logoSrc]);

    if (imageSrc && !imageFailed) {
        return (
            <Image
                src={imageSrc}
                alt={alt}
                fill
                sizes={sizes}
                priority={priority}
                unoptimized={unoptimized}
                className={imageClassName}
                onError={() => setImageFailed(true)}
            />
        );
    }

    if (logoSrc && !logoFailed) {
        // The logo can come from any configured host, independent of Next Image allowlists.
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={logoSrc} alt={`Logo ${config.siteName || 'cửa hàng'}`} className={logoClassName} onError={() => setLogoFailed(true)} />;
    }

    return (
        <div role="img" aria-label={alt} className={fallbackClassName}>
            {config.siteName || 'Văn Lành Service'}
        </div>
    );
}
