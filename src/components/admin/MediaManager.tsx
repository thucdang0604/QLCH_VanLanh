'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, limit } from 'firebase/firestore';
import { db, getStorageInstance } from '@/lib/firebase';
import { X, Upload, Image as ImageIcon, Film, Trash2, Loader2, Check, Search, AlertTriangle } from 'lucide-react';
import type { FirestoreDateValue } from '@/lib/types';
import { optimizeImage } from '@/lib/imageOptimizer';
import { validateImageFile } from '@/lib/validateImage';
import { cleanBrokenMedia } from '@/lib/storage';

const MAX_VIDEO_SIZE_MB = 50;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

export interface MediaItem {
    id: string;
    url: string;
    path: string;
    name: string;
    type: string;
    folder?: string;
    size?: number;
    width?: number;
    height?: number;
    createdAt: FirestoreDateValue;
}

export const MEDIA_FOLDERS = [
    { id: 'general', name: 'Chung' },
    { id: 'products', name: 'Sản phẩm' },
    { id: 'services', name: 'Dịch vụ' },
    { id: 'parts', name: 'Linh kiện' },
    { id: 'articles', name: 'Tin tức' },
    { id: 'reviews', name: 'Đánh giá' },
    { id: 'repairs', name: 'Sửa chữa' },
    { id: 'banners', name: 'Banner' },
    { id: 'frames', name: 'Khung viền' }
];

interface MediaManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (url: string, width?: number, height?: number) => void;
    title?: string;
}

function isVideoType(type: string): boolean {
    return type.includes('video');
}

