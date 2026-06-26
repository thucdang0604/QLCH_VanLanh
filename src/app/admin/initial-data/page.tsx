'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, Building2, Cable, ClipboardList, Copy, FileSpreadsheet, FolderOpen, Image as ImageIcon, Link2, Loader2, Package, ShieldAlert, ShoppingBag, Upload, Users, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import ExcelImportModal, { type ExcelImportMode } from '@/components/admin/ExcelImportModal';
import MediaManager from '@/components/admin/MediaManager';
import { uploadInitialImportImage, type LocalImageUploadFolder } from '@/features/excel-import/importSupport';

interface ImportOption {
    mode: ExcelImportMode;
    title: string;
    description: string;
    icon: typeof Package;
    accent: string;
    columns: string;
}

const IMPORT_OPTIONS: ImportOption[] = [
    {
        mode: 'product',
        title: 'Sản phẩm bán lẻ',
        description: 'Máy mới, máy cũ, hàng bán trực tiếp trên web và POS.',
        icon: Package,
        accent: 'text-orange-600 bg-orange-50 border-orange-200',
        columns: 'giá, vốn, tồn kho, tình trạng, ảnh, specs, series',
    },
    {
        mode: 'accessory',
        title: 'Phụ kiện',
        description: 'Ốp lưng, cáp sạc, tai nghe, pin dự phòng và phụ kiện bảo hành.',
        icon: Cable,
        accent: 'text-sky-600 bg-sky-50 border-sky-200',
        columns: 'giá, vốn, tồn kho, ảnh, mã PK, bảo hành',
    },
    {
        mode: 'part',
        title: 'Linh kiện',
        description: 'Kho linh kiện sửa chữa, có loại linh kiện để tính bảo hành.',
        icon: Wrench,
        accent: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        columns: 'giá vốn, giá bán, NCC, tồn kho, chất lượng, partType',
    },
    {
        mode: 'service',
        title: 'Dịch vụ',
        description: 'Bảng giá sửa chữa, thời gian, bảo hành và nội dung SEO.',
        icon: FileSpreadsheet,
        accent: 'text-violet-600 bg-violet-50 border-violet-200',
        columns: 'giá, dòng máy, bảo hành, thời gian, ảnh, tags',
    },
    {
        mode: 'customer',
        title: 'Khách hàng (CRM)',
        description: 'Thông tin liên hệ khách hàng, phân loại, tags và công nợ đầu kỳ.',
        icon: Users,
        accent: 'text-pink-600 bg-pink-50 border-pink-200',
        columns: 'sdt, tên KH, loại KH, email, địa chỉ, công nợ, chi tiêu',
    },
    {
        mode: 'supplier',
        title: 'Nhà cung cấp',
        description: 'Thông tin liên hệ nhà cung cấp, thông tin thanh toán và công nợ đầu kỳ.',
        icon: Building2,
        accent: 'text-teal-600 bg-teal-50 border-teal-200',
        columns: 'tên NCC, sdt, ngân hàng, số tài khoản, hạn thanh toán, công nợ',
    },
    {
        mode: 'order',
        title: 'Đơn hàng lịch sử',
        description: 'Import đơn hàng từ hệ thống cũ để giữ khách hàng, doanh thu, bảo hành và công nợ.',
        icon: ShoppingBag,
        accent: 'text-indigo-600 bg-indigo-50 border-indigo-200',
        columns: 'mã đơn, khách hàng, sản phẩm, tổng tiền, thanh toán, bảo hành',
    },
    {
        mode: 'repair',
        title: 'Phiếu sửa lịch sử',
        description: 'Import phiếu sửa đang tồn đọng hoặc đã hoàn thành để giữ lịch sử máy và bảo hành.',
        icon: ClipboardList,
        accent: 'text-rose-600 bg-rose-50 border-rose-200',
        columns: 'mã phiếu, thiết bị, lỗi, linh kiện, phí sửa, trạng thái, bảo hành',
    },
];

