import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Keep this aligned with the core URL bundled by @ffmpeg/ffmpeg 0.12.15.
// A versioned query gives the immutable Hosting cache a safe invalidation key
// when the core changes, while the public CDNs remain failure fallbacks.
const LOCAL_FFMPEG_CORE_VERSION = '0.12.9';
const FFMPEG_CORE_SOURCES = [
    {
        label: 'Firebase Hosting',
        coreUrl: `/ffmpeg/ffmpeg-core.js?v=${LOCAL_FFMPEG_CORE_VERSION}`,
        wasmUrl: `/ffmpeg/ffmpeg-core.wasm?v=${LOCAL_FFMPEG_CORE_VERSION}`,
        // Same-origin assets do not need the to-blob CORS workaround. Keeping
        // the URLs direct also avoids browsers applying connect-src to a
        // generated blob URL when the worker imports the core.
        useBlobUrl: false,
    },
    {
        label: 'jsDelivr',
        coreUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.js',
        wasmUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.wasm',
        useBlobUrl: true,
    },
    {
        label: 'unpkg',
        coreUrl: 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.js',
        wasmUrl: 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.wasm',
        useBlobUrl: true,
    },
] as const;

/** Videos smaller than this threshold AND already MP4 skip compression entirely. */
const SKIP_COMPRESSION_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Abort compression if it takes longer than this (ms). */
const COMPRESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CORE_LOAD_TIMEOUT_MS = 90 * 1000;
const MAX_VIDEO_INPUT_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_VIDEO_OUTPUT_SIZE_BYTES = 200 * 1024 * 1024;
const VIDEO_SCALE_FILTER = "scale=w='if(gt(iw,ih),2*floor(min(1280,iw)/2),-2)':h='if(gt(iw,ih),-2,2*floor(min(1280,ih)/2))'";

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let compressionQueue: Promise<void> = Promise.resolve();

/**
 * Returns `true` when the file is small enough and already in a web-friendly
 * container so that running it through FFmpeg would waste time without a
 * meaningful size or compatibility benefit.
 */
export function shouldSkipCompression(file: File): boolean {
    return file.size <= SKIP_COMPRESSION_MAX_BYTES && file.type === 'video/mp4';
}

/** Pick a CRF value based on the source file size. */
function chooseCrf(fileSize: number): string {
    if (fileSize < 10 * 1024 * 1024) return '23';   // < 10 MB  → keep quality
    if (fileSize < 50 * 1024 * 1024) return '26';   // < 50 MB  → balanced
    return '28';                                      // >= 50 MB → compress hard
}

export class VideoCompressionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VideoCompressionError';
    }
}

function releaseFfmpeg(instance: FFmpeg): void {
    if (ffmpeg === instance) {
        ffmpeg = null;
    }

    try {
        instance.terminate();
    } catch (error) {
        console.warn('Unable to terminate the video compression worker:', error);
    }
}

function toVideoCompressionError(error: unknown, fallback: string): VideoCompressionError {
    if (error instanceof VideoCompressionError) return error;

    const detail = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
    if (detail.includes('memory') || detail.includes('out of')) {
        return new VideoCompressionError('Trình duyệt không đủ bộ nhớ để nén video này. Hãy đóng các tab khác rồi thử lại.');
    }
    if (detail.includes('content security policy') || detail.includes('csp')) {
        return new VideoCompressionError('Chính sách bảo mật của trình duyệt đang chặn bộ nén video. Hãy tải lại trang sau khi hệ thống được cập nhật.');
    }
    if (detail.includes('abort') || detail.includes('timeout')) {
        return new VideoCompressionError('Tải bộ nén video quá lâu. Hãy kiểm tra kết nối mạng rồi thử lại.');
    }
    if (detail.includes('network') || detail.includes('fetch') || detail.includes('load')) {
        return new VideoCompressionError('Không tải được bộ nén video trên trình duyệt. Hãy kiểm tra kết nối mạng rồi thử lại.');
    }
    return new VideoCompressionError(fallback);
}

