'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Image as ImageIcon, Loader2, RefreshCw, Save, Star, Upload, Video, Wand2, X } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import MediaManager from '@/components/admin/MediaManager';
import { db, getAuthInstance, getStorageInstance } from '@/lib/firebase';
import { generateSlug } from '@/lib/utils';
import { optimizeImage } from '@/lib/imageOptimizer';
import { triggerRevalidate } from '@/lib/revalidate';
import { toastError } from '@/lib/toast';
import type { Article } from './articleTypes';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as unknown as React.ComponentType<{
    value: string;
    onChange: (value: string) => void;
    theme?: string;
    modules?: unknown;
    formats?: string[];
    placeholder?: string;
}>;

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

function buildArticleMediaDocumentId(name: string) {
    const slug = generateSlug(name).slice(0, 70) || 'media';
    return `MED-articles-${Date.now()}-${slug}`;
}

export function ArticleModal({
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
                        await setDoc(doc(db, 'media_library', buildArticleMediaDocumentId(`ai-img-${i + 1}-${ph}`)), {
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
            await setDoc(doc(db, 'media_library', buildArticleMediaDocumentId(optimized.name)), {
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

                        <button title="Đóng" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
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
                                <button title="Đóng" type="button" onClick={() => setSeoResult({ type: '', content: '' })} className="p-1 rounded-lg transition-colors text-blue-400 hover:bg-blue-100">
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
                                    <button title="Đóng" type="button" onClick={() => { setSeoResult({ type: '', content: '' }); setRefineProgress([]); }} className="p-1 rounded-lg transition-colors text-emerald-400 hover:bg-emerald-100">
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
                                        title="Xóa ảnh thumbnail"
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
                                title="Chọn ảnh thumbnail"
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                {uploading ? 'Đang tải...' : 'Chọn ảnh'}
                            </button>
                            <button
                                type="button"
                                title="Chọn ảnh từ thư viện"
                                onClick={() => setMediaPickerOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 transition-colors"
                            >
                                <ImageIcon size={16} />
                                Thư viện
                            </button>
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" title="Chọn ảnh thumbnail" />
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
                                title="Chọn loại bài"
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
                                title="Chọn trạng thái"
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
                            title="Nhập URL video"
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
                            title="Nhập tags"
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
                            title="Đóng"
                            onClick={onClose}
                            className="flex-1 py-3 border rounded-lg font-medium hover:bg-gray-50 transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            title="Lưu bài viết"
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