function normalizePreviewImageSource(value: string): { src: string; error: string } {
    const trimmed = value.trim();
    if (!trimmed) return { src: '', error: '' };

    if (/^(file:|[a-zA-Z]:\\|\\\\)/.test(trimmed)) {
        return {
            src: '',
            error: 'Trình duyệt không đọc trực tiếp đường dẫn ổ đĩa. Hãy chọn file local hoặc dùng URL đã upload.',
        };
    }

    if (/^(https?:|blob:|data:)/i.test(trimmed) || trimmed.startsWith('/')) {
        return { src: trimmed, error: '' };
    }

    return { src: `/${trimmed.replace(/^\/+/, '')}`, error: '' };
}

interface UploadedMediaMatch {
    url: string;
    name: string;
    folder?: string;
}

function safeDecodeFileName(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function extractMediaFileName(value: string): string {
    const normalized = value
        .trim()
        .replace(/^file:\/+/i, '')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/([a-zA-Z]:\/)/, '$1');
    return safeDecodeFileName(normalized.split('/').filter(Boolean).pop() || normalized);
}

function normalizeMediaBaseName(value: string): string {
    return extractMediaFileName(value)
        .replace(/\.[^.]+$/, '')
        .trim()
        .toLowerCase();
}

function buildMediaNameCandidates(fileName: string): string[] {
    const extractedName = extractMediaFileName(fileName);
    const baseName = extractedName.replace(/\.[^.]+$/, '');
    return Array.from(new Set([
        extractedName,
        `${baseName}.webp`,
        `${baseName}.jpg`,
        `${baseName}.jpeg`,
        `${baseName}.png`,
    ].filter(Boolean)));
}

function preferMediaMatch(matches: UploadedMediaMatch[]): UploadedMediaMatch | null {
    if (matches.length === 0) return null;
    const folderPriority = new Map([
        ['products', 0],
        ['services', 1],
        ['parts', 2],
        ['general', 3],
    ]);
    return [...matches].sort((left, right) => {
        const leftScore = folderPriority.get(left.folder || '') ?? 10;
        const rightScore = folderPriority.get(right.folder || '') ?? 10;
        return leftScore - rightScore;
    })[0];
}

async function findUploadedMediaByFileName(fileName: string): Promise<UploadedMediaMatch | null> {
    const baseName = normalizeMediaBaseName(fileName);
    if (!baseName) return null;

    const toMatch = (docData: Record<string, unknown>): UploadedMediaMatch | null => {
        const url = typeof docData.url === 'string' ? docData.url : '';
        const name = typeof docData.name === 'string' ? docData.name : '';
        const originalName = typeof docData.originalName === 'string' ? docData.originalName : '';
        const normalizedBaseName = typeof docData.normalizedBaseName === 'string' ? docData.normalizedBaseName : '';
        if (!url || !name) return null;
        const matchesName =
            normalizeMediaBaseName(name) === baseName ||
            normalizeMediaBaseName(originalName) === baseName ||
            normalizedBaseName === baseName;
        if (!matchesName) return null;
        return {
            url,
            name,
            folder: typeof docData.folder === 'string' ? docData.folder : undefined,
        };
    };

    const candidateNames = buildMediaNameCandidates(fileName);
    const directSnapshot = await getDocs(query(
        collection(db, 'media_library'),
        where('name', 'in', candidateNames.slice(0, 10)),
    ));
    const directMatches = directSnapshot.docs
        .map((docSnapshot) => toMatch(docSnapshot.data()))
        .filter((item): item is UploadedMediaMatch => Boolean(item));
    const directMatch = preferMediaMatch(directMatches);
    if (directMatch) return directMatch;

    const normalizedSnapshot = await getDocs(query(
        collection(db, 'media_library'),
        where('normalizedBaseName', '==', baseName),
    ));
    const normalizedMatches = normalizedSnapshot.docs
        .map((docSnapshot) => toMatch(docSnapshot.data()))
        .filter((item): item is UploadedMediaMatch => Boolean(item));
    const normalizedMatch = preferMediaMatch(normalizedMatches);
    if (normalizedMatch) return normalizedMatch;

    const recentSnapshot = await getDocs(query(
        collection(db, 'media_library'),
        orderBy('createdAt', 'desc'),
        limit(300),
    ));
    const recentMatches = recentSnapshot.docs
        .map((docSnapshot) => toMatch(docSnapshot.data()))
        .filter((item): item is UploadedMediaMatch => Boolean(item));
    return preferMediaMatch(recentMatches);
}