async function deleteFileQuietly(instance: FFmpeg, path: string | null): Promise<void> {
    if (!path) return;

    try {
        await instance.deleteFile(path);
    } catch {
        // The file may not have been created when the preceding FFmpeg command failed.
    }
}

async function fetchBlobUrl(url: string, contentType: string, signal: AbortSignal): Promise<string> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`FFmpeg core request failed with HTTP ${response.status}`);
    }
    const data = await response.arrayBuffer();
    return URL.createObjectURL(new Blob([data], { type: contentType }));
}

function resolveBrowserUrl(url: string): string {
    if (typeof window === 'undefined') return url;
    return new URL(url, window.location.href).toString();
}

async function loadFfmpegFromSource(source: typeof FFMPEG_CORE_SOURCES[number]): Promise<FFmpeg> {
    const instance = new FFmpeg();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CORE_LOAD_TIMEOUT_MS);
    let coreURL: string | null = null;
    let wasmURL: string | null = null;

    try {
        if (!source.useBlobUrl) {
            await instance.load(
                {
                    // FFmpeg's worker can be a blob URL. Relative URLs are
                    // invalid from that worker, so resolve same-origin core
                    // assets against the current page before handing them to
                    // importScripts/fetch.
                    coreURL: resolveBrowserUrl(source.coreUrl),
                    wasmURL: resolveBrowserUrl(source.wasmUrl),
                },
                { signal: controller.signal },
            );
            return instance;
        }

        const coreUrlPromise = fetchBlobUrl(source.coreUrl, 'text/javascript', controller.signal)
            .then(url => { coreURL = url; return url; });
        const wasmUrlPromise = fetchBlobUrl(source.wasmUrl, 'application/wasm', controller.signal)
            .then(url => { wasmURL = url; return url; });
        [coreURL, wasmURL] = await Promise.all([coreUrlPromise, wasmUrlPromise]);
        await instance.load({ coreURL, wasmURL }, { signal: controller.signal });
        return instance;
    } catch (error) {
        releaseFfmpeg(instance);
        throw error;
    } finally {
        clearTimeout(timeoutId);
        if (coreURL) URL.revokeObjectURL(coreURL);
        if (wasmURL) URL.revokeObjectURL(wasmURL);
    }
}

async function loadFfmpegCore(): Promise<FFmpeg> {
    let lastError: unknown = null;

    for (const source of FFMPEG_CORE_SOURCES) {
        try {
            return await loadFfmpegFromSource(source);
        } catch (error) {
            lastError = error;
            console.warn(`Video compression core failed to load from ${source.label}:`, error);
        }
    }

    throw toVideoCompressionError(lastError, 'Không thể khởi tạo bộ nén video trên trình duyệt.');
}

export const loadFfmpeg = async (): Promise<FFmpeg> => {
    if (ffmpeg) return ffmpeg;
    if (ffmpegLoadPromise) return ffmpegLoadPromise;

    ffmpegLoadPromise = loadFfmpegCore().then(instance => {
        ffmpeg = instance;
        return instance;
    }).finally(() => {
        ffmpegLoadPromise = null;
    });

    return ffmpegLoadPromise;
};

