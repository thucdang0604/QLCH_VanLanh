'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Timestamp } from 'firebase/firestore';
import { Star, Loader2, Send } from 'lucide-react';
import type { ArticleComment } from '@/lib/types';

const ARTICLE_VIEW_TTL_MS = 24 * 60 * 60 * 1000;

function getArticleViewStorageKey(slug: string): string {
    return `vl_article_view:${slug}`;
}

function maskPhone(p?: string): string {
    if (!p) return '';
    const digits = String(p).replace(/\D/g, '');
    if (digits.length < 7) return p;
    return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

function formatDate(d: unknown): string {
    if (!d) return '';
    if (d instanceof Timestamp) {
        return d.toDate().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (typeof d === 'object' && d !== null && 'seconds' in d) {
        const seconds = (d as { seconds?: unknown }).seconds;
        if (typeof seconds === 'number') {
            return new Date(seconds * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    }
    return new Date(d as never).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ArticleClientParts({ slug }: { slug: string }) {
    const [comments, setComments] = useState<ArticleComment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(true);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitDone, setSubmitDone] = useState(false);

    const [rating, setRating] = useState<number>(5);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [content, setContent] = useState('');



    useEffect(() => {
        // Count at most one view per article per browser per day.
        if (!slug || typeof window === 'undefined') return;

        const storageKey = getArticleViewStorageKey(slug);
        const now = Date.now();

        try {
            const nextAllowedAt = Number(window.localStorage.getItem(storageKey)) || 0;
            if (nextAllowedAt > now) return;
            window.localStorage.setItem(storageKey, String(now + ARTICLE_VIEW_TTL_MS));
        } catch {
            // Ignore storage failures; the API also has a 24h cookie guard.
        }

        fetch('/api/articles/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug }),
            keepalive: true,
        }).catch(() => {
            try {
                window.localStorage.removeItem(storageKey);
            } catch {
                // Ignore storage cleanup failures.
            }
        });
    }, [slug]);

    useEffect(() => {
        let isMounted = true;
        const fetchComments = async () => {
            try {
                const q = query(
                    collection(db, 'article_comments'),
                    where('articleId', '==', slug),
                    where('status', '==', 'approved'),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                );
                const snap = await getDocs(q);
                if (isMounted) {
                    setComments(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ArticleComment, 'id'>) })));
                    setCommentsLoading(false);
                }
            } catch (err) {
                console.error('Error fetching comments:', err);
                if (isMounted) setCommentsLoading(false);
            }
        };
        fetchComments();
        return () => { isMounted = false; };
    }, [slug]);

    const averageRating = comments.length === 0
        ? 0
        : Math.round((comments.reduce((sum, c) => sum + (Number(c.rating) || 0), 0) / comments.length) * 10) / 10;

    const submitComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitLoading) return;
        const cleanName = name.trim();
        const cleanContent = content.trim();
        const cleanPhone = phone.trim();
        if (!cleanName || !cleanContent) return;

        setSubmitLoading(true);
        try {
            await addDoc(collection(db, 'article_comments'), {
                articleId: slug,
                rating: Math.min(5, Math.max(1, Number(rating) || 5)),
                name: cleanName,
                phone: cleanPhone,
                content: cleanContent,
                status: 'pending',
                createdAt: serverTimestamp(),
            });
            setSubmitDone(true);
            setName('');
            setPhone('');
            setContent('');
            setRating(5);
        } catch (err) {
            console.error('Error submitting comment:', err);
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <section className="mt-6 bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Đánh giá & bình luận</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Chia sẻ cảm nhận để bài viết hữu ích hơn. Bình luận sẽ hiển thị sau khi được duyệt.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                                <Star
                                    key={i}
                                    size={16}
                                    className={i < Math.round(averageRating) ? 'fill-orange-400 text-orange-400' : 'fill-gray-200 text-gray-200'}
                                />
                            ))}
                        </div>
                        <div className="text-sm">
                            <span className="font-semibold text-gray-900">{averageRating || '—'}</span>
                            <span className="text-gray-500">/5</span>
                            <span className="text-gray-400 ml-2">({comments.length})</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-5 sm:p-6">
                <form onSubmit={submitComment} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                        <label className="text-sm font-semibold text-gray-900">Bình luận</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={4}
                            placeholder="Bạn thấy bài viết này hữu ích ở điểm nào?"
                            className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                            required
                        />
                        {submitDone && (
                            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mt-3">
                                Đã gửi bình luận. Cảm ơn bạn! Bình luận sẽ hiển thị sau khi được duyệt.
                            </p>
                        )}
                    </div>

                    <div className="lg:col-span-1 space-y-3">
                        <div>
                            <label className="text-sm font-semibold text-gray-900">Đánh giá</label>
                            <div className="mt-2 flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                                {[...Array(5)].map((_, i) => {
                                    const star = i + 1;
                                    const active = star <= rating;
                                    return (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => setRating(star)}
                                            className="p-1"
                                            aria-label={`Chọn ${star} sao`}
                                            title={`${star} sao`}
                                        >
                                            <Star size={18} className={active ? 'fill-orange-400 text-orange-400' : 'fill-gray-200 text-gray-200'} />
                                        </button>
                                    );
                                })}
                                <span className="ml-auto text-xs font-semibold text-gray-700">{rating}/5</span>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-gray-900">Tên của bạn</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ví dụ: Minh Anh"
                                className="mt-2 w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-gray-900">Số điện thoại (tuỳ chọn)</label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                inputMode="tel"
                                placeholder="Để liên hệ khi cần"
                                className="mt-2 w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                            />
                            <p className="text-[11px] text-gray-500 mt-1">Số điện thoại sẽ được che khi hiển thị công khai.</p>
                        </div>

                        <button
                            type="submit"
                            disabled={submitLoading}
                            className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-70 transition-all active:scale-[0.99]"
                        >
                            {submitLoading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Đang gửi...
                                </>
                            ) : (
                                <>
                                    <Send size={16} />
                                    Gửi bình luận
                                </>
                            )}
                        </button>
                    </div>
                </form>

                <div className="mt-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">Bình luận đã duyệt</h3>
                        <span className="text-xs text-gray-500">{comments.length} bình luận</span>
                    </div>

                    {commentsLoading ? (
                        <div className="py-10 text-center text-gray-400 text-sm">Đang tải bình luận...</div>
                    ) : comments.length === 0 ? (
                        <div className="py-10 text-center text-gray-500 text-sm">
                            Chưa có bình luận nào. Hãy là người đầu tiên để lại đánh giá!
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {comments.map((c) => (
                                <div key={c.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900 truncate">
                                                {c.name}{c.phone ? <span className="text-gray-400 font-normal"> · {maskPhone(c.phone)}</span> : null}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star
                                                        key={i}
                                                        size={14}
                                                        className={i < (Number(c.rating) || 0) ? 'fill-orange-400 text-orange-400' : 'fill-gray-200 text-gray-200'}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        {c.createdAt && (
                                            <span className="text-xs text-gray-400 shrink-0">
                                                {formatDate(c.createdAt)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-700 mt-3 leading-relaxed whitespace-pre-line">
                                        {c.content}
                                    </p>

                                    {c.reply && (
                                        <div className="mt-4 bg-orange-50/50 p-4 rounded-xl border border-orange-100/50 flex gap-3">
                                            <div className="bg-orange-100 text-orange-600 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                                                <span className="font-bold text-sm">VL</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-semibold text-orange-800">Cửa hàng Văn Lành</span>
                                                    <span className="text-[11px] text-orange-400">{formatDate(c.reply.createdAt)}</span>
                                                </div>
                                                <p className="text-sm text-orange-900 leading-relaxed whitespace-pre-wrap">
                                                    {c.reply.content}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
