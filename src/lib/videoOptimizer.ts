import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const loadFfmpeg = async () => {
    if (ffmpeg) return ffmpeg;
    
    ffmpeg = new FFmpeg();
    
    // Sử dụng single-threaded core để tránh yêu cầu COOP/COEP Headers
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    return ffmpeg;
};

/**
 * Nén video ngay trên trình duyệt bằng FFmpeg WebAssembly (Single-threaded)
 * Giúp giảm dung lượng video từ điện thoại/máy ảnh trước khi upload.
 * 
 * @param file File video gốc
 * @param onProgress Hàm callback để cập nhật tiến trình (0 - 1)
 * @returns Promise<File> File video đã nén
 */
export const compressVideo = async (
    file: File,
    onProgress?: (ratio: number) => void
): Promise<File> => {
    try {
        const ff = await loadFfmpeg();
        
        // Lắng nghe tiến trình
        const progressHandler = ({ progress }: { progress: number, time: number }) => {
            if (onProgress) {
                // Đôi khi ffmpeg có thể trả về giá trị progress > 1 hoặc số âm trong một số trường hợp lỗi nhỏ
                const safeProgress = Math.min(Math.max(progress, 0), 1);
                onProgress(safeProgress);
            }
        };

        ff.on('progress', progressHandler);
        
        // Tạo tên file ngẫu nhiên an toàn cho hệ thống file ảo của ffmpeg
        const timestamp = Date.now();
        const ext = file.name.split('.').pop() || 'mp4';
        const inputName = `input_${timestamp}.${ext}`;
        const outputName = `output_${timestamp}.mp4`;
        
        // Đưa file vào hệ thống ảo của FFmpeg
        await ff.writeFile(inputName, await fetchFile(file));
        
        // Chạy lệnh FFmpeg: nén video với CRF 28 (chất lượng vừa đủ, dung lượng thấp)
        // preset: fast -> tăng tốc độ nén
        await ff.exec([
            '-i', inputName,
            '-vcodec', 'libx264',
            '-crf', '28',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            outputName
        ]);
        
        // Đọc file kết quả
        const data = await ff.readFile(outputName);
        
        // Dọn dẹp bộ nhớ ảo
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);
        ff.off('progress', progressHandler);
        
        // Chuyển đổi thành File object (mặc định output là mp4)
        const uint8 = data as Uint8Array;
        return new File([uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer], file.name.replace(/\.[^/.]+$/, "") + '_compressed.mp4', {
            type: 'video/mp4'
        });
        
    } catch (error) {
        console.error("Video compression failed:", error);
        throw error;
    }
};
