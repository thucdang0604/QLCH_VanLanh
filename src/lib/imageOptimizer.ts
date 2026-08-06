export interface WatermarkOptions {
    logoUrl?: string;
    storeName?: string;
}

/**
 * Optimizes an image file: resize + convert to WebP + optional store logo watermark.
 * Uses OffscreenCanvas when available to avoid blocking the main thread.
 * Falls back to main-thread canvas for older browsers.
 */
export async function optimizeImage(
    file: File,
    maxWidth: number,
    maxHeight: number = 1600,
    quality: number = 0.75,
    watermarkOptions?: WatermarkOptions
): Promise<{ file: File; width: number; height: number }> {
    // Only process images
    if (!file.type.startsWith('image/')) {
        throw new Error('File is not an image');
    }

    // Decode image using createImageBitmap (off main-thread decode)
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    // Scale down if exceeds max dimensions
    if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.round(height * ratio);
    }
    if (height > maxHeight) {
        const ratio = maxHeight / height;
        height = maxHeight;
        width = Math.round(width * ratio);
    }

    let blob: Blob;

    if (typeof OffscreenCanvas !== 'undefined') {
        // ✅ Off main-thread: No UI freeze
        const offscreen = new OffscreenCanvas(width, height);
        const ctx = offscreen.getContext('2d');
        if (!ctx) throw new Error('Failed to get OffscreenCanvas context');
        ctx.drawImage(bitmap, 0, 0, width, height);

        if (watermarkOptions) {
            await applyWatermarkToContext(ctx, width, height, watermarkOptions.logoUrl, watermarkOptions.storeName);
        }

        blob = await offscreen.convertToBlob({ type: 'image/webp', quality });
    } else {
        // Fallback: main-thread canvas (Safari < 16.4)
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');
        ctx.drawImage(bitmap, 0, 0, width, height);

        if (watermarkOptions) {
            await applyWatermarkToContext(ctx, width, height, watermarkOptions.logoUrl, watermarkOptions.storeName);
        }

        blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => b ? resolve(b) : reject(new Error('Canvas to Blob conversion failed')),
                'image/webp',
                quality
            );
        });
    }

    bitmap.close(); // Free ImageBitmap memory

    const nameParts = file.name.split('.');
    const nameWithoutExt = nameParts.length > 1 ? nameParts.slice(0, -1).join('.') : file.name;

    const optimizedFile = new File([blob], `${nameWithoutExt}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
    });

    return { file: optimizedFile, width, height };
}

/**
 * Overlay store logo (or store name badge fallback) on bottom-right corner of image canvas.
 */
async function applyWatermarkToContext(
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
    width: number,
    height: number,
    logoUrl?: string,
    storeName: string = 'Văn Lành Service'
) {
    let logoLoaded = false;

    if (logoUrl) {
        try {
            const response = await fetch(logoUrl);
            if (response.ok) {
                const logoBlob = await response.blob();
                const logoBitmap = await createImageBitmap(logoBlob);

                // Watermark size: ~18% of image width
                const targetW = Math.max(60, Math.round(width * 0.18));
                const scale = targetW / logoBitmap.width;
                const targetH = Math.round(logoBitmap.height * scale);

                const margin = Math.max(12, Math.round(width * 0.025));
                const x = width - targetW - margin;
                const y = height - targetH - margin;

                ctx.save();
                // Add soft shadow so logo is clearly visible over any background
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 8;
                ctx.globalAlpha = 0.88;

                ctx.drawImage(logoBitmap, x, y, targetW, targetH);
                ctx.restore();
                logoBitmap.close();
                logoLoaded = true;
            }
        } catch (err) {
            console.warn('Failed to load logo watermark:', err);
        }
    }

    // Fallback: Store name text badge if logo failed to load or is not provided
    if (!logoLoaded && storeName) {
        ctx.save();
        const fontSize = Math.max(13, Math.round(width * 0.022));
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textMetrics = ctx.measureText(storeName);
        const textW = textMetrics.width;

        const padX = 12;
        const padY = 6;
        const badgeW = textW + padX * 2;
        const badgeH = fontSize + padY * 2;

        const margin = Math.max(12, Math.round(width * 0.025));
        const x = width - badgeW - margin;
        const y = height - badgeH - margin;

        // Dark semi-transparent rounded container
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        if ('roundRect' in ctx && typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function') {
            (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, badgeW, badgeH, 6);
        } else {
            (ctx as CanvasRenderingContext2D).rect(x, y, badgeW, badgeH);
        }
        ctx.fill();

        // White store name text
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(storeName, x + padX, y + badgeH / 2);
        ctx.restore();
    }
}
