'use client';

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { deleteField, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { Clock, Image as ImageIcon, Loader2, RefreshCw, Save, Settings, Star, Upload, Video, Wand2, X } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import MediaManager from '@/components/admin/MediaManager';
import { db, getAuthInstance, getStorageInstance } from '@/lib/firebase';
import { generateSlug } from '@/lib/utils';
import { optimizeImage } from '@/lib/imageOptimizer';
import { triggerRevalidate } from '@/lib/revalidate';
import { toastError, toastSuccess, toastInfo } from '@/lib/toast';
import { resolveInternalLinkPlaceholdersInHtml } from '@/lib/internalLinkResolver';
import { AiProviderMode, AiTaskModels, DEFAULT_AI_CONFIG, DEFAULT_9ROUTER_MODELS } from '@/lib/aiAdapter';
import type { Article } from './articleTypes';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as unknown as React.ComponentType<{
    value: string;
    onChange: (value: string) => void;
    ref?: React.Ref<ReactQuillHandle>;
    theme?: string;
    modules?: unknown;
    formats?: string[];
    placeholder?: string;
}>;

type QuillRange = { index: number; length: number };
type QuillEditor = {
    getLength: () => number;
    getSelection: (focus?: boolean) => QuillRange | null;
    clipboard: {
        dangerouslyPasteHTML: (index: number, html: string) => void;
    };
};
type ReactQuillHandle = {
    getEditor: () => QuillEditor;
};

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
    ]
};

const quillFormats = [
    'header', 'bold', 'italic', 'underline', 'strike',
    'color', 'background', 'list', 'align',
    'blockquote', 'code-block', 'link', 'image', 'video',
];

