'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Plus, Search, Edit, Trash2, Eye, X, FileText,
    Save, Loader2, Image as ImageIcon, Upload, Video
} from 'lucide-react';
import {
    collection, query, orderBy, onSnapshot, addDoc,
    updateDoc, deleteDoc, doc, serverTimestamp, setDoc, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { generateSlug } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Dynamic import ReactQuill (SSR:false)
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as any;
import 'react-quill-new/dist/quill.snow.css';

const typeColors: Record<string, string> = {
    News: 'bg-blue-100 text-blue-700',
    Promo: 'bg-red-100 text-red-700',
    Tips: 'bg-green-100 text-green-700',
};

const typeLabels: Record<string, string> = {
    News: 'Tin tức',
    Promo: 'Khuyến mãi',
    Tips: 'Mẹo hay',
};

interface Article {
    id: string;
    title: string;
    content: string;
    type: string;
    status: string;
    thumbnail?: string;
    videoEmbedUrl?: string;
    views: number;
    tags?: string[];
    createdAt: any;
    updatedAt?: any;
}

// ── ReactQuill Toolbar Config ──
const quillModules = {
    toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['blockquote', 'code-block'],
        ['link', 'image', 'video'],
        ['clean'],
    ],
};

const quillFormats = [
    'header', 'bold', 'italic', 'underline', 'strike',
    'color', 'background', 'list', 'align',
    'blockquote', 'code-block', 'link', 'image', 'video',
];

