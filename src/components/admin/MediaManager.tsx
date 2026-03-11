'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { X, Upload, Image as ImageIcon, Film, Trash2, Loader2, Check, Search, AlertTriangle } from 'lucide-react';

const MAX_VIDEO_SIZE_MB = 50;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

export interface MediaItem {
    id: string;
    url: string;
    path: string;
    name: string;
    type: string;
    size?: number;
    createdAt: any;
}

interface MediaManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (url: string) => void;
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch media library from Firestore
    useEffect(() => {
        if (!isOpen) return;
        const q = query(collection(db, 'media_library'), orderBy('createdAt', 'desc'));
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

                const storagePath = `media/${Date.now()}_${file.name}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);

                // Save metadata to Firestore
                await addDoc(collection(db, 'media_library'), {
                    url,
                    path: storagePath,
                    name: file.name,
                    type: file.type,
                    size: file.size,
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
            const storageRef = ref(storage, item.path);
            await deleteObject(storageRef).catch(() => { });
            await deleteDoc(doc(db, 'media_library', item.id));
        } catch (err) {
            console.error('Delete error:', err);
        }
        setDeleting(null);
    };

    // Select and return
    const handleConfirm = () => {
        if (selected) {
            onSelect(selected);
            onClose();
            setSelected(null);
        }
    };

    // Filter items
    const filtered = items.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                                        <span className="text-sm font-medium">Đang upload...</span>
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
                            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-amber-700">Hệ thống tự động tối ưu hóa khi tải lên. Video nên giữ dưới {MAX_VIDEO_SIZE_MB}MB để đảm bảo tốc độ tải trang.</p>
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
                            {/* Search */}
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Tìm theo tên file..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-orange-400"
                                />
                            </div>

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
                                            className={`relative group aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selected === item.url ? 'border-orange-500 ring-2 ring-orange-200' : 'border-transparent hover:border-gray-300'}`}
                                            onClick={() => setSelected(item.url)}
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
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }}
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