function formatDateTimeLocal(d: unknown): string {
    if (!d) return '';
    let date: Date | null = null;
    if (typeof d === 'object' && d !== null && 'seconds' in d) {
        date = new Date((d as { seconds: number }).seconds * 1000);
    } else if (d instanceof Date) {
        date = d;
    } else if (typeof d === 'string' || typeof d === 'number') {
        date = new Date(d);
    }
    if (!date || isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildArticleMediaDocumentId(name: string) {
    const slug = generateSlug(name).slice(0, 70) || 'media';
    return `MED-articles-${Date.now()}-${slug}`;
}

function stripWordPressCaptionShortcodes(html: string): string {
    return html
        .replace(/\[caption[^\]]*\]/gi, '')
        .replace(/\[\/caption\]/gi, '');
}

function normalizeUrl(value: string | null | undefined): string {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;
    return raw;
}

function getLargestSrcSetUrl(srcset: string | null | undefined): string {
    if (!srcset) return '';

    return srcset
        .split(',')
        .map((candidate) => {
            const [url = '', descriptor = ''] = candidate.trim().split(/\s+/);
            const size = Number(descriptor.replace(/[^\d.]/g, '')) || 0;
            return { url: normalizeUrl(url), size };
        })
        .filter((candidate) => candidate.url)
        .sort((a, b) => b.size - a.size)[0]?.url || '';
}

function isUsableImageSrc(src: string): boolean {
    if (!src) return false;
    if (/^data:image\/svg\+xml/i.test(src)) return false;
    if (/^(about:blank|blob:)/i.test(src)) return false;
    return true;
}

function getBestImageSource(img: HTMLImageElement): string {
    const lazyCandidates = [
        img.getAttribute('data-src'),
        img.getAttribute('data-lazy-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-orig-file'),
        img.getAttribute('data-large-file'),
        img.getAttribute('data-medium-file'),
    ].map(normalizeUrl);

    const srcsetCandidates = [
        normalizeUrl(img.currentSrc),
        getLargestSrcSetUrl(img.getAttribute('data-srcset')),
        getLargestSrcSetUrl(img.getAttribute('srcset')),
    ];

    const fallbackCandidates = [
        img.getAttribute('src'),
    ].map(normalizeUrl);

    return [...lazyCandidates, ...srcsetCandidates, ...fallbackCandidates].find(isUsableImageSrc) || '';
}

function toEmbeddableVideoUrl(url: string): string {
    const normalized = normalizeUrl(url);
    if (!normalized) return '';

    try {
        const parsed = new URL(normalized);
        const host = parsed.hostname.replace(/^www\./, '');

        if (host === 'youtube.com' || host === 'm.youtube.com') {
            const watchId = parsed.searchParams.get('v');
            const shortsId = parsed.pathname.match(/^\/shorts\/([^/?#]+)/)?.[1];
            const embedId = parsed.pathname.match(/^\/embed\/([^/?#]+)/)?.[1];
            const id = watchId || shortsId || embedId;
            return id ? `https://www.youtube.com/embed/${id}` : normalized;
        }

        if (host === 'youtu.be') {
            const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
            return id ? `https://www.youtube.com/embed/${id}` : normalized;
        }

        if ((host === 'facebook.com' || host === 'web.facebook.com') && !parsed.pathname.includes('/plugins/video.php')) {
            return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(normalized)}&show_text=false&width=734`;
        }
    } catch {
        return normalized;
    }

    return normalized;
}

function normalizePastedArticleHtml(html: string): string {
    const parser = new DOMParser();
    const docNode = parser.parseFromString(stripWordPressCaptionShortcodes(html), 'text/html');

    const textWalker = docNode.createTreeWalker(docNode.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (textWalker.nextNode()) {
        textNodes.push(textWalker.currentNode as Text);
    }
    textNodes.forEach((node) => {
        node.textContent = stripWordPressCaptionShortcodes(node.textContent || '');
    });

    docNode.querySelectorAll('img').forEach((img) => {
        const bestSrc = getBestImageSource(img);
        if (!bestSrc) {
            img.remove();
            return;
        }

        img.setAttribute('src', bestSrc);
        img.removeAttribute('srcset');
        img.removeAttribute('data-srcset');
        img.removeAttribute('data-src');
        img.removeAttribute('data-lazy-src');
        img.removeAttribute('data-original');
        img.removeAttribute('data-orig-file');
        img.removeAttribute('data-large-file');
        img.removeAttribute('data-medium-file');
    });

    docNode.querySelectorAll('iframe').forEach((iframe) => {
        const src = toEmbeddableVideoUrl(
            iframe.getAttribute('data-src') ||
            iframe.getAttribute('data-lazy-src') ||
            iframe.getAttribute('src') ||
            ''
        );

        if (!src) {
            iframe.remove();
            return;
        }

        iframe.setAttribute('src', src);
        iframe.setAttribute('class', 'ql-video');
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', 'true');
    });

    docNode.querySelectorAll('video').forEach((video) => {
        const source = video.getAttribute('src') || video.querySelector('source[src]')?.getAttribute('src') || '';
        const src = normalizeUrl(source);
        if (!src) {
            video.remove();
            return;
        }

        const iframe = docNode.createElement('iframe');
        iframe.setAttribute('src', src);
        iframe.setAttribute('class', 'ql-video');
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', 'true');
        video.replaceWith(iframe);
    });

    docNode.querySelectorAll('a[href]').forEach((link) => {
        const href = link.getAttribute('href') || '';
        const embedUrl = toEmbeddableVideoUrl(href);
        if (!/youtube\.com\/embed\/|facebook\.com\/plugins\/video\.php/i.test(embedUrl)) return;

        const iframe = docNode.createElement('iframe');
        iframe.setAttribute('src', embedUrl);
        iframe.setAttribute('class', 'ql-video');
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', 'true');
        link.replaceWith(iframe);
    });

    return docNode.body.innerHTML;
}

async function processBase64Images(htmlContent: string): Promise<string> {
    if (!htmlContent) return '';

    const parser = new DOMParser();
    const docNode = parser.parseFromString(htmlContent, 'text/html');
    const images = docNode.querySelectorAll('img');

    const base64Images: HTMLImageElement[] = [];
    images.forEach(img => {
        if (img.src && img.src.startsWith('data:image/')) {
            base64Images.push(img);
        }
    });

    if (base64Images.length === 0) {
        return htmlContent;
    }

    for (let i = 0; i < base64Images.length; i++) {
        const img = base64Images[i];
        const base64Src = img.src;

        try {
            const res = await fetch(base64Src);
            const blob = await res.blob();
            const originalFile = new File([blob], `pasted_image_${Date.now()}_${i}.png`, { type: blob.type });

            const optimizeResponse = await optimizeImage(originalFile, 1200, 800, 0.8);
            const optimizedFile = optimizeResponse.file;

            const arrayBuffer = await optimizedFile.arrayBuffer();
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            const docId = `MED-articles-${hash}`;
            const mediaDocRef = doc(db, 'media_library', docId);
            const mediaDocSnap = await getDoc(mediaDocRef);

            if (mediaDocSnap.exists()) {
                img.src = mediaDocSnap.data().url;
                continue;
            }

            const storagePath = `media/articles/${hash}.webp`;
            const storage = await getStorageInstance();
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, new Uint8Array(arrayBuffer), { contentType: 'image/webp' });
            const url = await getDownloadURL(storageRef);

            await setDoc(mediaDocRef, {
                url,
                path: storagePath,
                name: optimizedFile.name,
                type: 'image/webp',
                size: optimizedFile.size,
                width: optimizeResponse.width,
                height: optimizeResponse.height,
                folder: 'articles',
                createdAt: serverTimestamp(),
            });

            img.src = url;
        } catch (err) {
            console.error('Failed to process base64 image:', err);
        }
    }

    return docNode.body.innerHTML;
}

interface ArticleEditorModalProps {
    article?: Article | null;
    onClose: () => void;
}

export default function ArticleEditorModal({ article, onClose }: ArticleEditorModalProps) {
    const [formData, setFormData] = useState({
        title: article?.title || '',
        type: article?.type || 'News',
        status: article?.status || 'draft',
        content: article?.content || '',
        excerpt: article?.excerpt || '',
        thumbnail: article?.thumbnail || '',
        videoEmbedUrl: article?.videoEmbedUrl || '',
        tags: article?.tags?.join(', ') || '',
        scheduledAt: formatDateTimeLocal(article?.scheduledAt),
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [seoResult, setSeoResult] = useState({ type: '', content: '' });
    const [isCheckingSeo, setIsCheckingSeo] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const [refineProgress, setRefineProgress] = useState<string[]>([]);
    const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const quillRef = useRef<ReactQuillHandle>(null);

    const handlePasteCapture = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const html = e.clipboardData.getData('text/html');
        if (!html) return;

        e.preventDefault();
        e.stopPropagation();

        const editor = quillRef.current?.getEditor();
        if (!editor) return;

        const range = editor.getSelection(true);
        const index = range ? range.index : editor.getLength();
        editor.clipboard.dangerouslyPasteHTML(index, normalizePastedArticleHtml(html));
    };

    // --- AUTO-PILOT STATES & DYNAMIC AI ENGINE CONFIG ---
    const [autoPilotTopic, setAutoPilotTopic] = useState('');
    const [autoPilotState, setAutoPilotState] = useState<'idle' | 'meta' | 'content' | 'refine' | 'images' | 'links' | 'done'>('idle');
    const [autoPilotLogs, setAutoPilotLogs] = useState<string[]>([]);

    const [providerMode, setProviderMode] = useState<AiProviderMode>('ollama');
    const [cloudApiKey, setCloudApiKey] = useState('');
    const [cloudBaseUrl, setCloudBaseUrl] = useState('https://api.9router.com/v1');
    const [taskModels, setTaskModels] = useState<AiTaskModels>(DEFAULT_AI_CONFIG.taskModels);
    const [localModels, setLocalModels] = useState<string[]>([]);
    const [isLoadingLocalModels, setIsLoadingLocalModels] = useState(false);
    const [showAiConfigPanel, setShowAiConfigPanel] = useState(false);

    // Load saved AI config from LocalStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('qlch_ai_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.providerMode) setProviderMode(parsed.providerMode);
                if (parsed.cloudApiKey !== undefined) setCloudApiKey(parsed.cloudApiKey);
                if (parsed.cloudBaseUrl !== undefined) setCloudBaseUrl(parsed.cloudBaseUrl);
                if (parsed.taskModels) setTaskModels(prev => ({ ...prev, ...parsed.taskModels }));
            }
        } catch { /* skip */ }
    }, []);

    // Save AI config to LocalStorage helper
    const updateAndSaveAiConfig = (
        mode: AiProviderMode,
        key: string,
        url: string,
        models: AiTaskModels
    ) => {
        setProviderMode(mode);
        setCloudApiKey(key);
        setCloudBaseUrl(url);
        setTaskModels(models);
        try {
            localStorage.setItem('qlch_ai_config', JSON.stringify({
                providerMode: mode,
                cloudApiKey: key,
                cloudBaseUrl: url,
                taskModels: models
            }));
        } catch { /* skip */ }
    };

    // Helper to fetch local models from Ollama
    const fetchLocalModels = async () => {
        setIsLoadingLocalModels(true);
        try {
            const res = await callAiApi({ action: 'get-local-models', payload: {} });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.models) && data.models.length > 0) {
                    setLocalModels(data.models);
                }
            }
        } catch { /* skip */ } finally {
            setIsLoadingLocalModels(false);
        }
    };

    const callAiApi = async (body: Record<string, unknown>) => {
        const auth = await getAuthInstance();
        const token = await auth.currentUser?.getIdToken();

        const payload = (body.payload as Record<string, unknown>) || {};
        const payloadWithConfig = {
            providerMode,
            apiKey: cloudApiKey,
            baseUrl: cloudBaseUrl,
            ...payload
        };

        return fetch('/api/admin/ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                ...body,
                payload: payloadWithConfig
            })
        });
    };

    const runImageGenerationStep = async (inputHtml?: string) => {
        const contentStr = inputHtml || formData.content;
        if (!contentStr) {
            toastError("Chưa có nội dung bài viết để tạo ảnh!");
            return contentStr;
        }

        setAutoPilotState('images');
        setAutoPilotLogs(prev => [...prev, `Bước 4: Quét vị trí ảnh & dịch prompt (Model Prompt: ${taskModels.imagePrompt})...`]);

        // Fetch Store Config for Watermark Logo & Site Name
        let storeLogoUrl: string | undefined;
        let storeName = 'Văn Lành Service';
        try {
            const cfgSnap = await getDoc(doc(db, 'system_config', 'settings'));
            if (cfgSnap.exists()) {
                const d = cfgSnap.data();
                if (d.logoUrl) storeLogoUrl = String(d.logoUrl).trim();
                if (d.siteName) storeName = String(d.siteName).trim();
            }
        } catch (cfgErr) {
            console.warn('Could not fetch store config for watermark:', cfgErr);
        }

        const imgRegex = /\[(?:IMAGE_PROMPT|CHÈN\s+(?:HÌNH\s*)?[ẢÁA]NH):\s*(.*?)\]/gi;
        let match;
        const placeholders: { fullMatch: string; promptText: string }[] = [];
        while ((match = imgRegex.exec(contentStr)) !== null) {
            if (match[1]?.trim()) {
                placeholders.push({
                    fullMatch: match[0],
                    promptText: match[1].trim(),
                });
            }
        }

        let tempContent = contentStr;

        if (placeholders.length === 0) {
            setAutoPilotLogs(prev => [...prev, "Khoan, AI không chèn cái ảnh nào cả."]);
        } else {
            setAutoPilotLogs(prev => [...prev, `Tìm thấy ${placeholders.length} vị trí ảnh. Đang nhờ hoạ sĩ AI vẽ & gắn Watermark logo cửa hàng...`]);
            for (let i = 0; i < placeholders.length; i++) {
                if (i > 0) {
                    setAutoPilotLogs(prev => [...prev, `⏱️ Nghỉ 2.5s giãn cách rate limit (QPS) Gemini...`]);
                    await new Promise(r => setTimeout(r, 2500));
                }

                const { fullMatch, promptText: ph } = placeholders[i];
                setAutoPilotLogs(prev => [...prev, `⏳ Đang vẽ & đóng dấu logo ảnh ${i + 1}/${placeholders.length}: ${ph.substring(0, 30)}...`]);

                try {
                    const imgRes = await callAiApi({
                        action: 'generate-image',
                        payload: {
                            prompt: ph,
                            model: 'gptimage',
                            modelName: taskModels.imagePrompt,
                            textModel: taskModels.writer || taskModels.meta || 'ag/gemini-3.6-flash-high'
                        }
                    });

                    if (!imgRes.ok) {
                        let errText = `Lỗi (${imgRes.status})`;
                        try {
                            const errJson = await imgRes.json();
                            errText = errJson.error || errText;
                        } catch { /* skip */ }
                        throw new Error(errText);
                    }
                    const blob = await imgRes.blob();

                    // Apply Store Watermark (Logo image or store name badge fallback)
                    const optimizeResponse = await optimizeImage(
                        new File([blob], `ai_${Date.now()}.webp`, { type: 'image/webp' }),
                        1200,
                        800,
                        0.8,
                        { logoUrl: storeLogoUrl, storeName }
                    );
                    const optimized = optimizeResponse.file;
                    const storagePath = `media/${Date.now()}_ai_img_${i}.webp`;
                    const storage = await getStorageInstance();
                    const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                    const storageRef = ref(storage, storagePath);

                    await uploadBytes(storageRef, await optimized.arrayBuffer(), { contentType: 'image/webp' });
                    const finalUrl = await getDownloadURL(storageRef);

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
                    tempContent = tempContent.replace(fullMatch, imgHtml);

                    // Auto-set Article Thumbnail from the first AI image generated
                    setFormData(prev => {
                        const updated = { ...prev, content: tempContent };
                        if (!updated.thumbnail) {
                            updated.thumbnail = finalUrl;
                        }
                        return updated;
                    });

                    setAutoPilotLogs(prev => [...prev, `✓ Đã tạo thành công & gắn Watermark logo cho ảnh số ${i + 1}!`]);
                    if (i === 0) {
                        setAutoPilotLogs(prev => [...prev, `🖼️ Tự động gán ảnh AI này làm Ảnh Thumbnail cho bài viết!`]);
                    }

                } catch (e) {
                    console.error(e);
                    const errMsg = e instanceof Error ? e.message : String(e);
                    setAutoPilotLogs(prev => [...prev, `⚠️ Lỗi ảnh ${i + 1} (${ph.substring(0, 20)}...): ${errMsg}`]);
                }
            }
        }
        setAutoPilotState('idle');
        return tempContent;
    };

    const runAutoPilot = async (resumeFromStep?: 'refine' | 'images' | 'links') => {
        // Save active config before running
        updateAndSaveAiConfig(providerMode, cloudApiKey, cloudBaseUrl, taskModels);

        let effectiveStep = resumeFromStep;
        // Intelligent State Detection: If draft content already exists in form state, detect where we left off!
        if (!effectiveStep && formData.content && formData.content.trim().length > 100 && !autoPilotTopic.trim()) {
            const hasPlaceholders = /\[(?:IMAGE_PROMPT|CHÈN\s+(?:HÌNH\s*)?[ẢÁA]NH):\s*(.*?)\]/i.test(formData.content);
            if (hasPlaceholders) {
                effectiveStep = 'images';
                setAutoPilotLogs(["🔍 Tự động phát hiện bài viết nháp hiện tại còn thẻ ảnh. Tự động nối tiếp Bước 4 (Vẽ ảnh) & Bước 5 (Ghép link)..."]);
            } else {
                effectiveStep = 'refine';
                setAutoPilotLogs(["🔍 Tự động phát hiện bài viết nháp hiện tại. Tự động nối tiếp Bước 3 (Sửa SEO), Bước 4 & Bước 5..."]);
            }
        } else if (!effectiveStep && !autoPilotTopic.trim()) {
            toastError("Vui lòng nhập chủ đề Auto-Pilot!");
            return;
        } else if (!effectiveStep) {
            setAutoPilotLogs(["Khởi động Auto-Pilot..."]);
        } else {
            setAutoPilotLogs(prev => [...prev, `▶️ Tự động nối tiếp Auto-Pilot từ Bước ${effectiveStep === 'refine' ? '3 (Sửa SEO ➔ Vẽ ảnh ➔ Ghép link)' : effectiveStep === 'images' ? '4 (Vẽ ảnh ➔ Ghép link)' : '5 (Ghép link nội bộ)'}...`]);
        }

        setAutoPilotState(effectiveStep || 'meta');

        try {
            let newTitle = formData.title || autoPilotTopic;
            let newDesc = formData.excerpt || '';
            let newTags = formData.tags || '';
            let contentStr = formData.content || '';

            // STEP 0 - 2: Only run if NOT resuming from Step 3/4/5
            if (!effectiveStep) {
                // STEP 0: CONNECTION CHECK
                setAutoPilotLogs(prev => [...prev, `Bước 0: Kiểm tra kết nối AI API (${providerMode === 'cloud9router' ? '9router Cloud' : 'Ollama Local'})...`]);
                try {
                    const connRes = await callAiApi({
                        action: 'check-connection',
                        payload: {}
                    });
                    const connData = await connRes.json();
                    if (!connRes.ok || !connData.ok) {
                        throw new Error(connData.error || "Kết nối API thất bại.");
                    }
                    setAutoPilotLogs(prev => [...prev, "✓ Kết nối AI Engine ổn định!"]);
                } catch (connErr) {
                    setAutoPilotLogs(prev => [...prev, `⚠️ Cảnh báo kết nối: ${(connErr as Error).message}. Đang thử tiếp tục...`]);
                }

                // STEP 1: META GENERATION
                setAutoPilotLogs(prev => [...prev, `Bước 1: Phân tích SEO & Viết Tiêu đề, Tags, Mô tả (Model: ${taskModels.meta})...`]);
                try {
                    const metaRes = await callAiApi({
                        action: 'seo-suggest',
                        payload: {
                            content: autoPilotTopic,
                            model: taskModels.meta
                        }
                    });
                    if (metaRes.ok) {
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

                        newTitle = titleMatch ? titleMatch[1].trim() : autoPilotTopic;
                        newDesc = descMatch ? descMatch[1].trim() : '';
                        newTags = tagsMatch ? tagsMatch[1].trim() : '';

                        setFormData(prev => ({
                            ...prev,
                            title: newTitle,
                            excerpt: newDesc,
                            tags: newTags
                        }));

                        setAutoPilotLogs(prev => [...prev, "✓ Đã tạo xong Tiêu đề, Tags và Mô tả ngắn!"]);
                    } else {
                        setAutoPilotLogs(prev => [...prev, "⚠️ Không tạo được Meta tự động, dùng tên chủ đề làm tiêu đề."]);
                    }
                } catch (metaErr) {
                    console.warn('Meta generation step skipped:', metaErr);
                    setAutoPilotLogs(prev => [...prev, "⚠️ Bước 1 gặp sự cố, tự động bỏ qua để chuyển sang Bước 2 viết bài."]);
                }

                // STEP 2: CONTENT GENERATION
                setAutoPilotState('content');
                setAutoPilotLogs(prev => [...prev, `Bước 2: Viết nội dung chuẩn SEO EEAT (Model: ${taskModels.writer})...`]);

                const contentRes = await callAiApi({
                    action: 'content-suggest',
                    payload: {
                        title: newTitle,
                        excerpt: newDesc,
                        tags: newTags,
                        content: autoPilotTopic,
                        model: taskModels.writer
                    }
                });
                if (!contentRes.ok) throw new Error("Lỗi kết nối AI khi viết bài ở Bước 2.");
                const contentReader = contentRes.body?.getReader();
                const contentDecoder = new TextDecoder();
                contentStr = '';
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
            }

            // STEP 3: AUTO-REFINE LOOP (Only if full run or effectiveStep === 'refine')
            if (!effectiveStep || effectiveStep === 'refine') {
                setAutoPilotState('refine');
                setAutoPilotLogs(prev => [...prev, `Bước 3: 🔄 Tự động kiểm tra & sửa SEO (Model Chấm/Sửa: ${taskModels.refiner})...`]);

                try {
                    const refineRes = await callAiApi({
                        action: 'auto-refine',
                        payload: {
                            title: newTitle,
                            excerpt: newDesc,
                            tags: newTags,
                            content: contentStr,
                            targetScore: 85,
                            maxRounds: 2,
                            model: taskModels.refiner
                        }
                    });

                    if (!refineRes.ok) {
                        let errDetail = '';
                        try {
                            const errJson = await refineRes.json();
                            errDetail = errJson.error || '';
                        } catch { /* skip */ }
                        setAutoPilotLogs(prev => [...prev, `⚠️ Bước 3 gián đoạn kết nối (${refineRes.status}${errDetail ? `: ${errDetail}` : ''}). Tự động giữ bài viết ở Bước 2 và TỰ ĐỘNG CHUYỂN SANG BƯỚC 4 (VẼ ẢNH)...`]);
                    } else {
                        const refineReader = refineRes.body?.getReader();
                        const refineDecoder = new TextDecoder();
                        let refineBuffer = '';
                        let refinedContent = contentStr;

                        while (true) {
                            const { done, value } = (await refineReader?.read()) || { done: true, value: undefined };
                            if (done) break;
                            refineBuffer += refineDecoder.decode(value, { stream: true });

                            const lines = refineBuffer.split('\n');
                            refineBuffer = lines.pop() || '';

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
                                } catch { /* skip */ }
                            }
                        }
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
                    }
                } catch (refineErr) {
                    console.warn('Auto refine step skipped:', refineErr);
                    setAutoPilotLogs(prev => [...prev, "⚠️ Bước 3 bị quá thời gian Tunnel (Timeout). Tự động giữ bài viết ở Bước 2 và TỰ ĐỘNG CHUYỂN SANG BƯỚC 4 (VẼ ẢNH)..."]);
                }
            }

            // STEP 4: IMAGE GENERATION (Only if full run, 'refine', or 'images')
            let tempContent = contentStr;
            if (!effectiveStep || effectiveStep === 'refine' || effectiveStep === 'images') {
                try {
                    tempContent = await runImageGenerationStep(contentStr);
                } catch (imgErr) {
                    console.warn('Image step error:', imgErr);
                    setAutoPilotLogs(prev => [...prev, `⚠️ Bước 4 gặp sự cố ảnh. Tự động chuyển tiếp sang Bước 5 (Ghép link)...`]);
                }
            }

            // STEP 5: AUTOMATIC INTERNAL LINK RESOLVER (Always runs to finish)
            setAutoPilotLogs(prev => [...prev, "Bước 5: Quét & tự động ghép Link Nội Bộ từ dữ liệu web..."]);
            try {
                const { updatedHtml, resolvedCount, logs: linkLogs } = await resolveInternalLinkPlaceholdersInHtml(tempContent);
                if (resolvedCount > 0) {
                    tempContent = updatedHtml;
                    setFormData(prev => ({ ...prev, content: updatedHtml }));
                    setAutoPilotLogs(prev => [...prev, ...linkLogs]);
                    setAutoPilotLogs(prev => [...prev, `✓ Đã tự động chèn ${resolvedCount} link nội bộ chuẩn SEO!`]);
                } else {
                    setAutoPilotLogs(prev => [...prev, "ℹ️ Bài viết chưa có placeholder link nội bộ."]);
                }
            } catch (linkErr) {
                console.warn('Internal link resolution error:', linkErr);
            }

            // Fallback: If thumbnail is still empty, scan HTML content and select first image as thumbnail
            setFormData(prev => {
                if (!prev.thumbnail && tempContent) {
                    const imgMatch = tempContent.match(/<img[^>]+src=["']([^"']+)["']/i);
                    if (imgMatch && imgMatch[1]) {
                        setAutoPilotLogs(l => [...l, `🖼️ Tự động gán ảnh từ bài viết làm Thumbnail!`]);
                        return { ...prev, thumbnail: imgMatch[1] };
                    }
                }
                return prev;
            });

            setAutoPilotLogs(prev => [...prev, "🎉 XONG! Bài viết đã hoàn thiện 100% tự động!"]);
            setAutoPilotState('done');

        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            setAutoPilotLogs(prev => [...prev, `❌ Lỗi: ${errorMessage}`]);
            setAutoPilotState('done');
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
                    content: plainTextContent,
                    model: type === 'check' ? taskModels.inspector : type === 'suggest' ? taskModels.meta : taskModels.writer
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
            toastError('Lỗi khi phân tích bằng AI.');
        } finally {
            setIsCheckingSeo(false);
        }
    };

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
                    maxRounds: 3,
                    model: taskModels.refiner
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

    const [isLinkingInternal, setIsLinkingInternal] = useState(false);

    const handleAutoLinkInternal = async () => {
        if (!formData.content) {
            toastError('Vui lòng viết hoặc dán nội dung bài viết trước khi ghép link!');
            return;
        }
        setIsLinkingInternal(true);
        try {
            const { updatedHtml, resolvedCount, logs } = await resolveInternalLinkPlaceholdersInHtml(formData.content);
            if (resolvedCount > 0) {
                setFormData(prev => ({ ...prev, content: updatedHtml }));
                toastSuccess(`Đã tự động ghép ${resolvedCount} link nội bộ chuẩn SEO!`);
                setAutoPilotLogs(prev => [...prev, ...logs]);
            } else {
                toastInfo('Không tìm thấy placeholder [GỢI Ý LIÊN KẾT: ...] trong bài viết.');
            }
        } catch (e) {
            toastError('Lỗi khi ghép link nội bộ: ' + (e as Error).message);
        } finally {
            setIsLinkingInternal(false);
        }
    };

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const calculateHash = async (f: File): Promise<string> => {
                const arrayBuffer = await f.arrayBuffer();
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
            };

            const hash = await calculateHash(file);
            const docId = `MED-articles-${hash}`;
            const { getDoc, doc, updateDoc } = await import('firebase/firestore');
            const mediaDocRef = doc(db, 'media_library', docId);
            const mediaDocSnap = await getDoc(mediaDocRef);

            if (mediaDocSnap.exists()) {
                const existingUrl = mediaDocSnap.data().url;
                await updateDoc(mediaDocRef, {
                    createdAt: serverTimestamp(),
                });
                setFormData(prev => ({ ...prev, thumbnail: existingUrl }));
                setUploading(false);
                return;
            }

            const { file: optimized, width, height } = await optimizeImage(file, 1200, 800, 0.8);
            const storagePath = `media/articles/${hash}.webp`;
            const storage = await getStorageInstance();
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storageRef = ref(storage, storagePath);

            const buffer = await optimized.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            await uploadBytes(storageRef, bytes, { contentType: 'image/webp' });
            const url = await getDownloadURL(storageRef);

            await setDoc(mediaDocRef, {
                url,
                path: storagePath,
                name: optimized.name,
                type: 'image/webp',
                size: optimized.size,
                width,
                height,
                folder: 'articles',
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

        if (formData.status === 'scheduled') {
            if (!formData.scheduledAt) {
                toastError('Vui lòng chọn ngày giờ đăng bài!');
                return;
            }
            const scheduledDate = new Date(formData.scheduledAt);
            if (isNaN(scheduledDate.getTime())) {
                toastError('Ngày giờ đăng bài không hợp lệ!');
                return;
            }
        }

        setSaving(true);
        try {
            const processedContent = await processBase64Images(formData.content);

            const payload: Record<string, unknown> = {
                title: formData.title.trim(),
                type: formData.type,
                status: formData.status,
                content: processedContent,
                excerpt: formData.excerpt.trim() || '',
                thumbnail: formData.thumbnail || '',
                videoEmbedUrl: formData.videoEmbedUrl.trim() || '',
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
                updatedAt: serverTimestamp(),
            };

            if (formData.status === 'scheduled') {
                const scheduledDate = new Date(formData.scheduledAt);
                if (scheduledDate.getTime() <= Date.now()) {
                    payload.status = 'published';
                    if (!article || article.status !== 'published') {
                        payload.publishedAt = serverTimestamp();
                    }
                    payload.scheduledAt = deleteField();
                    toastInfo('Thời gian hẹn đã qua, bài viết đã được đăng ngay!');
                } else {
                    payload.scheduledAt = Timestamp.fromDate(scheduledDate);
                }
            } else if (formData.status === 'published') {
                if (!article || article.status !== 'published') {
                    payload.publishedAt = serverTimestamp();
                }
                payload.scheduledAt = deleteField();
            } else {
                payload.scheduledAt = deleteField();
            }

            if (article) {
                await updateDoc(doc(db, 'articles', article.id), payload);
                await triggerRevalidate(['/', `/tin-tuc/${article.id}`, '/tin-tuc', '/sitemap.xml'], ['articles']);
            } else {
                payload.views = 0;
                payload.createdAt = serverTimestamp();

                // Clean up deleteField() sentinels when creating a new document with setDoc()
                Object.keys(payload).forEach(key => {
                    if (payload[key] === deleteField()) {
                        delete payload[key];
                    }
                });

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
            className="!max-w-full lg:!max-w-6xl xl:!max-w-[1350px] lg:!h-[90vh]"
            contentClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
            priority="high"
        >
            <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-3.5 border-b shrink-0 bg-white sticky top-0 md:rounded-t-2xl z-10">
                <h2 className="text-lg md:text-xl font-bold">{article ? 'Sửa bài viết' : 'Thêm bài viết mới'}</h2>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleSeoMagic('check')}
                        disabled={isCheckingSeo || isRefining}
                        className="text-xs md:text-sm bg-blue-50 text-blue-600 font-medium px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {isCheckingSeo ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} />}
                        <span className="hidden md:inline">Chấm bài SEO</span>
                        <span className="md:hidden">Chấm SEO</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleAutoRefine}
                        disabled={isRefining || isCheckingSeo}
                        className="text-xs md:text-sm bg-emerald-50 text-emerald-700 font-medium px-3 py-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {isRefining ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        <span className="hidden md:inline">Tự sửa SEO</span>
                        <span className="md:hidden">Sửa SEO</span>
                    </button>

                    <button title="Đóng" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div className="p-3 md:p-5 flex-1 min-h-0 overflow-hidden flex flex-col justify-between">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-hidden">
                    {/* LEFT COLUMN: Metadata & Settings */}
                    <div className="lg:col-span-5 overflow-y-auto pr-1 space-y-3.5 h-full max-h-[calc(90vh-140px)] lg:max-h-none">
                        {/* --- AUTO PILOT BANNER --- */}
                        <div className="bg-gradient-to-r from-indigo-50 text-indigo-900 border border-indigo-200 rounded-xl p-4 shadow-sm animate-in fade-in zoom-in-95">
                            <div className="flex items-center justify-between mb-1.5">
                                <h3 className="font-bold flex items-center gap-2 text-base">
                                    <span className="bg-indigo-600 text-white p-1 rounded-md"><Wand2 size={16} /></span>
                                    Auto-Pilot 1-Touch
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAiConfigPanel(!showAiConfigPanel);
                                        if (!showAiConfigPanel && providerMode === 'ollama' && localModels.length === 0) {
                                            fetchLocalModels();
                                        }
                                    }}
                                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 transition-colors ${showAiConfigPanel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'}`}
                                >
                                    <Settings size={13} />
                                    <span>⚙️ Ma trận AI</span>
                                </button>
                            </div>

                            <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
                                Tự động sinh Meta chuẩn SEO, Content chuyên sâu EEAT và ghép Ảnh minh hoạ.
                            </p>

                            {/* --- AI CONFIG MATRIX PANEL --- */}
                            {showAiConfigPanel && (
                                <div className="mb-3.5 bg-white/90 border border-indigo-200 rounded-xl p-3 space-y-3 text-xs shadow-inner animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between border-b pb-2">
                                        <span className="font-bold text-indigo-950">Nguồn AI Engine:</span>
                                        <div className="flex items-center gap-3">
                                            <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                                                <input
                                                    type="radio"
                                                    name="providerMode"
                                                    value="ollama"
                                                    checked={providerMode === 'ollama'}
                                                    onChange={() => {
                                                        setProviderMode('ollama');
                                                        if (localModels.length === 0) fetchLocalModels();
                                                    }}
                                                    className="accent-indigo-600"
                                                />
                                                <span>🖥️ Ollama Local</span>
                                            </label>
                                            <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                                                <input
                                                    type="radio"
                                                    name="providerMode"
                                                    value="cloud9router"
                                                    checked={providerMode === 'cloud9router'}
                                                    onChange={() => {
                                                        setProviderMode('cloud9router');
                                                        if (taskModels.writer === DEFAULT_AI_CONFIG.taskModels.writer) {
                                                            setTaskModels(DEFAULT_9ROUTER_MODELS);
                                                        }
                                                    }}
                                                    className="accent-indigo-600"
                                                />
                                                <span>☁️ 9router / Cloud API</span>
                                            </label>
                                        </div>
                                    </div>

                                    {providerMode === 'cloud9router' && (
                                        <div className="space-y-2 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                                            <div>
                                                <label className="block text-[11px] font-semibold text-indigo-900 mb-1">9router API Key <span className="text-red-500">*</span></label>
                                                <input
                                                    type="password"
                                                    placeholder="Nhập API Key 9router..."
                                                    value={cloudApiKey}
                                                    onChange={(e) => setCloudApiKey(e.target.value)}
                                                    className="w-full h-8 px-2.5 border rounded border-indigo-200 bg-white text-xs focus:outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-semibold text-indigo-900 mb-1">Base URL Gateway</label>
                                                <input
                                                    type="text"
                                                    placeholder="https://api.9router.com/v1"
                                                    value={cloudBaseUrl}
                                                    onChange={(e) => setCloudBaseUrl(e.target.value)}
                                                    className="w-full h-8 px-2.5 border rounded border-indigo-200 bg-white text-xs focus:outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {providerMode === 'ollama' && (
                                        <div className="flex items-center justify-between bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                                            <span className="text-[11px] text-indigo-800">Cục bộ: http://localhost:11434</span>
                                            <button
                                                type="button"
                                                onClick={fetchLocalModels}
                                                disabled={isLoadingLocalModels}
                                                className="text-[11px] bg-white border border-indigo-200 px-2 py-0.5 rounded text-indigo-700 hover:bg-indigo-50 flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {isLoadingLocalModels ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                                Quét Model Local
                                            </button>
                                        </div>
                                    )}

                                    {/* --- DYNAMIC TASK MODEL MATRIX --- */}
                                    <div className="space-y-2 pt-1 border-t">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-[11px] text-indigo-950">Ma trận gán Model theo Tác vụ:</span>
                                            {providerMode === 'cloud9router' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setTaskModels(DEFAULT_9ROUTER_MODELS)}
                                                    className="text-[10px] text-indigo-600 hover:underline"
                                                >
                                                    Tải mẫu 9router
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-2">
                                            {/* Meta Task */}
                                            <div className="flex items-center gap-2">
                                                <span className="w-24 shrink-0 font-medium text-[11px] text-indigo-900">📌 1. Sinh Meta:</span>
                                                {providerMode === 'ollama' && localModels.length > 0 ? (
                                                    <select
                                                        value={taskModels.meta}
                                                        onChange={(e) => setTaskModels({ ...taskModels, meta: e.target.value })}
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    >
                                                        {localModels.map((m) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={taskModels.meta}
                                                        onChange={(e) => setTaskModels({ ...taskModels, meta: e.target.value })}
                                                        placeholder="Model tên (vd: gpt-4o-mini)"
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    />
                                                )}
                                            </div>

                                            {/* Writer Task */}
                                            <div className="flex items-center gap-2">
                                                <span className="w-24 shrink-0 font-medium text-[11px] text-indigo-900">✍️ 2. Viết Content:</span>
                                                {providerMode === 'ollama' && localModels.length > 0 ? (
                                                    <select
                                                        value={taskModels.writer}
                                                        onChange={(e) => setTaskModels({ ...taskModels, writer: e.target.value })}
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    >
                                                        {localModels.map((m) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={taskModels.writer}
                                                        onChange={(e) => setTaskModels({ ...taskModels, writer: e.target.value })}
                                                        placeholder="Model tên (vd: gpt-4o-mini / claude-3-5-sonnet)"
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    />
                                                )}
                                            </div>

                                            {/* Inspector Task */}
                                            <div className="flex items-center gap-2">
                                                <span className="w-24 shrink-0 font-medium text-[11px] text-indigo-900">🔍 3. Chấm SEO:</span>
                                                {providerMode === 'ollama' && localModels.length > 0 ? (
                                                    <select
                                                        value={taskModels.inspector}
                                                        onChange={(e) => setTaskModels({ ...taskModels, inspector: e.target.value })}
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    >
                                                        {localModels.map((m) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={taskModels.inspector}
                                                        onChange={(e) => setTaskModels({ ...taskModels, inspector: e.target.value })}
                                                        placeholder="Model tên (vd: deepseek-chat / gpt-4o)"
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    />
                                                )}
                                            </div>

                                            {/* Refine Task */}
                                            <div className="flex items-center gap-2">
                                                <span className="w-24 shrink-0 font-medium text-[11px] text-indigo-900">🔄 4. Tự Sửa SEO:</span>
                                                {providerMode === 'ollama' && localModels.length > 0 ? (
                                                    <select
                                                        value={taskModels.refiner}
                                                        onChange={(e) => setTaskModels({ ...taskModels, refiner: e.target.value })}
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    >
                                                        {localModels.map((m) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={taskModels.refiner}
                                                        onChange={(e) => setTaskModels({ ...taskModels, refiner: e.target.value })}
                                                        placeholder="Model tên (vd: deepseek-chat)"
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    />
                                                )}
                                            </div>

                                            {/* Image Prompt Task */}
                                            <div className="flex items-center gap-2">
                                                <span className="w-24 shrink-0 font-medium text-[11px] text-indigo-900">🎨 5. Prompt Ảnh:</span>
                                                {providerMode === 'ollama' && localModels.length > 0 ? (
                                                    <select
                                                        value={taskModels.imagePrompt}
                                                        onChange={(e) => setTaskModels({ ...taskModels, imagePrompt: e.target.value })}
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    >
                                                        {localModels.map((m) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={taskModels.imagePrompt}
                                                        onChange={(e) => setTaskModels({ ...taskModels, imagePrompt: e.target.value })}
                                                        placeholder="Model tên (vd: gpt-4o-mini)"
                                                        className="flex-1 h-7 px-2 border rounded border-indigo-200 text-xs bg-white"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="flex-1 flex flex-col gap-1.5">
                                    <input
                                        type="text"
                                        placeholder="Từ khóa chính / ý tưởng (vd: Tủ lạnh giá rẻ)..."
                                        value={autoPilotTopic}
                                        onChange={(e) => setAutoPilotTopic(e.target.value)}
                                        disabled={autoPilotState !== 'idle' && autoPilotState !== 'done'}
                                        className="w-full h-9 px-3 border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 text-xs"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => runAutoPilot()}
                                    disabled={autoPilotState !== 'idle' && autoPilotState !== 'done'}
                                    className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-transform flex items-center justify-center gap-1.5 text-xs shrink-0 disabled:opacity-50 shadow-sm"
                                >
                                    {autoPilotState !== 'idle' && autoPilotState !== 'done' ? (
                                        <><Loader2 size={14} className="animate-spin" /> Đang chạy Auto-Pilot...</>
                                    ) : (
                                        <><Wand2 size={14} /> Auto-Pilot 1-Touch</>
                                    )}
                                </button>
                            </div>

                            {autoPilotLogs.length > 0 && (
                                <div className="mt-3 bg-indigo-950/90 rounded-lg p-2.5 max-h-32 overflow-y-auto font-mono text-[11px] text-indigo-200 space-y-1 shadow-inner">
                                    {autoPilotLogs.map((log, idx) => (
                                        <div key={idx} className="flex items-start gap-1.5">
                                            <span className="text-indigo-500">{'>'}</span> {log}
                                        </div>
                                    ))}
                                    {autoPilotState !== 'idle' && autoPilotState !== 'done' && (
                                        <div className="flex items-center gap-1.5 text-indigo-400 ml-1 mt-1">
                                            <Loader2 size={10} className="animate-spin" /> ...
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SEO Checker Panel */}
                        {(seoResult.content || isCheckingSeo) && seoResult.type === 'check' && (
                            <div className="border rounded-xl p-3.5 relative shrink-0 bg-blue-50/70 border-blue-200 animate-in fade-in zoom-in-95">
                                <div className="flex justify-between items-center mb-2 border-b pb-1.5 border-blue-100/50">
                                    <h3 className="font-bold flex items-center gap-1.5 text-xs text-blue-900">
                                        <Star size={15} className="text-blue-500" /> Báo cáo chuẩn SEO ({providerMode === 'cloud9router' ? '9router Cloud' : 'Ollama Local'})
                                        {isCheckingSeo && <Loader2 size={13} className="animate-spin text-blue-500" />}
                                    </h3>
                                    <button title="Đóng" type="button" onClick={() => setSeoResult({ type: '', content: '' })} className="p-1 rounded text-blue-400 hover:bg-blue-100">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="text-xs leading-relaxed font-medium text-blue-950 max-h-48 overflow-y-auto pr-1">
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
                                    {isCheckingSeo && <span className="inline-block w-2 h-3 animate-pulse ml-1 align-middle bg-blue-500"></span>}
                                </div>
                            </div>
                        )}

                        {/* Auto-Refine Progress Panel */}
                        {(isRefining || refineProgress.length > 0) && seoResult.type === 'refine' && (
                            <div className="border rounded-xl p-3.5 relative shrink-0 bg-emerald-50/70 border-emerald-200 animate-in fade-in zoom-in-95">
                                <div className="flex justify-between items-center mb-2 border-b pb-1.5 border-emerald-100/50">
                                    <h3 className="font-bold flex items-center gap-1.5 text-xs text-emerald-900">
                                        <RefreshCw size={15} className={isRefining ? 'animate-spin text-emerald-500' : 'text-emerald-500'} />
                                        Tự động sửa SEO (Vòng lặp thông minh)
                                        {isRefining && <Loader2 size={13} className="animate-spin text-emerald-500" />}
                                    </h3>
                                    {!isRefining && (
                                        <button title="Đóng" type="button" onClick={() => { setSeoResult({ type: '', content: '' }); setRefineProgress([]); }} className="p-1 rounded text-emerald-400 hover:bg-emerald-100">
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="bg-emerald-950/90 rounded-lg p-2.5 max-h-40 overflow-y-auto font-mono text-[11px] text-emerald-200 space-y-1 shadow-inner">
                                    {refineProgress.map((log, idx) => (
                                        <div key={idx} className="flex items-start gap-1.5">
                                            <span className="text-emerald-500 shrink-0">{'>'}</span>
                                            <span>{log}</span>
                                        </div>
                                    ))}
                                    {isRefining && (
                                        <div className="flex items-center gap-1.5 text-emerald-400 ml-1 mt-1">
                                            <Loader2 size={10} className="animate-spin" /> Đang xử lý...
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Title */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Tiêu đề <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className="w-full h-10 px-3 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="Nhập tiêu đề bài viết..."
                            />
                        </div>

                        {/* Excerpt */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Mô tả ngắn (SEO Meta Description)</label>
                            <textarea
                                value={formData.excerpt}
                                onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                                className="w-full h-16 p-2.5 text-xs border rounded-lg focus:border-orange-500 focus:outline-none resize-none"
                                placeholder="Mô tả ngắn gọn nội dung bài viết (dưới 155 ký tự)..."
                            />
                        </div>

                        {/* Thumbnail */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Ảnh thumbnail</label>
                            <div className="flex items-center gap-3">
                                {formData.thumbnail ? (
                                    <div className="relative w-20 h-14 rounded-lg overflow-hidden border shrink-0">
                                        <Image src={formData.thumbnail} alt="" fill className="object-cover" />
                                        <button
                                            title="Xóa ảnh thumbnail"
                                            onClick={() => setFormData({ ...formData, thumbnail: '' })}
                                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-20 h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 shrink-0">
                                        <ImageIcon size={18} />
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        title="Chọn ảnh thumbnail"
                                        onClick={() => fileRef.current?.click()}
                                        disabled={uploading}
                                        className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                        {uploading ? 'Đang tải...' : 'Tải ảnh'}
                                    </button>
                                    <button
                                        type="button"
                                        title="Chọn ảnh từ thư viện"
                                        onClick={() => setMediaPickerOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 transition-colors"
                                    >
                                        <ImageIcon size={14} />
                                        Thư viện
                                    </button>
                                </div>
                                <input ref={fileRef} type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" title="Chọn ảnh thumbnail" />
                            </div>
                            <MediaManager
                                isOpen={mediaPickerOpen}
                                onClose={() => setMediaPickerOpen(false)}
                                onSelect={(url) => setFormData({ ...formData, thumbnail: url })}
                                title="Chọn ảnh thumbnail"
                                defaultFolder="articles"
                            />
                        </div>

                        {/* Type + Status */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Loại bài</label>
                                <select
                                    title="Chọn loại bài"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full h-9 px-3 text-xs border rounded-lg focus:border-orange-500 focus:outline-none"
                                >
                                    <option value="News">Tin tức</option>
                                    <option value="Promo">Khuyến mãi</option>
                                    <option value="Tips">Mẹo hay</option>
                                    <option value="Training">Đào Tạo</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Trạng thái</label>
                                <select
                                    title="Chọn trạng thái"
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full h-9 px-3 text-xs border rounded-lg focus:border-orange-500 focus:outline-none"
                                >
                                    <option value="draft">Bản nháp</option>
                                    <option value="published">Đăng ngay</option>
                                    <option value="scheduled">Hẹn giờ đăng bài</option>
                                </select>
                            </div>
                        </div>

                        {formData.status === 'scheduled' && (
                            <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-lg space-y-1">
                                <label className="block text-xs font-semibold text-amber-800 flex items-center gap-1">
                                    <Clock size={13} className="text-amber-600" />
                                    Ngày giờ đăng bài tự động
                                </label>
                                <input
                                    type="datetime-local"
                                    title="Chọn ngày giờ hẹn đăng"
                                    value={formData.scheduledAt}
                                    onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                                    className="w-full h-9 px-3 text-xs border border-amber-300 bg-white rounded-lg focus:border-amber-500 focus:outline-none text-gray-800"
                                    min={formatDateTimeLocal(new Date())}
                                />
                                <p className="text-[11px] text-amber-700">Bài viết sẽ tự động hiển thị công khai khi đến thời điểm này.</p>
                            </div>
                        )}

                        {/* Video Embed URL */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                <Video size={13} className="inline mr-1 text-purple-500" />
                                Video nổi bật (YouTube / Facebook URL)
                            </label>
                            <input
                                type="url"
                                title="Nhập URL video"
                                value={formData.videoEmbedUrl}
                                onChange={(e) => setFormData({ ...formData, videoEmbedUrl: e.target.value })}
                                className="w-full h-9 px-3 text-xs border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="VD: https://www.youtube.com/watch?v=..."
                            />
                        </div>

                        {/* Tags */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Tags (cách nhau bằng dấu phẩy)</label>
                            <input
                                type="text"
                                title="Nhập tags"
                                value={formData.tags}
                                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                                className="w-full h-9 px-3 text-xs border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="VD: iPhone, khuyến mãi, mẹo hay"
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Rich Text Content Editor */}
                    <div className="lg:col-span-7 flex flex-col flex-1 min-h-0 h-full overflow-hidden space-y-1.5">
                        <div className="flex justify-between items-end shrink-0">
                            <label className="block text-xs font-semibold text-gray-700">Nội dung bài viết <span className="text-red-500">*</span></label>
                        </div>

                        <div
                            className="border rounded-lg bg-white shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden [&_.quill]:flex-1 [&_.quill]:min-h-0 [&_.quill]:flex [&_.quill]:flex-col [&_.quill]:overflow-hidden [&_.ql-toolbar]:shrink-0 [&_.ql-toolbar]:bg-white [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-t-0 [&_.ql-toolbar]:border-x-0 [&_.ql-toolbar]:rounded-t-lg [&_.ql-container]:flex-1 [&_.ql-container]:min-h-0 [&_.ql-container]:flex [&_.ql-container]:flex-col [&_.ql-container]:overflow-y-auto [&_.ql-container]:border-0 [&_.ql-editor]:flex-1 [&_.ql-editor]:min-h-full [&_.ql-editor]:p-4 [&_.ql-editor_img]:max-w-full [&_.ql-editor_img]:h-auto [&_.ql-editor_img]:rounded-lg"
                            onPasteCapture={handlePasteCapture}
                        >
                            <ReactQuill
                                ref={quillRef}
                                theme="snow"
                                value={formData.content}
                                onChange={(val: string) => setFormData(prev => ({ ...prev, content: val }))}
                                modules={quillModules}
                                formats={quillFormats}
                                placeholder="Viết nội dung bài viết ở đây..."
                            />
                        </div>
                    </div>
                </div>

                {/* Actions Bar */}
                <div className="flex gap-3 pt-3 border-t shrink-0 bg-white mt-3">
                    <button
                        type="button"
                        title="Đóng"
                        onClick={onClose}
                        className="flex-1 py-2.5 border rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm"
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
                        {article ? 'Cập nhật' : formData.status === 'scheduled' ? 'Lên lịch đăng' : 'Đăng bài'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export { ArticleEditorModal as ArticleModal };
