'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, Building2, Cable, ClipboardList, FileSpreadsheet, Image as ImageIcon, Link2, Package, ShieldAlert, ShoppingBag, Upload, Users, Wrench } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import ExcelImportModal, { type ExcelImportMode } from '@/components/admin/ExcelImportModal';
import MediaManager from '@/components/admin/MediaManager';

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

function ImageLinkTester() {
    const [rawUrl, setRawUrl] = useState('');
    const [previewSrc, setPreviewSrc] = useState('');
    const [message, setMessage] = useState('');
    const [localObjectUrl, setLocalObjectUrl] = useState('');
    const [mediaOpen, setMediaOpen] = useState(false);

    useEffect(() => () => {
        if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    }, [localObjectUrl]);

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

    const handleMediaSelect = (url: string) => {
        if (localObjectUrl) {
            URL.revokeObjectURL(localObjectUrl);
            setLocalObjectUrl('');
        }
        setRawUrl(url);
        setPreviewSrc(url);
        setMessage('Đã chọn ảnh từ MediaManager. URL này có thể dùng trong Excel.');
    };

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
                </div>
            </div>

            <div className="relative">
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
                <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${previewSrc ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    {message}
                </div>
            )}

            <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 min-h-[260px] flex items-center justify-center overflow-hidden">
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
        </div>
        <MediaManager
            isOpen={mediaOpen}
            onClose={() => setMediaOpen(false)}
            onSelect={handleMediaSelect}
            title="Upload hoặc chọn ảnh cho Excel"
            defaultFolder="products"
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