export default function ArticlesPage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingArticle, setEditingArticle] = useState<Article | null>(null);

    // ── Realtime subscription to Firestore ──
    useEffect(() => {
        const q = query(collection(db, 'articles'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Article));
            setArticles(items);
            setLoading(false);
        }, (err) => {
            console.error('Articles fetch error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const deleteArticle = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa bài viết này?')) return;
        try {
            await deleteDoc(doc(db, 'articles', id));
        } catch (err) {
            console.error('Delete error:', err);
            alert('Lỗi khi xóa bài viết!');
        }
    };

    const filteredArticles = articles.filter((a) =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatDate = (d: any) => {
        if (!d) return '—';
        if (d.seconds) return new Date(d.seconds * 1000).toLocaleDateString('vi-VN');
        return new Date(d).toLocaleDateString('vi-VN');
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý bài viết</h1>
                    <p className="text-gray-500">Tin tức, khuyến mãi và mẹo hay ({articles.length} bài)</p>
                </div>
                <button
                    onClick={() => { setEditingArticle(null); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                    <Plus size={20} />
                    Thêm bài viết
                </button>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Tìm bài viết..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                />
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="animate-spin text-orange-500" size={36} />
                </div>
            )}

            {/* Articles Table */}
            {!loading && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tiêu đề</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Loại</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Lượt xem</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ngày tạo</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hành động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredArticles.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                                            <FileText size={40} className="mx-auto mb-2 text-gray-300" />
                                            Chưa có bài viết nào
                                        </td>
                                    </tr>
                                ) : (
                                    filteredArticles.map((article) => (
                                        <tr key={article.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {article.thumbnail ? (
                                                        <img src={article.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                                            <FileText size={18} className="text-gray-400" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="font-medium text-gray-900 line-clamp-1 max-w-xs block">{article.title}</span>
                                                        {article.videoEmbedUrl && (
                                                            <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 w-fit mt-0.5">
                                                                <Video size={10} /> Video
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${typeColors[article.type] || 'bg-gray-100'}`}>
                                                    {typeLabels[article.type] || article.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {article.status === 'published' ? 'Đã đăng' : 'Bản nháp'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{(article.views || 0).toLocaleString()}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{formatDate(article.createdAt)}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => { setEditingArticle(article); setIsModalOpen(true); }}
                                                        className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteArticle(article.id)}
                                                        className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <ArticleModal
                    article={editingArticle}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
function ArticleModal({
    article,
    onClose,
}: {
    article: Article | null;
    onClose: () => void;
}) {
    const [formData, setFormData] = useState({
        title: article?.title || '',
        type: article?.type || 'News',
        status: article?.status || 'draft',
        content: article?.content || '',
        thumbnail: article?.thumbnail || '',
        videoEmbedUrl: article?.videoEmbedUrl || '',
        tags: article?.tags?.join(', ') || '',
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const storageRef = ref(storage, `articles/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setFormData(prev => ({ ...prev, thumbnail: url }));
        } catch (err) {
            console.error('Upload error:', err);
            alert('Lỗi upload ảnh!');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.title.trim()) {
            alert('Vui lòng nhập tiêu đề!');
            return;
        }
        setSaving(true);
        try {
            const payload: any = {
                title: formData.title.trim(),
                type: formData.type,
                status: formData.status,
                content: formData.content,
                thumbnail: formData.thumbnail || '',
                videoEmbedUrl: formData.videoEmbedUrl.trim() || '',
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
                updatedAt: serverTimestamp(),
            };

            if (article) {
                // Update existing
                await updateDoc(doc(db, 'articles', article.id), payload);
            } else {
                // Create new
                payload.views = 0;
                payload.createdAt = serverTimestamp();
                
                let baseSlug = generateSlug(payload.title);
                let checkRef = await getDoc(doc(db, 'articles', baseSlug));
                let finalSlug = baseSlug;
                
                if (checkRef.exists()) {
                   finalSlug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
                }

                await setDoc(doc(db, 'articles', finalSlug), payload);
            }

            onClose();
        } catch (err) {
            console.error('Save error:', err);
            alert('Lỗi khi lưu bài viết!');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
                    <h2 className="text-xl font-bold">{article ? 'Sửa bài viết' : 'Thêm bài viết mới'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Tiêu đề <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="Nhập tiêu đề bài viết..."
                        />
                    </div>

                    {/* Thumbnail */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Ảnh thumbnail</label>
                        <div className="flex items-center gap-4">
                            {formData.thumbnail ? (
                                <div className="relative w-24 h-16 rounded-lg overflow-hidden border">
                                    <img src={formData.thumbnail} alt="" className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => setFormData({ ...formData, thumbnail: '' })}
                                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-24 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                                    <ImageIcon size={20} />
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                {uploading ? 'Đang tải...' : 'Chọn ảnh'}
                            </button>
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
                        </div>
                    </div>

                    {/* Type + Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Loại bài</label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            >
                                <option value="News">Tin tức</option>
                                <option value="Promo">Khuyến mãi</option>
                                <option value="Tips">Mẹo hay</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Trạng thái</label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            >
                                <option value="draft">Bản nháp</option>
                                <option value="published">Đăng ngay</option>
                            </select>
                        </div>
                    </div>

                    {/* Video Embed URL */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            <Video size={14} className="inline mr-1 text-purple-500" />
                            Video nổi bật (YouTube / Facebook URL)
                        </label>
                        <input
                            type="url"
                            value={formData.videoEmbedUrl}
                            onChange={(e) => setFormData({ ...formData, videoEmbedUrl: e.target.value })}
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="VD: https://www.youtube.com/watch?v=..."
                        />
                        <p className="text-xs text-gray-400 mt-1">Video sẽ hiển thị to đầu bài viết. Để chèn video giữa bài, dùng nút 🎬 trong trình soạn thảo.</p>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Tags (cách nhau bằng dấu phẩy)</label>
                        <input
                            type="text"
                            value={formData.tags}
                            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="VD: iPhone, khuyến mãi, mẹo hay"
                        />
                    </div>

                    {/* Content - ReactQuill */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Nội dung bài viết</label>
                        <div className="border rounded-lg overflow-hidden [&_.ql-container]:min-h-[250px] [&_.ql-editor]:min-h-[250px] [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-t-0 [&_.ql-toolbar]:border-x-0 [&_.ql-container]:border-0">
                            <ReactQuill
                                theme="snow"
                                value={formData.content}
                                onChange={(val: string) => setFormData(prev => ({ ...prev, content: val }))}
                                modules={quillModules}
                                formats={quillFormats}
                                placeholder="Viết nội dung bài viết ở đây... Dùng nút 🎬 trên toolbar để chèn video YouTube"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border rounded-lg font-medium hover:bg-gray-50 transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {article ? 'Cập nhật' : 'Đăng bài'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