async function compressVideoNow(
    file: File,
    onProgress?: (ratio: number) => void
): Promise<File> {
    let instance: FFmpeg | null = null;
    let inputName: string | null = null;
    let outputName: string | null = null;
    let shouldReleaseInstance = false;
    const progressHandler = ({ progress }: { progress: number; time: number }) => {
        onProgress?.(Math.min(Math.max(progress, 0), 1));
    };

    try {
        instance = await loadFfmpeg();
        instance.on('progress', progressHandler);

        const timestamp = `${Date.now()}_${crypto.randomUUID()}`;
        const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'mp4';
        inputName = `input_${timestamp}.${extension}`;
        outputName = `output_${timestamp}.mp4`;

        await instance.writeFile(inputName, await fetchFile(file));

        // P4: Abort if compression takes longer than the timeout.
        const timeoutId = setTimeout(() => {
            shouldReleaseInstance = true;
            if (instance) releaseFfmpeg(instance);
        }, COMPRESSION_TIMEOUT_MS);

        let exitCode: number;
        try {
            exitCode = await instance.exec([
                '-i', inputName,
                '-vcodec', 'libx264',
                '-crf', chooseCrf(file.size),           // P2: adaptive CRF
                '-preset', 'veryfast',                   // P3: faster encode on WASM
                // Fit either landscape (1280x720) or portrait (720x1280), preserve
                // aspect ratio, never upscale, and keep dimensions codec-friendly.
                '-vf', VIDEO_SCALE_FILTER,
                '-c:a', 'aac',
                '-b:a', '96k',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',                // P0: enable progressive playback
                outputName,
            ]);
        } catch (error) {
            // When the timeout fires it terminates the instance, which causes exec() to reject.
            if (shouldReleaseInstance) {
                throw new VideoCompressionError(
                    'Nén video quá lâu (vượt 5 phút). Hãy chọn video ngắn hơn hoặc nhỏ hơn.'
                );
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
        if (exitCode !== 0) {
            throw new VideoCompressionError('Video có định dạng hoặc codec không thể nén trên trình duyệt.');
        }

        const data = await instance.readFile(outputName);
        if (!(data instanceof Uint8Array)) {
            throw new VideoCompressionError('Không đọc được dữ liệu video sau khi nén.');
        }
        if (data.byteLength > MAX_VIDEO_OUTPUT_SIZE_BYTES) {
            throw new VideoCompressionError('Video sau khi nén vẫn vượt quá 200MB. Hãy chọn video ngắn hơn.');
        }

        return new File(
            [data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer],
            `${file.name.replace(/\.[^/.]+$/, '')}_compressed.mp4`,
            { type: 'video/mp4' }
        );
    } catch (error) {
        shouldReleaseInstance = true;
        console.error('Video compression failed:', error);
        throw toVideoCompressionError(error, 'Không thể nén video trên trình duyệt. Vui lòng thử lại.');
    } finally {
        if (instance) {
            instance.off('progress', progressHandler);
            await Promise.all([
                deleteFileQuietly(instance, inputName),
                deleteFileQuietly(instance, outputName),
            ]);
            if (shouldReleaseInstance) {
                releaseFfmpeg(instance);
            }
        }
    }
}

/**
 * Nén video hoàn toàn trên trình duyệt bằng FFmpeg WebAssembly (single-threaded).
 *
 * - Resolution được giới hạn trong khung 1280x720 hoặc 720x1280.
 * - CRF được chọn tự động theo kích thước file gốc (23/26/28).
 * - Preset `veryfast` để tăng tốc trên WASM single-thread.
 * - Output có `faststart` flag để hỗ trợ streaming.
 * - Timeout 5 phút — quá thời gian sẽ tự hủy.
 *
 * Gọi {@link shouldSkipCompression} trước để bỏ qua video nhỏ (<5 MB MP4).
 *
 * Các lượt nén dùng chung một worker được xếp hàng để không ghi đè file trong bộ nhớ ảo.
 */
export const compressVideo = async (
    file: File,
    onProgress?: (ratio: number) => void
): Promise<File> => {
    if (file.size > MAX_VIDEO_INPUT_SIZE_BYTES) {
        throw new VideoCompressionError('Video vượt quá 200MB. Vui lòng chọn file nhỏ hơn.');
    }
    const previousCompression = compressionQueue;
    let releaseQueue: (() => void) | undefined;
    compressionQueue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
    });

    await previousCompression;
    try {
        return await compressVideoNow(file, onProgress);
    } finally {
        releaseQueue?.();
    }
};