export default function MediaManager({ isOpen, onClose, onSelect, title = 'Chọn media' }: MediaManagerProps) {
    const [tab, setTab] = useState<'upload' | 'library'>('library');
    const [items, setItems] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selected, setSelected] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [cleaning, setCleaning] = useState(false);
    const [cleanProgress, setCleanProgress] = useState('');
    const [uploadFolder, setUploadFolder] = useState<string>('general');
    const [filterFolder, setFilterFolder] = useState<string>('all');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch media library from Firestore
    useEffect(() => {
        if (!isOpen) return;
        const q = query(collection(db, 'media_library'), orderBy('createdAt', 'desc'), limit(200));
        const unsub = onSnapshot(q, (snap) => {
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MediaItem)));
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, [isOpen]);

    // Upload handler
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadError(null);

        for (const file of Array.from(files)) {
            try {
                // Video size validation
                if (isVideoType(file.type)) {
                    if (file.size > MAX_VIDEO_SIZE_BYTES) {
                        setUploadError(`Video "${file.name}" vượt quá ${MAX_VIDEO_SIZE_MB}MB. Vui lòng chọn file nhỏ hơn.`);
                        continue;
                    }
                }

                let fileToUpload = file;
                let finalWidth = undefined;
                let finalHeight = undefined;
                let thumbFileToUpload: File | undefined = undefined;

                if (file.type.startsWith('image/')) {
                    const validationError = validateImageFile(file);
                    if (validationError) {
                        setUploadError(`"${file.name}": ${validationError}`);
                        continue;
                    }
                    
                    // Xác định cấu hình nén dựa trên thư mục
                    let maxWidth = 1200;
                    let quality = 0.75;
                    
                    switch (uploadFolder) {
                        case 'general': // Logo...
                        case 'articles': // Ảnh bài viết
                        case 'banners': // Banner
                            maxWidth = 960;
                            quality = 0.80; // Giữ chất lượng cao hơn một chút cho banner/bài viết
                            break;
                        case 'products':
                        case 'services':
                        case 'parts':
                            maxWidth = 800; // Đủ nét cho trang chi tiết sản phẩm/dịch vụ
                            quality = 0.75;
                            break;
                        case 'reviews':
                        case 'repairs':
                            maxWidth = 600; // Ảnh feedback hoặc sửa chữa không cần quá to
                            quality = 0.70;
                            break;
                        case 'frames':
                            maxWidth = 1200; // Khung viền cần chất lượng cao và nét
                            quality = 0.80;
                            break;
                        default:
                            maxWidth = 1200;
                            quality = 0.75;
                    }

                    const optimized = await optimizeImage(file, maxWidth, 1600, quality);
                    fileToUpload = optimized.file;
                    finalWidth = optimized.width;
                    finalHeight = optimized.height;
                    
                    // Tạo thêm 1 bản Thumbnail siêu nhỏ (128px, 60% quality) làm phương án dự phòng
                    if (['products', 'services', 'articles', 'parts'].includes(uploadFolder)) {
                        const thumbOpt = await optimizeImage(file, 128, 128, 0.60);
                        thumbFileToUpload = thumbOpt.file;
                    }
                }

                const storage = await getStorageInstance();
                const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                const storagePath = `media/${uploadFolder}/${Date.now()}_${fileToUpload.name}`;
                const storageRef = ref(storage, storagePath);

                await uploadBytes(storageRef, fileToUpload, { 
                    contentType: fileToUpload.type 
                });
                let url = await getDownloadURL(storageRef);
                
                // Upload bản Thumbnail (nếu có)
                if (thumbFileToUpload) {
                    const thumbPath = storagePath.replace(/\.([a-zA-Z0-9]+)$/, '_thumb.$1');
                    const thumbRef = ref(storage, thumbPath);
                    await uploadBytes(thumbRef, thumbFileToUpload, {
                        contentType: thumbFileToUpload.type
                    });
                    url = url + '&hasThumb=true';
                }

                // Save metadata to Firestore
                await addDoc(collection(db, 'media_library'), {
                    url,
                    path: storagePath,
                    name: fileToUpload.name,
                    type: fileToUpload.type,
                    size: fileToUpload.size,
                    folder: uploadFolder,
                    ...(finalWidth !== undefined && { width: finalWidth }),
                    ...(finalHeight !== undefined && { height: finalHeight }),
                    createdAt: serverTimestamp(),
                });
            } catch (err) {
                console.error('Upload error:', err);
                setUploadError(`Lỗi upload "${file.name}". Vui lòng thử lại.`);
            }
        }

        setUploading(false);
        setTab('library');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Delete handler: remove from Storage + Firestore
    const handleDelete = async (item: MediaItem) => {
        if (!confirm(`Xóa "${item.name}"?`)) return;
        setDeleting(item.id);
        try {
            const storage = await getStorageInstance();
            const { ref, deleteObject } = await import('firebase/storage');
            const storageRef = ref(storage, item.path);
            await deleteObject(storageRef).catch(() => { });
            await deleteDoc(doc(db, 'media_library', item.id));
        } catch (err) {
            console.error('Delete error:', err);
        }
        setDeleting(null);
    };

    // Clean broken media entries
    const handleCleanBroken = async () => {
        if (!confirm('Quét toàn bộ thư viện media.\nHệ thống sẽ kiểm tra từng file trên Storage và tự động xoá các bản ghi lỗi (ảnh đã bị mất).\n\nTiếp tục?')) return;
        setCleaning(true);
        setCleanProgress('Đang bắt đầu quét...');
        try {
            const result = await cleanBrokenMedia((checked, total, broken) => {
                setCleanProgress(`Đã kiểm tra ${checked}/${total} file • Phát hiện ${broken} lỗi`);
            });
            if (result.cleaned > 0) {
                setCleanProgress(`✅ Hoàn tất! Đã dọn ${result.cleaned} file rác / ${result.total} tổng cộng.`);
            } else {
                setCleanProgress(`✅ Thư viện sạch! Không có file rác nào. (${result.total} file tốt)`);
            }
            setTimeout(() => setCleanProgress(''), 5000);
        } catch (err) {
            console.error('Clean error:', err);
            setCleanProgress('❌ Có lỗi khi quét. Thử lại sau.');
        } finally {
            setCleaning(false);
        }
    };

    // Select and return
    const handleConfirm = () => {
        if (selected) {
            const selectedItem = items.find(i => i.url === selected);
            onSelect(selected, selectedItem?.width, selectedItem?.height);
            onClose();
            setSelected(null);
        }
    };

    // Filter items
    const filtered = items.filter(i => {
        const matchSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchFolder = filterFolder === 'all' || i.folder === filterFolder;
        return matchSearch && matchFolder;
    });

    const videoCount = items.filter(i => isVideoType(i.type)).length;
    const imageCount = items.length - videoCount;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-in-out]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-lg font-bold text-gray-800">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b px-6">
                    <button
                        onClick={() => setTab('library')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'library' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <ImageIcon size={16} className="inline mr-1.5 -mt-0.5" />
                        Thư viện media ({imageCount} ảnh{videoCount > 0 ? `, ${videoCount} video` : ''})
                    </button>
                    <button
                        onClick={() => { setTab('upload'); setUploadError(null); }}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'upload' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <Upload size={16} className="inline mr-1.5 -mt-0.5" />
                        Upload mới
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {tab === 'upload' ? (
                        /* Upload Tab */
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border">
                                <label className="text-sm font-medium text-gray-700 min-w-max">Lưu vào thư mục:</label>
                                <select 
                                    value={uploadFolder}
                                    onChange={(e) => setUploadFolder(e.target.value)}
                                    className="flex-1 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500"
                                >
                                    {MEDIA_FOLDERS.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/mp4,video/webm"
                                multiple
                                onChange={handleUpload}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="w-full h-48 border-2 border-dashed border-gray-300 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-colors flex flex-col items-center justify-center gap-3 text-gray-500"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 size={32} className="animate-spin text-orange-500" />
                                        <span className="text-sm font-medium">Đang xử lý ảnh & upload...</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={32} />
                                        <span className="text-sm font-medium">Kéo thả hoặc click để chọn file</span>
                                        <span className="text-xs text-gray-400">Hỗ trợ JPG, PNG, WebP • MP4, WebM (Video tối đa {MAX_VIDEO_SIZE_MB}MB)</span>
                                    </>
                                )}
                            </button>

                            {/* Upload warning */}
                            <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-amber-700 font-semibold">Lưu ý quan trọng về Tốc độ & Chi phí:</p>
                                </div>
                                <ul className="text-xs text-amber-700 list-disc pl-6 space-y-1">
                                    <li><strong>Ảnh:</strong> Tự động được hệ thống nén WebP siêu nhẹ khi tải lên. Không cần lo lắng.</li>
                                    <li><strong>Video:</strong> KHÔNG được nén tự động để tránh treo máy. Vui lòng <u>tự nén video</u> bằng <strong>Capcut</strong> hoặc <strong>Handbrake</strong> trước khi tải lên! (Giới hạn: {MAX_VIDEO_SIZE_MB}MB). Video dung lượng cao sẽ làm web rất chậm và tốn phí băng thông.</li>
                                </ul>
                            </div>

                            {/* Upload Error */}
                            {uploadError && (
                                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-red-700">{uploadError}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Library Tab */
                        <div className="space-y-4">
                            {/* Search + Clean + Filter */}
                            <div className="flex items-center gap-2">
                                <select
                                    value={filterFolder}
                                    onChange={(e) => setFilterFolder(e.target.value)}
                                    className="py-2.5 px-3 border rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-orange-400 font-medium text-gray-700"
                                >
                                    <option value="all">Tất cả thư mục</option>
                                    {MEDIA_FOLDERS.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Tìm theo tên file..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-orange-400"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCleanBroken}
                                    disabled={cleaning}
                                    className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                                    title="Quét và tự động xoá các file đã mất trên Storage"
                                >
                                    {cleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    Quét rác
                                </button>
                            </div>
                            {/* Clean progress */}
                            {cleanProgress && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                                    {cleaning && <Loader2 size={12} className="animate-spin flex-shrink-0" />}
                                    <span>{cleanProgress}</span>
                                </div>
                            )}

                            {/* Grid */}
                            {loading ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
                                    ))}
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <ImageIcon size={48} className="mx-auto mb-3 opacity-30" />
                                    <p>Chưa có file nào trong thư viện</p>
                                    <button onClick={() => setTab('upload')} className="mt-2 text-sm text-orange-500 hover:underline">
                                        Upload file đầu tiên →
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                    {filtered.map((item) => (
                                        <div
                                            key={item.id}
                                            className={`relative group aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all data-[broken=true]:cursor-not-allowed data-[broken=true]:border-red-200 data-[broken=true]:bg-gray-50 ${selected === item.url ? 'border-orange-500 ring-2 ring-orange-200' : 'border-transparent hover:border-gray-300'}`}
                                            onClick={(e) => {
                                                if (e.currentTarget.getAttribute('data-broken') === 'true') {
                                                    alert('Ảnh này đã bị xoá trên bộ nhớ gốc (Storage). Vui lòng nhấn biểu tượng 🗑️ thùng rác để dọn dẹp nó khỏi hệ thống.');
                                                    return;
                                                }
                                                setSelected(item.url);
                                            }}
                                        >
                                            {/* Render video or image */}
                                            {isVideoType(item.type) ? (
                                                <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
                                                    <video
                                                        src={item.url}
                                                        className="w-full h-full object-cover"
                                                        muted
                                                        playsInline
                                                        preload="metadata"
                                                        onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => { })}
                                                        onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                                                    />
                                                    {/* Video badge */}
                                                    <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                                        <Film size={10} />
                                                        Video
                                                    </div>
                                                </div>
                                            ) : (
                                                <img
                                                    src={item.url}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover data-[broken=true]:object-contain data-[broken=true]:p-8 data-[broken=true]:opacity-50"
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.onerror = null;
                                                        target.setAttribute('data-broken', 'true');
                                                        target.parentElement?.setAttribute('data-broken', 'true');
                                                        target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3Cline x1='3' y1='3' x2='21' y2='21'/%3E%3C/svg%3E";
                                                    }}
                                                />
                                            )}

                                            {/* Selected check */}
                                            {selected === item.url && (
                                                <div className="absolute top-2 right-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                                                    <Check size={14} className="text-white" />
                                                </div>
                                            )}
                                            {/* Delete button */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                                disabled={deleting === item.id}
                                                className="absolute bottom-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                            >
                                                {deleting === item.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                            </button>
                                            {/* Name tooltip */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                                {item.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
                    <span className="text-xs text-gray-400">
                        {selected ? '1 file đã chọn' : 'Chọn từ thư viện hoặc upload mới'}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 text-gray-600">
                            Hủy
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!selected}
                            className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Chọn file
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