interface TestedImage {
    fileName: string;
    url: string;
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string;
    isReused: boolean;
    file?: File;
    localPreviewUrl?: string;
}

function ImageLinkTester() {
    const [rawUrl, setRawUrl] = useState('');
    const [previewSrc, setPreviewSrc] = useState('');
    const [message, setMessage] = useState('');
    const [localObjectUrl, setLocalObjectUrl] = useState('');
    const [mediaOpen, setMediaOpen] = useState(false);
    const [testFolder, setTestFolder] = useState<LocalImageUploadFolder>('products');

    // States cho tính năng chọn thư mục ảnh hàng loạt
    const [processedImages, setProcessedImages] = useState<TestedImage[]>([]);
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // Giải phóng Object URL để tránh rò rỉ bộ nhớ
    useEffect(() => {
        return () => {
            if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
            processedImages.forEach((img) => {
                if (img.localPreviewUrl) URL.revokeObjectURL(img.localPreviewUrl);
            });
        };
    }, [localObjectUrl, processedImages]);

    const calculateHash = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    };

    const handleUrlChange = (value: string) => {
        if (localObjectUrl) {
            URL.revokeObjectURL(localObjectUrl);
            setLocalObjectUrl('');
        }
        setRawUrl(value);
        const result = normalizePreviewImageSource(value);
        setPreviewSrc(result.src);
        setMessage(result.error);
    };

    const handleLocalFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
        const objectUrl = URL.createObjectURL(file);
        setLocalObjectUrl(objectUrl);
        setRawUrl(file.name);
        setPreviewSrc(objectUrl);
        setMessage('Đang kiểm tra thư viện media theo tên file đã upload...');

        try {
            const matchedMedia = await findUploadedMediaByFileName(file.name);
            if (!matchedMedia) {
                setMessage('Đang xem thử file local trên máy. Chưa tìm thấy ảnh đã upload trùng tên trong MediaManager.');
                return;
            }

            URL.revokeObjectURL(objectUrl);
            setLocalObjectUrl('');
            setRawUrl(matchedMedia.url);
            setPreviewSrc(matchedMedia.url);
            setMessage(`Đã tìm thấy ảnh đã upload: ${matchedMedia.name}${matchedMedia.folder ? ` (${matchedMedia.folder})` : ''}. URL này có thể dùng trong Excel.`);
        } catch (error) {
            console.error('Media lookup error:', error);
            setMessage('Đang xem thử file local trên máy. Không kiểm tra được MediaManager, hãy mở thư viện media để chọn ảnh đã upload.');
        }
    };

    const clearProcessedImages = () => {
        setSelectedImageIndex(null);
        setProcessedImages((prev) => {
            prev.forEach((img) => {
                if (img.localPreviewUrl) URL.revokeObjectURL(img.localPreviewUrl);
            });
            return [];
        });
    };

    const handleFolderUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
        if (files.length === 0) {
            toast.info('Không tìm thấy tệp ảnh nào trong thư mục được chọn.');
            return;
        }

        clearProcessedImages();

        const list: TestedImage[] = files.map((file) => ({
            fileName: file.name,
            url: '',
            status: 'idle',
            message: 'Chưa upload',
            isReused: false,
            file,
            localPreviewUrl: URL.createObjectURL(file),
        }));

        setProcessedImages(list);
        if (list.length > 0) {
            setSelectedImageIndex(0); // Tự động chọn ảnh đầu tiên để xem trước
        }
        toast.success(`Đã nhận diện ${files.length} ảnh trong thư mục cục bộ. Bạn có thể copy tên file hoặc bấm Upload từng ảnh.`);
        event.target.value = '';
    };

    const handleCopyUrlWithUpload = async (index: number) => {
        const item = processedImages[index];
        if (!item) return;

        if (item.status === 'success') {
            copyToClipboard(item.url, 'url');
            return;
        }

        if (!item.file) return;

        // Bắt đầu upload
        setProcessedImages((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], status: 'loading', message: 'Đang upload...' };
            return next;
        });

        try {
            const folder = testFolder;
            const hash = await calculateHash(item.file);
            const docId = `MED-import-${folder}-${hash}`;
            const { getDoc, doc } = await import('firebase/firestore');
            const mediaDocRef = doc(db, 'media_library', docId);
            const mediaDocSnap = await getDoc(mediaDocRef);

            let url = '';
            let isReused = false;

            if (mediaDocSnap.exists()) {
                url = mediaDocSnap.data().url as string;
                isReused = true;
            } else {
                url = await uploadInitialImportImage(item.file, folder, hash);
            }

            setProcessedImages((prev) => {
                const next = [...prev];
                next[index] = {
                    ...next[index],
                    url,
                    status: 'success',
                    message: isReused ? 'Dùng lại ảnh cũ' : 'Upload mới thành công',
                    isReused,
                };
                return next;
            });

            // Copy vào clipboard
            navigator.clipboard.writeText(url);
            toast.success('Đã tự động upload và copy URL ảnh vào clipboard!');
        } catch (err) {
            console.error('Error uploading on copy:', err);
            setProcessedImages((prev) => {
                const next = [...prev];
                next[index] = {
                    ...next[index],
                    status: 'error',
                    message: err instanceof Error ? err.message : 'Lỗi upload',
                };
                return next;
            });
            toast.error(`Lỗi khi upload ${item.fileName}`);
        }
    };

    const handleMediaSelect = (url: string) => {
        if (localObjectUrl) {
            URL.revokeObjectURL(localObjectUrl);
            setLocalObjectUrl('');
        }
        setRawUrl(url);
        setPreviewSrc(url);
        setMessage('Đã chọn ảnh từ MediaManager. URL này có thể dùng trong Excel.');
    };

    const copyToClipboard = (text: string, type: 'name' | 'url') => {
        navigator.clipboard.writeText(text);
        toast.success(type === 'name' ? 'Đã copy tên file vào clipboard!' : 'Đã copy URL ảnh vào clipboard!');
    };

    const activeImg = selectedImageIndex !== null ? processedImages[selectedImageIndex] : null;

    return (
        <>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <ImageIcon size={17} className="text-orange-500" />
                        Kiểm tra hình ảnh trước khi đưa vào Excel
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Dán URL ảnh hoặc chọn file local để kiểm tra đúng hình trước khi copy link vào template.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select
                        title="Thư mục upload"
                        value={testFolder}
                        onChange={(e) => setTestFolder(e.target.value as LocalImageUploadFolder)}
                        className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                    >
                        <option value="products">Thư mục: Sản phẩm</option>
                        <option value="parts">Thư mục: Linh kiện</option>
                        <option value="services">Thư mục: Dịch vụ</option>
                        <option value="general">Thư mục: Chung (Khác)</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => setMediaOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-orange-200 text-sm font-medium text-orange-700 hover:bg-orange-50"
                    >
                        <ImageIcon size={16} />
                        Mở MediaManager
                    </button>
                    <label className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <Upload size={16} />
                        Chọn file local
                        <input type="file" accept="image/*" className="hidden" onChange={handleLocalFile} />
                    </label>
                    <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-orange-500 text-sm font-medium text-white hover:bg-orange-600"
                    >
                        <FolderOpen size={16} />
                        Chọn thư mục ảnh
                    </button>
                    <input
                        ref={folderInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFolderUpload}
                        title="Chọn thư mục ảnh"
                        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    />
                </div>
            </div>

            <div className="relative mb-4">
                <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    value={rawUrl}
                    onChange={(event) => handleUrlChange(event.target.value)}
                    placeholder="https://... hoặc /images/ten-file.webp"
                    className="w-full h-11 pl-10 pr-4 border border-gray-300 rounded-lg text-sm focus:border-orange-500 focus:outline-none"
                />
            </div>

            {message && (
                <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${previewSrc ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    {message}
                </div>
            )}

            {!processedImages.length && (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 min-h-[260px] flex items-center justify-center overflow-hidden">
                    {previewSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={previewSrc}
                            alt="Xem trước ảnh"
                            className="max-h-[360px] w-full object-contain bg-white"
                            onLoad={() => {
                                if (!localObjectUrl && !message) setMessage('Ảnh tải được. Có thể dùng link này trong Excel.');
                            }}
                            onError={() => setMessage('Không tải được ảnh từ link này. Hãy kiểm tra quyền truy cập, định dạng URL hoặc CORS.')}
                        />
                    ) : (
                        <div className="text-center text-sm text-gray-400 px-6">
                            <ImageIcon size={38} className="mx-auto mb-2 text-gray-300" />
                            Ảnh preview sẽ hiển thị tại đây
                        </div>
                    )}
                </div>
            )}

            {processedImages.length > 0 && (
                <div className="mt-5 border-t border-gray-100 pt-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <ImageIcon size={16} className="text-orange-500" />
                        Danh sách ảnh trong thư mục cục bộ ({processedImages.length} file)
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                        Nhấp vào bất kỳ dòng nào để xem trước ảnh kích thước lớn ở bên phải. Copy **Tên file thô** dán vào Excel, và bấm **Upload & Lấy URL** khi cần lấy link thật.
                    </p>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Cột trái: Danh sách bảng ảnh */}
                        <div className="lg:col-span-2 overflow-x-auto border border-gray-200 rounded-lg max-h-[450px] overflow-y-auto">
                            <table className="w-full text-xs text-left text-gray-700">
                                <thead className="bg-gray-50 text-gray-600 uppercase font-semibold border-b border-gray-200 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-2.5 w-16 text-center">Ảnh</th>
                                        <th className="px-4 py-2.5 min-w-[180px]">Tên file thô</th>
                                        <th className="px-4 py-2.5 w-28 text-center">Trạng thái</th>
                                        <th className="px-4 py-2.5 min-w-[200px]">Đường dẫn URL thật</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {processedImages.map((img, idx) => (
                                        <tr 
                                            key={idx} 
                                            onClick={() => setSelectedImageIndex(idx)}
                                            className={`hover:bg-gray-50/70 cursor-pointer transition-colors ${
                                                selectedImageIndex === idx ? 'bg-orange-50/50 font-medium border-l-2 border-l-orange-500' : ''
                                            }`}
                                        >
                                            <td className="px-4 py-2 text-center">
                                                {img.url || img.localPreviewUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={img.url || img.localPreviewUrl}
                                                        alt="thumb"
                                                        className="h-10 w-10 object-cover rounded border border-gray-200 bg-gray-50 mx-auto"
                                                    />
                                                ) : (
                                                    <div className="h-10 w-10 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 mx-auto">
                                                        <X size={16} />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-[11px] text-gray-900">
                                                <div className="flex items-center justify-between gap-2 bg-gray-50 px-2 py-1.5 rounded border border-gray-100">
                                                    <span className="truncate max-w-[160px]" title={img.fileName}>{img.fileName}</span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyToClipboard(img.fileName, 'name');
                                                        }}
                                                        className="p-1 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                                        title="Copy tên file để dán vào Excel"
                                                    >
                                                        <Copy size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                {img.status === 'loading' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 font-medium text-[11px] border border-blue-100">
                                                        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                                        Đang upload
                                                    </span>
                                                ) : img.status === 'success' ? (
                                                    <span className={`inline-flex items-center px-2 py-1 rounded font-medium text-[11px] border ${
                                                        img.isReused 
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                                            : 'bg-orange-50 text-orange-700 border-orange-100'
                                                    }`}>
                                                        {img.isReused ? 'Dùng lại' : 'Đã upload'}
                                                    </span>
                                                ) : img.status === 'error' ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded bg-red-50 text-red-700 font-medium text-[11px] border border-red-100" title={img.message}>
                                                        Lỗi upload
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 rounded bg-gray-50 text-gray-500 font-medium text-[11px] border border-gray-100">
                                                        Chưa upload
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                {img.status === 'success' ? (
                                                    <div className="flex items-center justify-between gap-2 bg-gray-50 px-2 py-1.5 rounded border border-gray-100">
                                                        <span className="font-mono text-[11px] text-gray-600 truncate max-w-[180px]" title={img.url}>
                                                            {img.url}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyToClipboard(img.url, 'url');
                                                            }}
                                                            className="p-1 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                                            title="Copy URL ảnh"
                                                        >
                                                            <Copy size={13} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopyUrlWithUpload(idx);
                                                        }}
                                                        disabled={img.status === 'loading'}
                                                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-[11px] font-medium transition-colors disabled:opacity-50"
                                                    >
                                                        <Upload size={12} />
                                                        Upload & Lấy URL
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Cột phải: Xem trước hình ảnh lớn */}
                        <div className="lg:col-span-1">
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sticky top-4">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                    Chi tiết & Xem trước
                                </h4>

                                {activeImg ? (
                                    <div className="space-y-4">
                                        {/* Khung ảnh lớn với nền Grid caro chống trôi suốt (transparent) */}
                                        <div className="relative rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden flex items-center justify-center aspect-video lg:aspect-square max-h-[280px] group">
                                            {/* Nền Grid Pattern */}
                                            <div 
                                                className="absolute inset-0 opacity-[0.04]"
                                                style={{
                                                    backgroundImage: 'radial-gradient(#000 20%, transparent 20%), radial-gradient(#000 20%, transparent 20%)',
                                                    backgroundPosition: '0 0, 8px 8px',
                                                    backgroundSize: '16px 16px'
                                                }}
                                            />
                                            
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={activeImg.url || activeImg.localPreviewUrl}
                                                alt={activeImg.fileName}
                                                className="relative z-10 max-h-full max-w-full object-contain p-2 transition-transform duration-200 group-hover:scale-105"
                                            />
                                        </div>

                                        {/* Thông số kỹ thuật tệp tin */}
                                        <div className="bg-white border border-gray-150 rounded-lg p-3 space-y-2 text-xs">
                                            <div className="flex justify-between gap-2">
                                                <span className="text-gray-400">Tên tệp:</span>
                                                <span className="font-mono text-gray-800 break-all text-right max-w-[180px]" title={activeImg.fileName}>
                                                    {activeImg.fileName}
                                                </span>
                                            </div>
                                            {activeImg.file && (
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">Dung lượng:</span>
                                                    <span className="text-gray-800 font-medium">
                                                        {(activeImg.file.size / 1024).toFixed(1)} KB
                                                    </span>
                                                </div>
                                            )}
                                            {activeImg.file?.type && (
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">Định dạng:</span>
                                                    <span className="text-gray-800 font-mono">{activeImg.file.type}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Đồng bộ:</span>
                                                <span className={`font-semibold ${
                                                    activeImg.status === 'success' ? 'text-emerald-600' : 'text-amber-600'
                                                }`}>
                                                    {activeImg.status === 'success' ? (activeImg.isReused ? 'Dùng lại ảnh cũ' : 'Đã upload thành công') : 'Chưa đồng bộ'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Diễn giải trạng thái */}
                                        <p className="text-[11px] text-gray-500 leading-relaxed bg-orange-50/40 border border-orange-100/50 rounded-lg p-2.5">
                                            {activeImg.status === 'success' ? (
                                                <span>Ảnh này đã được đồng bộ hóa. Đường dẫn URL thật đã sẵn sàng, bạn có thể bấm sao chép và dán trực tiếp vào file Excel.</span>
                                            ) : (
                                                <span>Ảnh này chưa được đồng bộ hóa lên máy chủ. Bạn có thể copy tên file này dán vào Excel, hoặc bấm nút upload phía dưới để đồng bộ và lấy URL thật ngay lập tức.</span>
                                            )}
                                        </p>

                                        {/* Phím tắt hành động nhanh */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(activeImg.fileName, 'name')}
                                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                                            >
                                                <Copy size={13} />
                                                Copy tên file
                                            </button>
                                            {activeImg.status === 'success' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(activeImg.url, 'url')}
                                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition-colors"
                                                >
                                                    <Copy size={13} />
                                                    Copy URL thật
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => selectedImageIndex !== null && handleCopyUrlWithUpload(selectedImageIndex)}
                                                    disabled={activeImg.status === 'loading'}
                                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                                                >
                                                    {activeImg.status === 'loading' ? (
                                                        <>
                                                            <Loader2 size={13} className="animate-spin" />
                                                            Đang upload...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload size={13} />
                                                            Upload ảnh
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>

                                        {activeImg.status === 'success' && (
                                            <a
                                                href={activeImg.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-center text-[11px] text-orange-600 hover:underline font-medium"
                                            >
                                                Xem ảnh gốc trên tab mới &rarr;
                                            </a>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-gray-200 bg-white rounded-lg min-h-[280px]">
                                        <ImageIcon size={32} className="text-gray-300 mb-2" />
                                        <p className="text-xs text-gray-400 max-w-[180px] leading-relaxed">
                                            Chọn một hình ảnh bên danh sách để xem trước kích thước lớn và chi tiết tệp
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        <MediaManager
            isOpen={mediaOpen}
            onClose={() => setMediaOpen(false)}
            onSelect={handleMediaSelect}
            title="Upload hoặc chọn ảnh cho Excel"
            defaultFolder={testFolder}
        />
        </>
    );
}

export default function InitialDataPage() {
    const { user } = useAuth();
    const [activeMode, setActiveMode] = useState<ExcelImportMode | null>(null);

    if (user?.role !== 'admin') {
        return (
            <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4">
                    <ShieldAlert size={30} />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">Chỉ admin được khởi tạo dữ liệu</h1>
                <p className="text-sm text-gray-500">Công cụ này tạo dữ liệu gốc hàng loạt nên không mở cho tài khoản staff.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Khởi tạo dữ liệu ban đầu</h1>
                    <p className="text-gray-500 mt-1 max-w-3xl">
                        Import một lần bằng Excel cho sản phẩm, phụ kiện, linh kiện và dịch vụ. Trang này không nằm trong menu admin chính.
                    </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    <AlertTriangle size={16} />
                    Dùng cho giai đoạn setup ban đầu
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {IMPORT_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                        <button
                            key={option.mode}
                            onClick={() => setActiveMode(option.mode)}
                            className="text-left bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-orange-200 transition-all"
                        >
                            <div className={`w-11 h-11 rounded-lg border flex items-center justify-center mb-4 ${option.accent}`}>
                                <Icon size={22} />
                            </div>
                            <h2 className="font-semibold text-gray-900">{option.title}</h2>
                            <p className="text-sm text-gray-500 mt-2 min-h-[60px]">{option.description}</p>
                            <p className="text-xs text-gray-400 mt-4">{option.columns}</p>
                        </button>
                    );
                })}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Nguyên tắc dữ liệu</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                    <div className="rounded-lg bg-gray-50 p-4">
                        <p className="font-medium text-gray-800 mb-1">Danh mục theo taxonomy</p>
                        <p>File Excel phải nhập breadcrumb đúng cây danh mục, ví dụ: Phụ kiện &gt; Cáp sạc.</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4">
                        <p className="font-medium text-gray-800 mb-1">Ảnh dùng URL</p>
                        <p>Dùng URL ảnh public hoặc ảnh đã upload trong media. Ảnh phụ phân tách bằng dấu chấm phẩy.</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4">
                        <p className="font-medium text-gray-800 mb-1">Tồn kho có log</p>
                        <p>Dòng có tồn kho lớn hơn 0 sẽ tạo inventory log type IMPORT để có lịch sử nhập ban đầu.</p>
                    </div>
                </div>
            </div>

            <ImageLinkTester />

            {activeMode && (
                <ExcelImportModal
                    mode={activeMode}
                    onClose={() => setActiveMode(null)}
                />
            )}
        </div>
    );
}
