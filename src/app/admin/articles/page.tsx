'use client';

import { useState, useEffect } from 'react';
import {
    Plus, Search, Edit, Trash2, FileText,
    Loader2, Video, MessageCircle
} from 'lucide-react';
import { collection, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { onSnapshot } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { toastError } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { triggerRevalidate } from '@/lib/revalidate';
import { ArticleModal } from '@/features/articles/ArticleEditorModal';
import { CommentsModal, GlobalCommentsTab } from '@/features/articles/ArticleComments';
import { articleTypeColors, articleTypeLabels, type Article } from '@/features/articles/articleTypes';

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
        const q = query(collection(db, 'articles'), orderBy('createdAt', 'desc'), limit(200));
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
                                            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${articleTypeColors[article.type] || 'bg-gray-100'}`}>
                                                {articleTypeLabels[article.type] || article.type}
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
                                        <button title="Quản lý bình luận" onClick={() => setManagingCommentsFor(article)} className="p-2 hover:bg-green-100 text-green-600 rounded-lg"><MessageCircle size={18} /></button>
                                        <button title="Sửa bài viết" onClick={() => { setEditingArticle(article); setIsModalOpen(true); }} className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"><Edit size={18} /></button>
                                        <button title="Xóa bài viết" onClick={() => deleteArticle(article.id)} className="p-2 hover:bg-red-100 text-red-600 rounded-lg"><Trash2 size={18} /></button>
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
                                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${articleTypeColors[article.type] || 'bg-gray-100'}`}>
                                                    {articleTypeLabels[article.type] || article.type}
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
                                                        title="Quản lý bình luận"
                                                        onClick={() => setManagingCommentsFor(article)}
                                                        className="p-2 hover:bg-green-100 text-green-600 rounded-lg transition-colors"
                                                    >
                                                        <MessageCircle size={18} />
                                                    </button>
                                                    <button
                                                        title="Sửa bài viết"
                                                        onClick={() => { setEditingArticle(article); setIsModalOpen(true); }}
                                                        className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        title="Xóa bài viết"
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
