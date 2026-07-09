'use client';

import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, limit, getDocs, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { Loader2, MessageCircle, Save, Star, Trash2, X } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { db } from '@/lib/firebase';
import { toastError } from '@/lib/toast';
import type { Article, ArticleComment } from './articleTypes';

export function CommentsModal({ article, onClose }: { article: Article, onClose: () => void }) {
    const [comments, setComments] = useState<ArticleComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [savingReply, setSavingReply] = useState(false);

    useEffect(() => {
        const q = query(
            collection(db, 'article_comments'),
            where('articleId', '==', article.id),
            orderBy('createdAt', 'desc'),
            limit(50)
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
                <button title="Đóng" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
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
                                                    title="Xóa phản hồi"
                                                    onClick={() => handleDeleteReply(c.id)}
                                                    className="absolute top-2 right-2 p-1 text-blue-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        )}

                                        {replyingTo === c.id && (
                                            <div className="mt-3 bg-white p-3 rounded-lg border shadow-sm">
                                                <textarea
                                                    title="Nhập nội dung phản hồi"
                                                    value={replyContent}
                                                    onChange={(e) => setReplyContent(e.target.value)}
                                                    className="w-full text-sm p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                    rows={3}
                                                    placeholder="Nhập nội dung phản hồi..."
                                                    disabled={savingReply}
                                                />
                                                <div className="flex justify-end gap-2 mt-2">
                                                    <button
                                                        title="Hủy phản hồi"
                                                        onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                                                        className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                        disabled={savingReply}
                                                    >
                                                        Hủy
                                                    </button>
                                                    <button
                                                        title="Lưu phản hồi"
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
                                            title="Duyệt hiển thị"
                                            onClick={() => handleApprove(c.id, c.status)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors w-full ${c.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm'}`}
                                        >
                                            {c.status === 'approved' ? 'Đã hiển thị' : 'Duyệt hiển thị'}
                                        </button>
                                        <button
                                            title="Phản hồi"
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
                                            title="Xóa bình luận"
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
export function GlobalCommentsTab({ articles }: { articles: Article[] }) {
    const [comments, setComments] = useState<ArticleComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [savingReply, setSavingReply] = useState(false);

    useEffect(() => {
        const loadComments = async () => {
            try {
                const q = query(
                    collection(db, 'article_comments'),
                    orderBy('createdAt', 'desc'),
                    limit(100)
                );
                const snap = await getDocs(q);
                const items = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as ArticleComment));
                setComments(items);
                setLoading(false);
            } catch (err) {
                console.error('Error loading global comments:', err);
                setLoading(false);
            }
        };
        loadComments();
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
