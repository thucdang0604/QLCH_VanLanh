'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Plus, Search, Edit, Trash2, X, FileText,
    Save, Loader2, Image as ImageIcon, Upload, Video, MessageCircle, Star, Wand2,
    RefreshCw
} from 'lucide-react';
import {
    collection, query, orderBy, onSnapshot, updateDoc,
    deleteDoc, doc, serverTimestamp, setDoc, getDoc, where,
    addDoc
} from 'firebase/firestore';
import { db, getStorageInstance, getAuthInstance } from '@/lib/firebase';
import { generateSlug } from '@/lib/utils';
import type { ArticleComment } from '@/lib/types';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { toastError } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { triggerRevalidate } from '@/lib/revalidate';
import { optimizeImage } from '@/lib/imageOptimizer';
import MediaManager from '@/components/admin/MediaManager';
import Modal from '@/components/admin/Modal';
// Dynamic import ReactQuill (SSR:false)
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as unknown as React.ComponentType<{
    value: string;
    onChange: (value: string) => void;
    theme?: string;
    modules?: unknown;
    formats?: string[];
    placeholder?: string;
}>;
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
    excerpt?: string;
    type: string;
    status: string;
    thumbnail?: string;
    videoEmbedUrl?: string;
    views: number;
    tags?: string[];
    createdAt: unknown;
    updatedAt?: unknown;
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
    const [managingCommentsFor, setManagingCommentsFor] = useState<Article | null>(null);
    const [activeTab, setActiveTab] = useState<'articles' | 'comments'>('articles');

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
            await triggerRevalidate(['/', `/tin-tuc/${id}`, '/tin-tuc', '/sitemap.xml'], ['articles']);
        } catch (err) {
            console.error('Delete error:', err);
            toastError('Lỗi khi xóa bài viết!');
        }
    };

    const filteredArticles = articles.filter((a) =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const { paginatedData: paginatedArticles, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredArticles, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery]);

    const formatDate = (d: unknown) => {
        if (!d) return '—';
        if (typeof d === 'object' && d !== null && 'seconds' in d) return new Date((d as { seconds: number }).seconds * 1000).toLocaleDateString('vi-VN');
        return new Date(d as string | number | Date).toLocaleDateString('vi-VN');
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
                    disabled={activeTab !== 'articles'}
                />
            </div>

            {/* Tabs */}
            <div className="flex border-b">
                <button
                    onClick={() => setActiveTab('articles')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'articles' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Bài viết
                </button>
                <button
                    onClick={() => setActiveTab('comments')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'comments' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Phản hồi bình luận
                </button>
            </div>

            {/* Loading */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="animate-spin text-orange-500" size={36} />
                </div>
            ) : activeTab === 'articles' ? (
                /* Articles Table */
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    {/* Mobile Card View */}
                    <div className="block md:hidden divide-y divide-gray-100">
                        {filteredArticles.length === 0 ? (
                            <div className="px-6 py-12 text-center text-gray-400">
                                <FileText size={40} className="mx-auto mb-2 text-gray-300" />
                                Chưa có bài viết nào
                            </div>
                        ) : paginatedArticles.map((article) => (
                            <div key={article.id} className="p-4 space-y-3 hover:bg-gray-50 transition-colors">
                                <div className="flex items-start gap-3">
                                    {article.thumbnail ? (
                                        <Image src={article.thumbnail} alt="" width={56} height={56} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                            <FileText size={22} className="text-gray-400" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 line-clamp-2 text-sm">{article.title}</p>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${typeColors[article.type] || 'bg-gray-100'}`}>
                                                {typeLabels[article.type] || article.type}
                                            </span>
                                            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {article.status === 'published' ? 'Đã đăng' : 'Bản nháp'}
                                            </span>
                                            {article.videoEmbedUrl && (
                                                <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                                    <Video size={10} /> Video
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        <span>{(article.views || 0).toLocaleString()} lượt xem</span>
                                        <span>·</span>
                                        <span>{formatDate(article.createdAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setManagingCommentsFor(article)} className="p-2 hover:bg-green-100 text-green-600 rounded-lg"><MessageCircle size={18} /></button>
                                        <button onClick={() => { setEditingArticle(article); setIsModalOpen(true); }} className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"><Edit size={18} /></button>
                                        <button onClick={() => deleteArticle(article.id)} className="p-2 hover:bg-red-100 text-red-600 rounded-lg"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full min-w-[800px]">
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
                                    paginatedArticles.map((article) => (
                                        <tr key={article.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {article.thumbnail ? (
                                                        <Image src={article.thumbnail} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover" />
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
                                                        onClick={() => setManagingCommentsFor(article)}
                                                        className="p-2 hover:bg-green-100 text-green-600 rounded-lg transition-colors"
                                                        title="Quản lý bình luận"
                                                    >
                                                        <MessageCircle size={18} />
                                                    </button>
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
                    <PaginationBar
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        totalFiltered={totalFiltered}
                        totalAll={articles.length}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        entityLabel="bài viết"
                    />
                </div>
            ) : (
                <GlobalCommentsTab articles={articles} />
            )}

            {/* Modal */}
            {isModalOpen && (
                <ArticleModal
                    article={editingArticle}
                    onClose={() => setIsModalOpen(false)}
                />
            )}

            {managingCommentsFor && (
                <CommentsModal
                    article={managingCommentsFor}
                    onClose={() => setManagingCommentsFor(null)}
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
        excerpt: article?.excerpt || '',
        thumbnail: article?.thumbnail || '',
        videoEmbedUrl: article?.videoEmbedUrl || '',
        tags: article?.tags?.join(', ') || '',
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [seoResult, setSeoResult] = useState({ type: '', content: '' });
    const [isCheckingSeo, setIsCheckingSeo] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const [refineProgress, setRefineProgress] = useState<string[]>([]);
    const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);


    // --- AUTO-PILOT STATES ---
    const [autoPilotTopic, setAutoPilotTopic] = useState('');
    const [googleApiKey, setGoogleApiKey] = useState('');
    const [autoPilotState, setAutoPilotState] = useState<'idle' | 'meta' | 'content' | 'refine' | 'images' | 'done'>('idle');
    const [autoPilotLogs, setAutoPilotLogs] = useState<string[]>([]);



    const callAiApi = async (body: Record<string, unknown>) => {
        const auth = await getAuthInstance();
        const token = await auth.currentUser?.getIdToken();
        return fetch('/api/admin/ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify(body)
        });
    };

    const runAutoPilot = async () => {
        if (!autoPilotTopic.trim()) {
            toastError("Vui lòng nhập chủ đề Auto-Pilot!");
            return;
        }

        setAutoPilotLogs(["Khởi động Auto-Pilot..."]);
        setAutoPilotState('meta');

        try {
            // STEP 0: CONNECTION CHECK
            setAutoPilotLogs(prev => [...prev, "Bước 0: Kiểm tra kết nối AI API..."]);
            const connRes = await callAiApi({
                action: 'check-connection',
                payload: { apiKey: googleApiKey }
            });
            const connData = await connRes.json();
            if (!connRes.ok || !connData.ok) {
                throw new Error(connData.error || "Kết nối API thất bại.");
            }
            setAutoPilotLogs(prev => [...prev, "✓ Kết nối API ổn định!"]);

            // STEP 1: META GENERATION
            setAutoPilotLogs(prev => [...prev, "Bước 1: Phân tích SEO & Viết Tiêu đề, Tags, Mô tả ngắn..."]);
            const metaRes = await callAiApi({
                action: 'seo-suggest',
                payload: {
                    content: autoPilotTopic
                }
            });
            if (!metaRes.ok) throw new Error("Lỗi API seo-suggest");
            const metaReader = metaRes.body?.getReader();
            const metaDecoder = new TextDecoder();
            let metaAccumulated = '';
            while (true) {
                const { done, value } = (await metaReader?.read()) || { done: true, value: undefined };
                if (done) break;
                metaAccumulated += metaDecoder.decode(value, { stream: true });
            }
            // Parse Meta
            const titleMatch = metaAccumulated.match(/\[TITLE\]([\s\S]*?)(?:\[\/TITLE\]|$)/);
            const descMatch = metaAccumulated.match(/\[DESC\]([\s\S]*?)(?:\[\/DESC\]|$)/);
            const tagsMatch = metaAccumulated.match(/\[TAGS\]([\s\S]*?)(?:\[\/TAGS\]|$)/);

            const newTitle = titleMatch ? titleMatch[1].trim() : autoPilotTopic;
            const newDesc = descMatch ? descMatch[1].trim() : '';
            const newTags = tagsMatch ? tagsMatch[1].trim() : '';

            setFormData(prev => ({
                ...prev,
                title: newTitle,
                excerpt: newDesc,
                tags: newTags
            }));

            setAutoPilotLogs(prev => [...prev, "✓ Đã tìm ra Tiêu đề, Tags và Mô tả cực cháy!"]);

            // STEP 2: CONTENT GENERATION
            setAutoPilotState('content');
            setAutoPilotLogs(prev => [...prev, "Bước 2: Viết nội dung chuẩn SEO EEAT..."]);

            const contentRes = await callAiApi({
                action: 'content-suggest',
                payload: {
                    title: newTitle,
                    excerpt: newDesc,
                    tags: newTags,
                    content: autoPilotTopic
                }
            });
            if (!contentRes.ok) throw new Error("Lỗi API content-suggest");
            const contentReader = contentRes.body?.getReader();
            const contentDecoder = new TextDecoder();
            let contentStr = '';
            while (true) {
                const { done, value } = (await contentReader?.read()) || { done: true, value: undefined };
                if (done) break;
                contentStr += contentDecoder.decode(value, { stream: true });
            }

            setFormData(prev => ({
                ...prev,
                content: contentStr
            }));
            setAutoPilotLogs(prev => [...prev, "✓ Đã viết xong bản nháp đầu tiên!"]);

            // STEP 3: AUTO-REFINE LOOP (Check → Fix → Re-check)
            setAutoPilotState('refine');
            setAutoPilotLogs(prev => [...prev, "Bước 3: 🔄 Tự động kiểm tra & sửa SEO (Vòng lặp thông minh)..."]);

            const refineRes = await callAiApi({
                action: 'auto-refine',
                payload: {
                    title: newTitle,
                    excerpt: newDesc,
                    tags: newTags,
                    content: contentStr,
                    targetScore: 85,
                    maxRounds: 3
                }
            });
            if (!refineRes.ok) throw new Error("Lỗi API auto-refine");

            // Parse JSON-line stream from auto-refine
            const refineReader = refineRes.body?.getReader();
            const refineDecoder = new TextDecoder();
            let refineBuffer = '';
            let refinedContent = contentStr; // fallback to original if refine fails

            while (true) {
                const { done, value } = (await refineReader?.read()) || { done: true, value: undefined };
                if (done) break;
                refineBuffer += refineDecoder.decode(value, { stream: true });

                // Parse complete JSON lines
                const lines = refineBuffer.split('\n');
                refineBuffer = lines.pop() || ''; // keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.type === 'log') {
                            setAutoPilotLogs(prev => [...prev, data.message]);
                        } else if (data.type === 'result') {
                            refinedContent = data.content;
                            setAutoPilotLogs(prev => [...prev, `🏆 Kết quả: Điểm SEO cuối cùng = ${data.finalScore}/100 (sau ${data.rounds} vòng)`]);
                        }
                    } catch {
                        // not valid JSON, skip
                    }
                }
            }
            // Parse any remaining buffer
            if (refineBuffer.trim()) {
                try {
                    const data = JSON.parse(refineBuffer);
                    if (data.type === 'log') {
                        setAutoPilotLogs(prev => [...prev, data.message]);
                    } else if (data.type === 'result') {
                        refinedContent = data.content;
                        setAutoPilotLogs(prev => [...prev, `🏆 Kết quả: Điểm SEO cuối cùng = ${data.finalScore}/100 (sau ${data.rounds} vòng)`]);
                    }
                } catch { /* skip */ }
            }

            contentStr = refinedContent;
            setFormData(prev => ({
                ...prev,
                content: refinedContent
            }));
            setAutoPilotLogs(prev => [...prev, "✓ Bài viết đã được tối ưu SEO tự động!"]);

            // STEP 4: IMAGE GENERATION
            setAutoPilotState('images');
            setAutoPilotLogs(prev => [...prev, "Bước 4: Quét vị trí ảnh cần tạo..."]);

            const imgRegex = /\[CHÈN HÌNH ẢNH: (.*?)\]/g;
            let match;
            const placeholders = [];
            while ((match = imgRegex.exec(contentStr)) !== null) {
                placeholders.push(match[1]);
            }

            if (placeholders.length === 0) {
                setAutoPilotLogs(prev => [...prev, "Khoan, AI không chèn cái ảnh nào cả."]);
            } else {
                setAutoPilotLogs(prev => [...prev, `Tìm thấy ${placeholders.length} vị trí ảnh. Đang nhờ hoạ sĩ AI vẽ...`]);
                let tempContent = contentStr;
                for (let i = 0; i < placeholders.length; i++) {
                    const ph = placeholders[i];
                    setAutoPilotLogs(prev => [...prev, `⏳ Đang vẽ ảnh ${i + 1}/${placeholders.length}: ${ph.substring(0, 30)}...`]);

                    try {
                        const imgRes = await callAiApi({
                            action: 'generate-image',
                            payload: { prompt: ph, model: 'gptimage', apiKey: googleApiKey }
                        });

                        if (!imgRes.ok) throw new Error('Cannot fetch image');
                        const blob = await imgRes.blob();

                        // optimize & upload
                        const optimizeResponse = await optimizeImage(new File([blob], `ai_${Date.now()}.webp`, { type: 'image/webp' }), 1200, 800, 0.8);
                        const optimized = optimizeResponse.file;
                        const storagePath = `media/${Date.now()}_ai_img_${i}.webp`;
                        const storage = await getStorageInstance();
                        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                        const storageRef = ref(storage, storagePath);

                        await uploadBytes(storageRef, await optimized.arrayBuffer(), { contentType: 'image/webp' });
                        const finalUrl = await getDownloadURL(storageRef);

                        // Register in Media Library
                        await addDoc(collection(db, 'media_library'), {
                            url: finalUrl,
                            path: storagePath,
                            name: `AI Generated Article Image ${i + 1}`,
                            type: 'image/webp',
                            size: optimized.size,
                            width: optimizeResponse.width,
                            height: optimizeResponse.height,
                            createdAt: serverTimestamp(),
                        });

                        const imgHtml = `<figure><img src="${finalUrl}" alt="${ph}" /> <figcaption class="text-center italic text-sm text-gray-500 mt-2">${ph}</figcaption></figure><br/>`;
                        tempContent = tempContent.replace(`[CHÈN HÌNH ẢNH: ${ph}]`, imgHtml);
                        setFormData(prev => ({ ...prev, content: tempContent }));
                        setAutoPilotLogs(prev => [...prev, `✓ Đã giải quyết xong ảnh số ${i + 1}!`]);

                    } catch (e) {
                        console.error(e);
                        setAutoPilotLogs(prev => [...prev, `❌ mạng lag không tải được ảnh "${ph}". Thử lại sau.`]);
                    }
                }
            }

            setAutoPilotLogs(prev => [...prev, "🎉 XONG! Bài viết đã được viết, tối ưu SEO tự động, và ghép ảnh!"]);
            setAutoPilotState('done');

        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            setAutoPilotLogs(prev => [...prev, `❌ Lỗi: ${errorMessage}`]);
            setAutoPilotState('idle');
        }
    };

    const handleSeoMagic = async (type: 'check' | 'suggest' | 'content') => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formData.content;
        const plainTextContent = tempDiv.textContent || tempDiv.innerText || '';

        if (!formData.title && !plainTextContent.trim()) {
            toastError('Vui lòng nhập nội dung và tiêu đề để AI phân tích!');
            return;
        }

        setIsCheckingSeo(true);
        setSeoResult({ type, content: '' });

        try {
            const response = await callAiApi({
                action: type === 'check' ? 'seo-check' : type === 'suggest' ? 'seo-suggest' : 'content-suggest',
                payload: {
                    title: formData.title,
                    excerpt: formData.excerpt,
                    tags: formData.tags,
                    content: plainTextContent
                }
            });

            if (!response.ok) throw new Error('Cầu nối AI thất bại');
            if (!response.body) throw new Error('No stream');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
                setSeoResult({ type, content: accumulated });
            }
        } catch (error) {
            console.error('SEO Magic Error:', error);
            toastError('Lỗi khi phân tích bằng AI. Hãy chắc chắn Ollama đang chạy.');
        } finally {
            setIsCheckingSeo(false);
        }
    };

    // Standalone auto-refine for manual editing flow
    const handleAutoRefine = async () => {
        if (!formData.content.trim()) {
            toastError('Chưa có nội dung để tối ưu!');
            return;
        }
        if (!formData.title.trim()) {
            toastError('Vui lòng nhập tiêu đề trước!');
            return;
        }

        setIsRefining(true);
        setRefineProgress(['🔄 Bắt đầu vòng lặp tự sửa SEO...']);
        setSeoResult({ type: 'refine', content: '' });

        try {
            const res = await callAiApi({
                action: 'auto-refine',
                payload: {
                    title: formData.title,
                    excerpt: formData.excerpt,
                    tags: formData.tags,
                    content: formData.content,
                    targetScore: 85,
                    maxRounds: 3
                }
            });
            if (!res.ok) throw new Error('Lỗi API auto-refine');

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = (await reader?.read()) || { done: true, value: undefined };
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.type === 'log') {
                            setRefineProgress(prev => [...prev, data.message]);
                        } else if (data.type === 'result') {
                            setFormData(prev => ({ ...prev, content: data.content }));
                            setRefineProgress(prev => [...prev, `🏆 Hoàn tất! Điểm SEO: ${data.finalScore}/100 (${data.rounds} vòng)`]);
                        }
                    } catch { /* skip */ }
                }
            }
            // Parse remaining buffer
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.type === 'result') {
                        setFormData(prev => ({ ...prev, content: data.content }));
                        setRefineProgress(prev => [...prev, `🏆 Hoàn tất! Điểm SEO: ${data.finalScore}/100 (${data.rounds} vòng)`]);
                    }
                } catch { /* skip */ }
            }
        } catch (error) {
            console.error('Auto-refine error:', error);
            setRefineProgress(prev => [...prev, `❌ Lỗi: ${(error as Error).message}`]);
        } finally {
            setIsRefining(false);
        }
    };

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            // Optimize: resize & convert to WebP
            const { file: optimized, width, height } = await optimizeImage(file, 1200, 800, 0.8);
            const storagePath = `media/${Date.now()}_${optimized.name}`;
            const storage = await getStorageInstance();
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storageRef = ref(storage, storagePath);

            const buffer = await optimized.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            await uploadBytes(storageRef, bytes, { contentType: 'image/webp' });
            const url = await getDownloadURL(storageRef);

            // Register in Media Library
            await addDoc(collection(db, 'media_library'), {
                url,
                path: storagePath,
                name: optimized.name,
                type: 'image/webp',
                size: optimized.size,
                width,
                height,
                createdAt: serverTimestamp(),
            });

            setFormData(prev => ({ ...prev, thumbnail: url }));
        } catch (err) {
            console.error('Upload error:', err);
            toastError('Lỗi upload ảnh!');
        } finally {
            setUploading(false);
        }
    };


    const handleSave = async () => {
        if (!formData.title.trim()) {
            toastError('Vui lòng nhập tiêu đề!');
            return;
        }
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                title: formData.title.trim(),
                type: formData.type,
                status: formData.status,
                content: formData.content,
                excerpt: formData.excerpt.trim() || '',
                thumbnail: formData.thumbnail || '',
                videoEmbedUrl: formData.videoEmbedUrl.trim() || '',
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
                updatedAt: serverTimestamp(),
            };

            if (article) {
                // Update existing
                await updateDoc(doc(db, 'articles', article.id), payload);
                await triggerRevalidate(['/', `/tin-tuc/${article.id}`, '/tin-tuc', '/sitemap.xml'], ['articles']);
            } else {
                // Create new
                payload.views = 0;
                payload.createdAt = serverTimestamp();

                const baseSlug = generateSlug(payload.title as string);
                const checkRef = await getDoc(doc(db, 'articles', baseSlug));
                let finalSlug = baseSlug;

                if (checkRef.exists()) {
                    finalSlug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
                }

                await setDoc(doc(db, 'articles', finalSlug), payload);
                await triggerRevalidate(['/', `/tin-tuc/${finalSlug}`, '/tin-tuc', '/sitemap.xml'], ['articles']);
            }

            onClose();
        } catch (err) {
            console.error('Save error:', err);
            toastError('Lỗi khi lưu bài viết!');
        } finally {
            setSaving(false);
        }
    };


    

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            size="full"
            className="!max-w-3xl"
            priority="high"
        >
                <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white sticky top-0 md:rounded-t-2xl z-10">
                    <h2 className="text-xl font-bold">{article ? 'Sửa bài viết' : 'Thêm bài viết mới'}</h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleSeoMagic('check')}
                            disabled={isCheckingSeo || isRefining}
                            className="text-sm bg-blue-50 text-blue-600 font-medium px-3 py-1.5 md:px-4 md:py-2 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {isCheckingSeo ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
                            <span className="hidden md:inline">Chấm bài SEO</span>
                            <span className="md:hidden">Chấm SEO</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleAutoRefine}
                            disabled={isRefining || isCheckingSeo}
                            className="text-sm bg-emerald-50 text-emerald-700 font-medium px-3 py-1.5 md:px-4 md:py-2 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {isRefining ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            <span className="hidden md:inline">Tự sửa SEO</span>
                            <span className="md:hidden">Sửa SEO</span>
                        </button>

                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-4 md:p-6 space-y-5 overflow-y-auto flex-1 pb-20 md:pb-6">
                    {/* --- AUTO PILOT BANNER --- */}
                    <div className="bg-gradient-to-r from-indigo-50 text-indigo-900 border border-indigo-200 rounded-xl p-5 shadow-sm transform transition-all hover:shadow-md mb-4 animate-in fade-in zoom-in-95">
                        <h3 className="font-bold mb-2 flex items-center gap-2 text-lg">
                            <span className="bg-indigo-600 text-white p-1 rounded-md"><Wand2 size={18} /></span>
                            Auto-Pilot 1-Touch: Đăng Bài Tự Động
                        </h3>
                        <p className="text-sm text-indigo-700 mb-4 opacity-90 leading-relaxed max-w-xl">
                            Hệ thống sẽ tự động sinh Meta chuẩn SEO, Content chuyên sâu EEAT và ghép Hình Ảnh / Video vào bài viết. Tất cả chỉ trong 1 quy trình.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1 flex flex-col gap-2">
                                <input
                                    type="text"
                                    placeholder="Nhập từ khóa chính hoặc ý tưởng bài viết (vd: Tủ lạnh giá rẻ)..."
                                    value={autoPilotTopic}
                                    onChange={(e) => setAutoPilotTopic(e.target.value)}
                                    disabled={autoPilotState !== 'idle' && autoPilotState !== 'done'}
                                    className="w-full h-11 px-4 border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-indigo-300"
                                />
                                <input
                                    type="password"
                                    placeholder="[Tùy chọn] Nhập Google Gemini API Key để vẽ ảnh NanoBanana..."
                                    value={googleApiKey}
                                    onChange={(e) => setGoogleApiKey(e.target.value)}
                                    disabled={autoPilotState !== 'idle' && autoPilotState !== 'done'}
                                    className="w-full h-11 px-4 border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-indigo-300 text-sm"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={runAutoPilot}
                                disabled={autoPilotState !== 'idle' && autoPilotState !== 'done'}
                                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
                            >
                                {autoPilotState !== 'idle' && autoPilotState !== 'done' ? (
                                    <><Loader2 size={18} className="animate-spin" /> Hệ thống đang chạy...</>
                                ) : (
                                    <><Wand2 size={18} /> Khởi động Auto-Pilot</>
                                )}
                            </button>
                        </div>

                        {autoPilotLogs.length > 0 && (
                            <div className="mt-4 bg-indigo-950/90 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-indigo-200 space-y-1.5 shadow-inner">
                                {autoPilotLogs.map((log, idx) => (
                                    <div key={idx} className="animate-in fade-in slide-in-from-left-2 flex items-start gap-2">
                                        <span className="text-indigo-500">{'>'}</span> {log}
                                    </div>
                                ))}
                                {autoPilotState !== 'idle' && autoPilotState !== 'done' && (
                                    <div className="flex items-center gap-2 text-indigo-400 ml-1 mt-2">
                                        <Loader2 size={10} className="animate-spin" /> ...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* SEO Checker Panel */}
                    {(seoResult.content || isCheckingSeo) && seoResult.type === 'check' && (
                        <div className="border rounded-xl p-4 md:p-5 relative shrink-0 bg-blue-50/70 border-blue-200 animate-in fade-in zoom-in-95">
                            <div className="flex justify-between items-center mb-3 border-b pb-2 border-blue-100/50">
                                <h3 className="font-bold flex items-center gap-2 text-blue-900">
                                    <Star size={18} className="text-blue-500" /> Báo cáo chuẩn SEO (Ollama AI)
                                    {isCheckingSeo && <Loader2 size={14} className="animate-spin text-blue-500" />}
                                </h3>
                                <button type="button" onClick={() => setSeoResult({ type: '', content: '' })} className="p-1 rounded-lg transition-colors text-blue-400 hover:bg-blue-100">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="text-sm leading-relaxed font-medium text-blue-950">
                                {seoResult.content.split('\n').map((line, i) => (
                                    <p key={i} className="mb-1">
                                        {line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
                                            if (part.startsWith('**') && part.endsWith('**')) {
                                                return <strong key={j} className="text-blue-900">{part.slice(2, -2)}</strong>;
                                            }
                                            return part;
                                        })}
                                    </p>
                                ))}
                                {isCheckingSeo && <span className="inline-block w-2 h-4 animate-pulse ml-1 align-middle bg-blue-500"></span>}
                            </div>
                        </div>
                    )}

                    {/* Auto-Refine Progress Panel */}
                    {(isRefining || refineProgress.length > 0) && seoResult.type === 'refine' && (
                        <div className="border rounded-xl p-4 md:p-5 relative shrink-0 bg-emerald-50/70 border-emerald-200 animate-in fade-in zoom-in-95">
                            <div className="flex justify-between items-center mb-3 border-b pb-2 border-emerald-100/50">
                                <h3 className="font-bold flex items-center gap-2 text-emerald-900">
                                    <RefreshCw size={18} className={isRefining ? 'animate-spin text-emerald-500' : 'text-emerald-500'} />
                                    Tự động sửa SEO (Vòng lặp thông minh)
                                    {isRefining && <Loader2 size={14} className="animate-spin text-emerald-500" />}
                                </h3>
                                {!isRefining && (
                                    <button type="button" onClick={() => { setSeoResult({ type: '', content: '' }); setRefineProgress([]); }} className="p-1 rounded-lg transition-colors text-emerald-400 hover:bg-emerald-100">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            <div className="bg-emerald-950/90 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-emerald-200 space-y-1.5 shadow-inner">
                                {refineProgress.map((log, idx) => (
                                    <div key={idx} className="animate-in fade-in slide-in-from-left-2 flex items-start gap-2">
                                        <span className="text-emerald-500 shrink-0">{'>'}</span>
                                        <span>{log}</span>
                                    </div>
                                ))}
                                {isRefining && (
                                    <div className="flex items-center gap-2 text-emerald-400 ml-1 mt-2">
                                        <Loader2 size={10} className="animate-spin" /> Đang xử lý...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

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

                    {/* Excerpt */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Mô tả ngắn (SEO Meta Description)</label>
                        <textarea
                            value={formData.excerpt}
                            onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                            className="w-full h-20 p-3 border rounded-lg focus:border-orange-500 focus:outline-none resize-none"
                            placeholder="Mô tả ngắn gọn nội dung bài viết (dưới 155 ký tự)..."
                        />

                    </div>

                    {/* Thumbnail */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Ảnh thumbnail</label>
                        <div className="flex items-center gap-4">
                            {formData.thumbnail ? (
                                <div className="relative w-24 h-16 rounded-lg overflow-hidden border">
                                    <Image src={formData.thumbnail} alt="" fill className="object-cover" />
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
                            <button
                                type="button"
                                onClick={() => setMediaPickerOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 transition-colors"
                            >
                                <ImageIcon size={16} />
                                Thư viện
                            </button>
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
                        </div>
                        <MediaManager
                            isOpen={mediaPickerOpen}
                            onClose={() => setMediaPickerOpen(false)}
                            onSelect={(url) => setFormData({ ...formData, thumbnail: url })}
                            title="Chọn ảnh thumbnail"
                        />
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
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-sm font-medium">Nội dung bài viết</label>

                        </div>

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
                    <div className="flex gap-3 p-4 border-t sticky bottom-0 bg-white mt-auto shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:shadow-none">
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
        </Modal>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
function CommentsModal({ article, onClose }: { article: Article, onClose: () => void }) {
    const [comments, setComments] = useState<ArticleComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [savingReply, setSavingReply] = useState(false);

    useEffect(() => {
        const q = query(
            collection(db, 'article_comments'),
            where('articleId', '==', article.id),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArticleComment));
            setComments(items);
            setLoading(false);
        });
        return () => unsub();
    }, [article.id]);

    const handleApprove = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'approved' ? 'pending' : 'approved';
        await updateDoc(doc(db, 'article_comments', id), { status: newStatus });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa bình luận này?')) return;
        await deleteDoc(doc(db, 'article_comments', id));
    };

    const handleSaveReply = async (id: string) => {
        if (!replyContent.trim()) return;
        setSavingReply(true);
        try {
            await updateDoc(doc(db, 'article_comments', id), {
                reply: {
                    content: replyContent.trim(),
                    createdAt: serverTimestamp()
                }
            });
            setReplyingTo(null);
            setReplyContent('');
        } catch (error) {
            console.error('Save reply error:', error);
            toastError('Lỗi khi lưu phản hồi');
        } finally {
            setSavingReply(false);
        }
    };

    const handleDeleteReply = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa phản hồi này?')) return;
        await updateDoc(doc(db, 'article_comments', id), {
            reply: null
        });
    };

    const formatDate = (d: unknown) => {
        if (!d) return '—';
        if (typeof d === 'object' && d !== null && 'seconds' in d) return new Date((d as { seconds: number }).seconds * 1000).toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return new Date(d as string | number | Date).toLocaleDateString('vi-VN');
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            size="full"
            className="!max-w-3xl"
            priority="high"
        >
            <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white z-10">
                <div>
                    <h2 className="text-xl font-bold">Quản lý bình luận</h2>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">Bài viết: {article.title}</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                    <X size={20} />
                </button>
            </div>

            <div className="p-4 md:p-6 pb-6">
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>
                    ) : comments.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">Chưa có bình luận nào.</div>
                    ) : (
                        <div className="space-y-4">
                            {comments.map(c => (
                                <div key={c.id} className={`border rounded-xl p-4 flex flex-col sm:flex-row gap-4 relative ${c.status === 'pending' ? 'bg-amber-50/30' : 'bg-gray-50'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-gray-900">{c.name}</span>
                                            {c.phone && <span className="text-xs text-gray-500">{c.phone}</span>}
                                            <span className="text-xs text-gray-400 ml-auto">{formatDate(c.createdAt)}</span>
                                        </div>
                                        <div className="flex items-center gap-1 mb-2">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={14} className={i < c.rating ? 'fill-orange-400 text-orange-400' : 'fill-gray-200 text-gray-200'} />
                                            ))}
                                        </div>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>

                                        {c.reply && replyingTo !== c.id && (
                                            <div className="mt-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100 relative group">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-semibold text-blue-800">Phản hồi từ Cửa hàng</span>
                                                    <span className="text-[10px] text-blue-400">{formatDate(c.reply.createdAt)}</span>
                                                </div>
                                                <p className="text-sm text-blue-900 whitespace-pre-wrap">{c.reply.content}</p>
                                                <button
                                                    onClick={() => handleDeleteReply(c.id)}
                                                    className="absolute top-2 right-2 p-1 text-blue-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Xóa phản hồi"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        )}

                                        {replyingTo === c.id && (
                                            <div className="mt-3 bg-white p-3 rounded-lg border shadow-sm">
                                                <textarea
                                                    value={replyContent}
                                                    onChange={(e) => setReplyContent(e.target.value)}
                                                    className="w-full text-sm p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                    rows={3}
                                                    placeholder="Nhập nội dung phản hồi..."
                                                    disabled={savingReply}
                                                />
                                                <div className="flex justify-end gap-2 mt-2">
                                                    <button
                                                        onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                                                        className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                        disabled={savingReply}
                                                    >
                                                        Hủy
                                                    </button>
                                                    <button
                                                        onClick={() => handleSaveReply(c.id)}
                                                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                                                        disabled={savingReply || !replyContent.trim()}
                                                    >
                                                        {savingReply ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                                        Lưu phản hồi
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex sm:flex-col gap-2 shrink-0 border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0 sm:pl-4 justify-center">
                                        <button
                                            onClick={() => handleApprove(c.id, c.status)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors w-full ${c.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm'}`}
                                        >
                                            {c.status === 'approved' ? 'Đã hiển thị' : 'Duyệt hiển thị'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setReplyingTo(replyingTo === c.id ? null : c.id);
                                                if (replyingTo !== c.id) {
                                                    setReplyContent(c.reply?.content || '');
                                                }
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 w-full"
                                        >
                                            {c.reply ? 'Sửa phản hồi' : 'Phản hồi'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(c.id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 transition-colors w-full"
                                        >
                                            Xóa
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
        </Modal>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
function GlobalCommentsTab({ articles }: { articles: Article[] }) {
    const [comments, setComments] = useState<ArticleComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [savingReply, setSavingReply] = useState(false);

    useEffect(() => {
        const q = query(
            collection(db, 'article_comments'),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArticleComment));
            setComments(items);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleApprove = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'approved' ? 'pending' : 'approved';
        await updateDoc(doc(db, 'article_comments', id), { status: newStatus });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa bình luận này?')) return;
        await deleteDoc(doc(db, 'article_comments', id));
    };

    const handleSaveReply = async (id: string) => {
        if (!replyContent.trim()) return;
        setSavingReply(true);
        try {
            await updateDoc(doc(db, 'article_comments', id), {
                reply: {
                    content: replyContent.trim(),
                    createdAt: serverTimestamp()
                }
            });
            setReplyingTo(null);
            setReplyContent('');
        } catch (error) {
            console.error('Save reply error:', error);
            toastError('Lỗi khi lưu phản hồi');
        } finally {
            setSavingReply(false);
        }
    };

    const handleDeleteReply = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa phản hồi này?')) return;
        await updateDoc(doc(db, 'article_comments', id), {
            reply: null
        });
    };

    const formatDate = (d: unknown) => {
        if (!d) return '—';
        if (typeof d === 'object' && d !== null && 'seconds' in d) return new Date((d as { seconds: number }).seconds * 1000).toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return new Date(d as string | number | Date).toLocaleDateString('vi-VN');
    };

    const getArticleTitle = (id: string) => {
        return articles.find(a => a.id === id)?.title || 'Bài viết không xác định';
    };

    if (loading) {
        return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;
    }

    if (comments.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500 border">
                <MessageCircle size={48} className="mx-auto mb-4 text-gray-300" />
                Chưa có bình luận nào trên hệ thống.
            </div>
        );
    }

    return (
        <div className="space-y-4 pt-4">
            {comments.map(c => (
                <div key={c.id} className={`border rounded-xl p-5 flex flex-col md:flex-row gap-5 relative bg-white shadow-sm overflow-hidden`}>
                    {c.status === 'pending' && <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>}

                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-900 text-base">{c.name}</span>
                            {c.phone && <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{c.phone}</span>}
                            {c.status === 'pending' && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-2 py-0.5 rounded ml-1">
                                    Chờ duyệt
                                </span>
                            )}
                            <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                                {formatDate(c.createdAt)}
                            </span>
                        </div>

                        <div className="text-xs text-gray-500 mb-2 truncate bg-gray-50 p-2 rounded border inline-block max-w-[90%] md:max-w-[70%] lg:max-w-full">
                            Bài viết: <span className="font-medium text-gray-700">{getArticleTitle(c.articleId)}</span>
                        </div>

                        <div className="flex items-center gap-1 mb-3">
                            {[...Array(5)].map((_, i) => (
                                <Star key={i} size={14} className={i < c.rating ? 'fill-orange-400 text-orange-400' : 'fill-gray-200 text-gray-200'} />
                            ))}
                        </div>

                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{c.content}</p>

                        {c.reply && replyingTo !== c.id && (
                            <div className="mt-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100 relative group ml-4 sm:ml-8">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-blue-800">Cửa hàng phản hồi</span>
                                    <span className="text-xs text-blue-400">{formatDate(c.reply.createdAt)}</span>
                                </div>
                                <p className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">{c.reply.content}</p>
                                <button
                                    onClick={() => handleDeleteReply(c.id)}
                                    className="absolute top-2 right-2 p-1.5 text-blue-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    title="Xóa phản hồi"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}

                        {replyingTo === c.id && (
                            <div className="mt-4 bg-white p-4 rounded-lg border border-blue-200 shadow-sm ml-4 sm:ml-8">
                                <h4 className="text-sm font-bold text-gray-900 mb-2">Phản hồi của bạn</h4>
                                <textarea
                                    value={replyContent}
                                    onChange={(e) => setReplyContent(e.target.value)}
                                    className="w-full text-sm p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-blue-50/30"
                                    rows={3}
                                    placeholder="Nhập nội dung phản hồi..."
                                    disabled={savingReply}
                                />
                                <div className="flex justify-end gap-2 mt-3">
                                    <button
                                        onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                                        className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                                        disabled={savingReply}
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={() => handleSaveReply(c.id)}
                                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
                                        disabled={savingReply || !replyContent.trim()}
                                    >
                                        {savingReply ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Lưu phản hồi
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex md:flex-col gap-2 shrink-0 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-5 justify-center mt-2 md:mt-0 md:w-32 lg:w-40">
                        <button
                            onClick={() => handleApprove(c.id, c.status)}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors w-full border flex items-center justify-center ${c.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-sm'}`}
                        >
                            {c.status === 'approved' ? 'Đã duyệt' : 'Duyệt'}
                        </button>
                        <button
                            onClick={() => {
                                setReplyingTo(replyingTo === c.id ? null : c.id);
                                if (replyingTo !== c.id) {
                                    setReplyContent(c.reply?.content || '');
                                }
                            }}
                            className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 w-full flex items-center justify-center justify-center"
                        >
                            {c.reply ? 'Sửa' : 'Phản hồi'}
                        </button>
                        <button
                            onClick={() => handleDelete(c.id)}
                            className="px-3 py-2 rounded-lg text-sm font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors w-full flex items-center justify-center"
                        >
                            Xóa
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
