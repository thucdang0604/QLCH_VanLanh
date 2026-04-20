/**
 * Optimizes an image file: resize + convert to WebP.
 * Uses OffscreenCanvas when available to avoid blocking the main thread.
 * Falls back to main-thread canvas for older browsers.
 */
export async function optimizeImage(
    file: File,
    maxWidth: number,
    maxHeight: number = 1600,
    quality: number = 0.75
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
        blob = await offscreen.convertToBlob({ type: 'image/webp', quality });
    } else {
        // Fallback: main-thread canvas (Safari < 16.4)
        blob = await new Promise<Blob>((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Failed to get canvas context')); return; }
            ctx.drawImage(bitmap, 0, 0, width, height);
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
