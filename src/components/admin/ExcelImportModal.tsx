'use client';


import { useRef, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Download,
    FolderOpen,
    Image as ImageIcon,
    Loader2,
    Package,
    Upload,
    Wrench,
    X,
} from 'lucide-react';
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import { buildProductCodeFromId, normalizeProductCode } from '@/lib/productCodes';
import { generateSearchKeywords, generateSlug } from '@/lib/utils';
import { triggerRevalidate } from '@/lib/revalidate';
import {
    FIRESTORE_QUERY_CHUNK_SIZE,
    IMAGE_MAIN_HEADERS,
    IMAGE_OTHER_HEADERS,
    MODE_CONFIG,
    PREVIEW_CHECK_KEYS,
    QUALITY_OPTIONS,
    buildCheck,
    buildImportProductId,
    collectLocalImageRequirements,
    createInitialProductWithCodes,
    fileMatchesLocalReference,
    findExistingImportImage,
    generateTemplate,
    getBoolean,
    getFileRelativePath,
    getNumber,
    getValue,
    imageUploadFolderForMode,
    isAccessoryCategory,
    isLocalImageReference,
    isValidHttpUrl,
    loadExistingDocIds,
    loadExistingProductCodes,
    normalizeConditionInput,
    normalizeLocalImageKey,
    parseImages,
    parseNumberInput,
    parseSpecs,
    productKindForMode,
    refreshImageChecks,
    replaceImageReferences,
    resolveCategoryPath,
    resolveExpectedProductCode,
    resolveTargetDocId,
    severityClasses,
    severityLabel,
    splitList,
    summarizeChecks,
    uploadInitialImportImage,
    type ExcelImportMode,
    type ExcelRow,
    type FieldCheck,
    type LocalImageRequirement,
    type ParsedRow,
    type PreviewFilter,
    type Step,
} from '@/features/excel-import/importSupport';

export type { ExcelImportMode } from '@/features/excel-import/importSupport';

function iconForMode(mode: ExcelImportMode) {
    if (MODE_CONFIG[mode].icon === 'part') return <Wrench size={22} className="text-emerald-600" />;
    if (MODE_CONFIG[mode].icon === 'service') return <Wrench size={22} className="text-blue-600" />;
    return <Package size={22} className="text-orange-600" />;
}

export default function ExcelImportModal({ mode, onClose }: { mode: ExcelImportMode; onClose: () => void }) {
    const { user } = useAuth();
    const { config } = useConfig();
    const fileRef = useRef<HTMLInputElement>(null);
    const localImageFilesRef = useRef<HTMLInputElement>(null);
    const localImageFolderRef = useRef<HTMLInputElement>(null);
    const modeConfig = MODE_CONFIG[mode];

    const [step, setStep] = useState<Step>('upload');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [importResults, setImportResults] = useState({ success: 0, failed: 0 });
    const [localImageProgress, setLocalImageProgress] = useState({ uploading: false, done: 0, total: 0 });

    const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setRows([]);
        setPreviewFilter('all');
        setLocalImageProgress({ uploading: false, done: 0, total: 0 });
        setStep('validating');
        const reader = new FileReader();

        reader.onload = async (readerEvent) => {
            try {
                const workbook = XLSX.read(readerEvent.target?.result, { type: 'binary' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonRows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: '' });

                if (jsonRows.length === 0) {
                    toast.error('File rỗng');
                    setStep('upload');
                    return;
                }

                const taxonomy = config.taxonomy?.[modeConfig.taxonomyType] || [];
                const names = jsonRows.map((row) => getValue(row, modeConfig.nameHeaders)).filter(Boolean);
                const normalizedSeen = new Set<string>();
                const duplicateInFile = new Set<string>();
                const targetIds = jsonRows.map((row) => resolveTargetDocId(mode, row, modeConfig, taxonomy)).filter(Boolean);
                const seenTargetIds = new Set<string>();
                const duplicateTargetIdsInFile = new Set<string>();

                for (const name of names) {
                    const normalized = name.toLowerCase();
                    if (normalizedSeen.has(normalized)) duplicateInFile.add(normalized);
                    normalizedSeen.add(normalized);
                }

                for (const id of targetIds) {
                    if (seenTargetIds.has(id)) duplicateTargetIdsInFile.add(id);
                    seenTargetIds.add(id);
                }

                const expectedCodes = jsonRows
                    .map((row) => resolveExpectedProductCode(mode, row, modeConfig, taxonomy))
                    .filter(Boolean);
                const seenCodes = new Set<string>();
                const duplicateCodesInFile = new Set<string>();
                for (const code of expectedCodes) {
                    if (seenCodes.has(code)) duplicateCodesInFile.add(code);
                    seenCodes.add(code);
                }

                const existingNames = new Set<string>();
                const uniqueNames = Array.from(new Set(names));
                for (let index = 0; index < uniqueNames.length; index += FIRESTORE_QUERY_CHUNK_SIZE) {
                    const chunk = uniqueNames.slice(index, index + FIRESTORE_QUERY_CHUNK_SIZE);
                    const snapshot = await getDocs(query(collection(db, modeConfig.collectionName), where('name', 'in', chunk)));
                    snapshot.forEach((item) => {
                        const data = item.data() as { name?: string; status?: string; isActive?: boolean };
                        if (data.status !== 'inactive' && data.isActive !== false && data.name) {
                            existingNames.add(data.name.toLowerCase());
                        }
                    });
                }

                const existingDocIds = await loadExistingDocIds(modeConfig.collectionName, targetIds);
                const existingCodes = mode === 'service' ? new Set<string>() : await loadExistingProductCodes(expectedCodes);

                const parsed = jsonRows.map((row, index) => {
                    const rowNum = index + 2;
                    const name = getValue(row, modeConfig.nameHeaders);
                    const categoryPath = getValue(row, ['Danh mục', 'Category']);
                    const { categoryIds, category } = resolveCategoryPath(categoryPath, taxonomy);
                    const targetDocId = resolveTargetDocId(mode, row, modeConfig, taxonomy);
                    const checks: FieldCheck[] = [];

                    if (!name) {
                        checks.push(buildCheck('name', 'Tên', '', 'error', `Thiếu ${modeConfig.nameHeaders[0]}`));
                    } else if (duplicateInFile.has(name.toLowerCase())) {
                        checks.push(buildCheck('name', 'Tên', name, 'error', 'Trùng tên trong file'));
                    } else if (targetDocId && duplicateTargetIdsInFile.has(targetDocId)) {
                        checks.push(buildCheck('name', 'Tên', name, 'error', `Trùng ID chuẩn hóa trong file: ${targetDocId}`));
                    } else if (targetDocId && existingDocIds.has(targetDocId)) {
                        checks.push(buildCheck('name', 'Tên', name, 'error', `ID ${targetDocId} đã tồn tại, import sẽ ghi đè/trùng dữ liệu`));
                    } else if (existingNames.has(name.toLowerCase())) {
                        checks.push(buildCheck('name', 'Tên', name, 'error', 'Tên đã tồn tại trên hệ thống'));
                    } else {
                        checks.push(buildCheck('name', 'Tên', name, 'ok', targetDocId ? `ID sẽ tạo: ${targetDocId}` : 'Tên có thể import'));
                    }

                    if (!categoryPath) {
                        checks.push(buildCheck('category', 'Danh mục', '', 'error', 'Thiếu danh mục'));
                    } else if (categoryIds.length === 0) {
                        checks.push(buildCheck('category', 'Danh mục', categoryPath, 'error', 'Không khớp cây taxonomy'));
                    } else if (mode === 'accessory' && !isAccessoryCategory(categoryIds)) {
                        checks.push(buildCheck('category', 'Danh mục', categoryPath, 'error', 'Sheet phụ kiện chỉ được dùng danh mục Phụ kiện'));
                    } else if (mode === 'product' && isAccessoryCategory(categoryIds)) {
                        checks.push(buildCheck('category', 'Danh mục', categoryPath, 'error', 'Danh mục phụ kiện phải import bằng sheet Phụ kiện'));
                    } else {
                        checks.push(buildCheck('category', 'Danh mục', categoryPath, 'ok', `Khớp ${categoryIds.length} cấp`));
                    }

                    const priceOriginalInput = parseNumberInput(row, ['Giá gốc', 'Giá']);
                    const pricePromoInput = parseNumberInput(row, ['Giá KM', 'Giá bán']);
                    const costInput = parseNumberInput(row, ['Giá vốn', 'Cost']);

                    if (mode === 'part') {
                        if (!costInput.hasValue || !costInput.isValid || costInput.value <= 0) {
                            checks.push(buildCheck('cost', 'Giá vốn', costInput.raw, 'error', 'Giá vốn linh kiện phải lớn hơn 0'));
                        } else {
                            checks.push(buildCheck('cost', 'Giá vốn', costInput.raw, 'ok', 'Giá vốn hợp lệ'));
                        }

                        if (!pricePromoInput.hasValue || !pricePromoInput.isValid || pricePromoInput.value <= 0) {
                            checks.push(buildCheck('price', 'Giá bán', pricePromoInput.raw, 'error', 'Giá bán linh kiện phải lớn hơn 0'));
                        } else if (costInput.isValid && costInput.value > 0 && pricePromoInput.value < costInput.value) {
                            checks.push(buildCheck('price', 'Giá bán', pricePromoInput.raw, 'warning', 'Giá bán thấp hơn giá vốn'));
                        } else {
                            checks.push(buildCheck('price', 'Giá bán', pricePromoInput.raw, 'ok', 'Giá bán hợp lệ'));
                        }
                    } else {
                        if (!priceOriginalInput.hasValue || !priceOriginalInput.isValid || priceOriginalInput.value <= 0) {
                            checks.push(buildCheck('price', 'Giá gốc', priceOriginalInput.raw, 'error', 'Giá gốc phải lớn hơn 0'));
                        } else if (pricePromoInput.hasValue && !pricePromoInput.isValid) {
                            checks.push(buildCheck('price', 'Giá gốc', priceOriginalInput.raw, 'error', 'Giá khuyến mãi không hợp lệ'));
                        } else if (pricePromoInput.hasValue && pricePromoInput.value > priceOriginalInput.value) {
                            checks.push(buildCheck('price', 'Giá gốc', priceOriginalInput.raw, 'error', 'Giá khuyến mãi không được cao hơn giá gốc'));
                        } else {
                            checks.push(buildCheck('price', 'Giá gốc', priceOriginalInput.raw, 'ok', pricePromoInput.hasValue ? 'Giá gốc và giá khuyến mãi hợp lệ' : 'Giá gốc hợp lệ'));
                        }

                        if (costInput.hasValue && !costInput.isValid) {
                            checks.push(buildCheck('cost', 'Giá vốn', costInput.raw, 'error', 'Giá vốn không hợp lệ'));
                        } else if (!costInput.hasValue || costInput.value <= 0) {
                            checks.push(buildCheck('cost', 'Giá vốn', costInput.raw, 'warning', 'Thiếu giá vốn, lợi nhuận/tồn kho sẽ kém chính xác'));
                        } else if (priceOriginalInput.isValid && priceOriginalInput.value > 0 && costInput.value > priceOriginalInput.value) {
                            checks.push(buildCheck('cost', 'Giá vốn', costInput.raw, 'warning', 'Giá vốn cao hơn giá bán gốc'));
                        } else {
                            checks.push(buildCheck('cost', 'Giá vốn', costInput.raw, 'ok', 'Giá vốn hợp lệ'));
                        }
                    }

                    const stockInput = parseNumberInput(row, ['Tồn kho', 'Stock']);
                    if (!stockInput.hasValue) {
                        checks.push(buildCheck('stock', 'Tồn kho', '', 'warning', 'Để trống sẽ nhập tồn kho 0'));
                    } else if (!stockInput.isValid) {
                        checks.push(buildCheck('stock', 'Tồn kho', stockInput.raw, 'error', 'Tồn kho phải là số không âm'));
                    } else {
                        checks.push(buildCheck('stock', 'Tồn kho', stockInput.raw, 'ok', 'Tồn kho hợp lệ'));
                    }

                    const customCode = getValue(row, ['Mã hàng', 'SKU', 'Barcode']);
                    const normalizedCode = normalizeProductCode(customCode);
                    const expectedCode = resolveExpectedProductCode(mode, row, modeConfig, taxonomy);
                    if (mode === 'service') {
                        checks.push(buildCheck('code', 'Mã hàng', '', 'ok', 'Dịch vụ không dùng mã QR/barcode'));
                    } else if (!customCode) {
                        if (!expectedCode) {
                            checks.push(buildCheck('code', 'Mã hàng', '', 'error', 'Không thể tự sinh mã khi thiếu tên hoặc danh mục'));
                        } else if (duplicateCodesInFile.has(expectedCode)) {
                            checks.push(buildCheck('code', 'Mã hàng', expectedCode, 'error', 'Mã tự sinh bị trùng trong file'));
                        } else if (existingCodes.has(expectedCode)) {
                            checks.push(buildCheck('code', 'Mã hàng', expectedCode, 'error', 'Mã tự sinh đã tồn tại'));
                        } else {
                            checks.push(buildCheck('code', 'Mã hàng', expectedCode, 'warning', 'Hệ thống sẽ tự sinh mã QR/barcode này'));
                        }
                    } else if (!normalizedCode) {
                        checks.push(buildCheck('code', 'Mã hàng', customCode, 'error', 'Mã hàng không hợp lệ'));
                    } else if (duplicateCodesInFile.has(normalizedCode)) {
                        checks.push(buildCheck('code', 'Mã hàng', customCode, 'error', 'Mã hàng trùng trong file'));
                    } else if (existingCodes.has(normalizedCode)) {
                        checks.push(buildCheck('code', 'Mã hàng', customCode, 'error', 'Mã hàng đã tồn tại'));
                    } else {
                        checks.push(buildCheck('code', 'Mã hàng', normalizedCode, 'ok', 'Mã hàng hợp lệ'));
                    }

                    const images = parseImages(row, IMAGE_MAIN_HEADERS, IMAGE_OTHER_HEADERS);
                    const invalidImages = images.filter((image) => !isValidHttpUrl(image) && !isLocalImageReference(image));
                    const localImages = images.filter(isLocalImageReference);
                    if (invalidImages.length > 0) {
                        checks.push(buildCheck('images', 'Ảnh', invalidImages[0], 'error', 'Ảnh phải là URL http/https hoặc đường dẫn file ảnh local'));
                    } else if (localImages.length > 0) {
                        checks.push(buildCheck('images', 'Ảnh', localImages[0], 'error', `Có ${localImages.length} ảnh local cần chọn file để upload`));
                    } else {
                        checks.push(images.length > 0
                            ? buildCheck('images', 'Ảnh', `${images.length} URL`, 'ok', 'Có ảnh')
                            : buildCheck('images', 'Ảnh', '', 'warning', 'Thiếu ảnh, item sẽ không có hình hiển thị')
                        );
                    }

                    if (mode === 'part') {
                        const partType = getValue(row, ['Loại linh kiện', 'Part Type']);
                        const quality = getValue(row, ['Chất lượng', 'Phân loại']);
                        if (!partType) {
                            checks.push(buildCheck('details', 'Thông tin thêm', '', 'error', 'Thiếu loại linh kiện để tính bảo hành'));
                        } else if (quality && !QUALITY_OPTIONS.includes(quality)) {
                            checks.push(buildCheck('details', 'Thông tin thêm', quality, 'error', `Chất lượng chỉ nhận: ${QUALITY_OPTIONS.join(', ')}`));
                        } else if (!quality) {
                            checks.push(buildCheck('details', 'Thông tin thêm', partType, 'warning', 'Thiếu chất lượng, hệ thống sẽ mặc định Zin'));
                        } else {
                            checks.push(buildCheck('details', 'Thông tin thêm', `${partType} / ${quality}`, 'ok', 'Thông tin linh kiện hợp lệ'));
                        }
                    } else if (mode === 'service') {
                        const warranty = getValue(row, ['Bảo hành', 'Warranty']);
                        const repairTime = getValue(row, ['Thời gian sửa', 'Repair Time']);
                        if (!warranty || !repairTime) {
                            checks.push(buildCheck('details', 'Thông tin thêm', [warranty, repairTime].filter(Boolean).join(' / '), 'warning', 'Nên có bảo hành và thời gian sửa'));
                        } else {
                            checks.push(buildCheck('details', 'Thông tin thêm', `${warranty} / ${repairTime}`, 'ok', 'Thông tin dịch vụ đủ'));
                        }
                    } else {
                        const brand = getValue(row, ['Thương hiệu', 'Brand']);
                        const specs = getValue(row, ['Thông số', 'Specs']);
                        const rawCondition = getValue(row, ['Tình trạng', 'Condition']);
                        const condition = normalizeConditionInput(rawCondition);
                        if (rawCondition && !condition) {
                            checks.push(buildCheck('details', 'Thông tin thêm', rawCondition, 'error', 'Tình trạng chỉ nhận new, like-new hoặc used'));
                        } else if (!rawCondition) {
                            checks.push(buildCheck('details', 'Thông tin thêm', [brand, specs ? 'Có specs' : ''].filter(Boolean).join(' / '), 'warning', 'Thiếu tình trạng, hệ thống sẽ mặc định new'));
                        } else if (!brand || !specs) {
                            checks.push(buildCheck('details', 'Thông tin thêm', [condition, brand, specs ? 'Có specs' : ''].filter(Boolean).join(' / '), 'warning', 'Nên có thương hiệu và thông số'));
                        } else {
                            checks.push(buildCheck('details', 'Thông tin thêm', `${condition} / ${brand} / Có specs`, 'ok', 'Thông tin sản phẩm đủ'));
                        }
                    }

                    const errors = summarizeChecks(checks, 'error');
                    const warnings = summarizeChecks(checks, 'warning');
                    return { rowNum, data: row, errors, warnings, checks, categoryIds, category };
                });

                setRows(parsed);
                setPreviewFilter('all');
                setStep('preview');
            } catch (error) {
                console.error('Excel parse error:', error);
                toast.error('Có lỗi xảy ra khi đọc file.');
                setStep('upload');
            }
        };

        reader.readAsBinaryString(file);
    };

    const handleLocalImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files || []);
        const requirements = collectLocalImageRequirements(rows);
        if (requirements.length === 0) {
            toast.info('Không có đường dẫn ảnh local nào cần upload.');
            event.target.value = '';
            return;
        }
        if (selectedFiles.length === 0) return;

        const matched = requirements
            .map((requirement) => ({
                requirement,
                file: selectedFiles.find((file) => fileMatchesLocalReference(file, requirement.source)),
            }))
            .filter((item): item is { requirement: LocalImageRequirement; file: File } => Boolean(item.file));

        const missingCount = requirements.length - matched.length;
        if (matched.length === 0) {
            toast.error('Chưa khớp được ảnh nào. Hãy chọn đúng file hoặc chọn cả thư mục chứa ảnh trong Excel.');
            event.target.value = '';
            return;
        }

        setLocalImageProgress({ uploading: true, done: 0, total: matched.length });
        const folder = imageUploadFolderForMode(mode);
        const replacements: Record<string, string> = {};
        const imageResolveCache = new Map<string, Promise<{ url: string; reused: boolean }>>();
        let reusedCount = 0;
        let uploadedCount = 0;

        try {
            for (const item of matched) {
                const fileKey = normalizeLocalImageKey(getFileRelativePath(item.file));
                if (!imageResolveCache.has(fileKey)) {
                    imageResolveCache.set(fileKey, (async () => {
                        const existingImage = await findExistingImportImage(item.file.name, folder);
                        if (existingImage) {
                            return { url: existingImage.url, reused: true };
                        }
                        return { url: await uploadInitialImportImage(item.file, folder), reused: false };
                    })());
                }
                const resolvedImage = await imageResolveCache.get(fileKey)!;
                replacements[item.requirement.key] = resolvedImage.url;
                if (resolvedImage.reused) {
                    reusedCount += 1;
                } else {
                    uploadedCount += 1;
                }
                setLocalImageProgress((current) => ({ ...current, done: current.done + 1 }));
            }

            setRows((currentRows) => currentRows.map((row) => (
                refreshImageChecks({
                    ...row,
                    data: replaceImageReferences(row.data, replacements),
                })
            )));
            setPreviewFilter(missingCount > 0 ? 'errors' : 'all');
            const resolvedSummary = `${reusedCount} dùng lại, ${uploadedCount} upload mới`;
            if (missingCount > 0) {
                toast.warning(`Đã xử lý ${matched.length} ảnh (${resolvedSummary}), còn ${missingCount} đường dẫn local chưa khớp file.`);
            } else {
                toast.success(`Đã thay URL cho ${matched.length} ảnh local (${resolvedSummary}).`);
            }
        } catch (error) {
            console.error('Initial Excel local image upload failed:', error);
            const message = error instanceof Error ? error.message : 'Không thể upload ảnh local.';
            toast.error(message);
        } finally {
            setLocalImageProgress({ uploading: false, done: 0, total: 0 });
            event.target.value = '';
        }
    };

    const importProductLikeRow = async (row: ParsedRow) => {
        const name = getValue(row.data, modeConfig.nameHeaders);
        const category = mode === 'part' ? PART_CATEGORY_LABEL : row.category;
        if (mode === 'service') {
            throw new Error('Dịch vụ không được import bằng luồng sản phẩm.');
        }
        const productId = buildImportProductId(mode, name, mode === 'accessory' ? 'phu-kien' : row.category);
        const kind = productKindForMode(mode, category, row.categoryIds);
        const customCode = normalizeProductCode(getValue(row.data, ['Mã hàng', 'SKU', 'Barcode']));
        const productCode = customCode || buildProductCodeFromId(productId, kind);
        const images = parseImages(row.data, IMAGE_MAIN_HEADERS, IMAGE_OTHER_HEADERS);
        const stock = getNumber(row.data, ['Tồn kho', 'Stock']);
        const costPrice = mode === 'part'
            ? getNumber(row.data, ['Giá vốn', 'Giá gốc'])
            : getNumber(row.data, ['Giá vốn', 'Cost']);
        const priceOriginal = mode === 'part'
            ? costPrice
            : getNumber(row.data, ['Giá gốc', 'Giá']);
        const pricePromo = mode === 'part'
            ? getNumber(row.data, ['Giá bán', 'Giá KM'])
            : getNumber(row.data, ['Giá KM', 'Giá bán']);
        const searchKeywords = Array.from(new Set([...generateSearchKeywords(name), productCode.toLowerCase()])).slice(0, 60);

        const data: Record<string, unknown> = {
            sku: productCode,
            barcode: productCode,
            productCode,
            name,
            brand: mode === 'part' ? '' : getValue(row.data, ['Thương hiệu', 'Brand']),
            category,
            categoryIds: row.categoryIds,
            price_original: priceOriginal,
            price_promo: pricePromo,
            costPrice,
            supplier: getValue(row.data, ['NCC', 'Nhà cung cấp', 'Supplier']),
            stock,
            held: 0,
            description: mode === 'part'
                ? getValue(row.data, ['Mô tả', 'Dòng máy tương thích'])
                : getValue(row.data, ['Mô tả', 'Description']),
            imageUrl: images[0] || '',
            images,
            specs: parseSpecs(getValue(row.data, ['Thông số', 'Specs'])),
            status: 'active',
            sold: 0,
            searchKeywords,
            videoEmbedUrl: getValue(row.data, ['Video', 'Video URL']),
            warrantyMonths: getNumber(row.data, ['Bảo hành tháng', 'Warranty Months']),
        };

        if (mode === 'part') {
            data.quality = getValue(row.data, ['Chất lượng', 'Phân loại']) || 'Zin';
            data.partType = getValue(row.data, ['Loại linh kiện', 'Part Type']);
        } else {
            data.condition = getValue(row.data, ['Tình trạng', 'Condition']) || 'new';
            data.isFlashSale = getBoolean(row.data, ['Flash Sale']);
            data.seriesId = getValue(row.data, ['Series ID']);
            data.color = getValue(row.data, ['Màu sắc']);
            data.storageCapacity = getValue(row.data, ['Dung lượng']);
        }

        if (mode !== 'part') {
            data.condition = normalizeConditionInput(getValue(row.data, ['Tình trạng', 'Condition'])) || 'new';
        }

        await createInitialProductWithCodes(
            productId,
            data,
            [productCode],
            stock > 0
                ? {
                    productId,
                    productName: name,
                    quantity: stock,
                    costPriceAtLog: costPrice,
                    type: 'IMPORT',
                    referenceId: 'initial-excel-import',
                    referenceType: 'import_receipt',
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || '',
                }
                : undefined,
        );
    };

    const importServiceRow = async (row: ParsedRow) => {
        const name = getValue(row.data, modeConfig.nameHeaders);
        const serviceId = generateSlug(name);
        const images = parseImages(row.data, IMAGE_MAIN_HEADERS, IMAGE_OTHER_HEADERS);
        const imageUrl = images[0] || '';
        const serviceRef = doc(db, 'services', serviceId);
        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(serviceRef);
            if (snapshot.exists()) {
                throw new Error(`Dịch vụ ${serviceId} đã tồn tại.`);
            }
            transaction.set(serviceRef, {
                name,
                device_model: getValue(row.data, ['Dòng máy', 'Device Model']),
                category: row.category,
                categoryIds: row.categoryIds,
                price_original: getNumber(row.data, ['Giá gốc', 'Giá']),
                price_promo: getNumber(row.data, ['Giá KM', 'Giá bán']),
                warranty_text: getValue(row.data, ['Bảo hành', 'Warranty']),
                repair_time: getValue(row.data, ['Thời gian sửa', 'Repair Time']),
                description: getValue(row.data, ['Mô tả', 'Description']),
                seoDescription: getValue(row.data, ['SEO Description']),
                tags: splitList(getValue(row.data, ['Tags', 'Từ khóa'])),
                videoEmbedUrl: getValue(row.data, ['Video', 'Video URL']),
                imageUrl,
                images,
                isActive: true,
                price: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });
    };

    const handleImport = async () => {
        if (rows.length === 0) {
            toast.error('Không có dữ liệu để import');
            return;
        }
        const blockingErrors = rows.filter((row) => row.errors.length > 0).length;
        if (blockingErrors > 0) {
            toast.error(`Còn ${blockingErrors} dòng lỗi. Vui lòng sửa Excel rồi kiểm tra lại trước khi import.`);
            return;
        }

        setStep('importing');
        setProgress({ done: 0, total: rows.length });
        let success = 0;
        let failed = 0;

        for (let index = 0; index < rows.length; index += 5) {
            const batch = rows.slice(index, index + 5);
            const results = await Promise.allSettled(
                batch.map((row) => mode === 'service' ? importServiceRow(row) : importProductLikeRow(row))
            );
            for (const result of results) {
                if (result.status === 'fulfilled') success++;
                else {
                    failed++;
                    console.error('Initial Excel import row failed:', result.reason);
                }
            }
            setProgress({ done: Math.min(index + batch.length, rows.length), total: rows.length });
        }

        try {
            if (mode === 'service') {
                await triggerRevalidate(['/', '/category/sua-chua', '/sitemap.xml'], ['services']);
            } else {
                await triggerRevalidate(['/', '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            }
        } catch (error) {
            console.warn('Revalidate after Excel import failed:', error);
        }

        setImportResults({ success, failed });
        setStep('done');
        toast.success(`Import hoàn tất: ${success} thành công, ${failed} lỗi`);
    };

    const errorCount = rows.filter((row) => row.errors.length > 0).length;
    const warningRowCount = rows.filter((row) => row.warnings.length > 0 && row.errors.length === 0).length;
    const warningCount = rows.reduce((total, row) => total + row.warnings.length, 0);
    const validCount = rows.filter((row) => row.errors.length === 0).length;
    const perfectCount = rows.filter((row) => row.errors.length === 0 && row.warnings.length === 0).length;
    const canImport = rows.length > 0 && errorCount === 0;
    const localImageRequirements = collectLocalImageRequirements(rows);
    const filteredRows = rows.filter((row) => {
        if (previewFilter === 'errors') return row.errors.length > 0;
        if (previewFilter === 'warnings') return row.warnings.length > 0 && row.errors.length === 0;
        if (previewFilter === 'valid') return row.errors.length === 0;
        return true;
    });
    const filterOptions: { value: PreviewFilter; label: string; count: number }[] = [
        { value: 'all', label: 'Tất cả', count: rows.length },
        { value: 'valid', label: 'Hợp lệ', count: validCount },
        { value: 'errors', label: 'Lỗi', count: errorCount },
        { value: 'warnings', label: 'Cảnh báo', count: warningRowCount },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b shrink-0">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        {iconForMode(mode)}
                        Import {modeConfig.title} từ Excel
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Đóng" title="Đóng">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <button
                                onClick={() => generateTemplate(mode, config.taxonomy?.[modeConfig.taxonomyType] || [])}
                                className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-green-300 text-green-700 rounded-lg hover:bg-green-50 text-sm font-medium w-full justify-center"
                            >
                                <Download size={18} /> Tải mẫu Excel {modeConfig.shortLabel}
                            </button>
                            <div
                                className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                                onClick={() => fileRef.current?.click()}
                                title="Chọn file Excel"
                            >
                                <Upload size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-sm text-gray-500">Kéo thả hoặc <span className="text-orange-600 font-medium">chọn file Excel</span></p>
                                <p className="text-xs text-gray-400 mt-1">Hỗ trợ .xlsx, .xls. Ảnh có thể nhập bằng URL hoặc đường dẫn local rồi upload ở bước kiểm tra.</p>
                            </div>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} title="Chọn file Excel" />
                        </div>
                    )}

                    {step === 'validating' && (
                        <div className="text-center py-10">
                            <Loader2 size={40} className="mx-auto text-orange-500 animate-spin mb-4" />
                            <p className="text-sm text-gray-600">Đang kiểm tra danh mục, trùng tên và mã hàng...</p>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                <div className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-100">
                                    <p className="text-gray-500 text-xs">Tổng dòng</p>
                                    <p className="text-xl font-bold text-gray-900">{rows.length}</p>
                                </div>
                                <div className="bg-green-50 rounded-lg p-3 text-sm border border-green-100">
                                    <p className="text-green-600 text-xs">Có thể import</p>
                                    <p className="text-xl font-bold text-green-700">{validCount}</p>
                                </div>
                                <div className="bg-red-50 rounded-lg p-3 text-sm border border-red-100">
                                    <p className="text-red-600 text-xs">Dòng lỗi</p>
                                    <p className="text-xl font-bold text-red-700">{errorCount}</p>
                                </div>
                                <div className="bg-amber-50 rounded-lg p-3 text-sm border border-amber-100">
                                    <p className="text-amber-600 text-xs">Dòng cảnh báo</p>
                                    <p className="text-xl font-bold text-amber-700">{warningRowCount}</p>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-3 text-sm border border-blue-100">
                                    <p className="text-blue-600 text-xs">Chuẩn hoàn toàn</p>
                                    <p className="text-xl font-bold text-blue-700">{perfectCount}</p>
                                </div>
                            </div>

                            <div className={`rounded-lg border p-3 text-sm ${canImport ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                {canImport ? (
                                    <div className="flex items-start gap-2">
                                        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                                        <p>File không còn lỗi chặn. Có {warningCount} cảnh báo cần rà lại, nhưng admin có thể import toàn bộ {rows.length} dòng.</p>
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-2">
                                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                        <p>Còn {errorCount} dòng lỗi. Import bị khóa để tránh tạo dữ liệu ban đầu sai quy ước.</p>
                                    </div>
                                )}
                            </div>

                            {localImageRequirements.length > 0 && (
                                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-1">
                                            <p className="font-semibold flex items-center gap-2">
                                                <ImageIcon size={16} />
                                                Còn {localImageRequirements.length} đường dẫn ảnh local cần upload
                                            </p>
                                            <p className="text-orange-700">
                                                Chọn các file ảnh hoặc chọn cả thư mục chứa ảnh. Hệ thống khớp theo tên file trong Excel, upload sang WebP rồi thay bằng URL Firebase trước khi import.
                                            </p>
                                            <p className="text-xs text-orange-600 line-clamp-2" title={localImageRequirements.map((item) => item.source).join(', ')}>
                                                {localImageRequirements.slice(0, 5).map((item) => item.fileName).join(', ')}
                                                {localImageRequirements.length > 5 ? ` và ${localImageRequirements.length - 5} ảnh khác` : ''}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => localImageFilesRef.current?.click()}
                                                disabled={localImageProgress.uploading}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                                            >
                                                {localImageProgress.uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                                {localImageProgress.uploading ? `Đang upload ${localImageProgress.done}/${localImageProgress.total}` : 'Chọn ảnh'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => localImageFolderRef.current?.click()}
                                                disabled={localImageProgress.uploading}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                                            >
                                                <FolderOpen size={16} />
                                                Chọn thư mục ảnh
                                            </button>
                                        </div>
                                    </div>
                                    <input ref={localImageFilesRef} type="file" accept="image/*" multiple className="hidden" onChange={handleLocalImages} title="Chọn ảnh local để upload" />
                                    <input
                                        ref={localImageFolderRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={handleLocalImages}
                                        title="Chọn thư mục ảnh local để upload"
                                        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                                    />
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {filterOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setPreviewFilter(option.value)}
                                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                                            previewFilter === option.value
                                                ? 'border-orange-300 bg-orange-50 text-orange-700'
                                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {option.label} ({option.count})
                                    </button>
                                ))}
                            </div>

                            <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-xs min-w-[1100px]">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left w-14">#</th>
                                            <th className="px-3 py-2 text-left min-w-[220px]">Dữ liệu</th>
                                            {PREVIEW_CHECK_KEYS.map((key) => (
                                                <th key={key} className="px-3 py-2 text-left min-w-[150px]">
                                                    {filteredRows[0]?.checks.find((check) => check.key === key)?.label || key}
                                                </th>
                                            ))}
                                            <th className="px-3 py-2 text-left min-w-[220px]">Kết luận</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredRows.slice(0, 100).map((row) => {
                                            const rowName = getValue(row.data, modeConfig.nameHeaders) || '(chưa có tên)';
                                            const rowStatus = row.errors.length > 0 ? 'error' : row.warnings.length > 0 ? 'warning' : 'ok';
                                            return (
                                                <tr key={row.rowNum} className={rowStatus === 'error' ? 'bg-red-50/40' : rowStatus === 'warning' ? 'bg-amber-50/40' : ''}>
                                                    <td className="px-3 py-2 text-gray-400">{row.rowNum}</td>
                                                    <td className="px-3 py-2">
                                                        <p className="font-medium text-gray-900 line-clamp-2">{rowName}</p>
                                                        <p className="text-gray-400 mt-0.5">{modeConfig.title}</p>
                                                    </td>
                                                    {PREVIEW_CHECK_KEYS.map((key) => {
                                                        const check = row.checks.find((item) => item.key === key);
                                                        if (!check) return <td key={key} className="px-3 py-2 text-gray-400">—</td>;
                                                        return (
                                                            <td key={key} className="px-3 py-2 align-top">
                                                                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${severityClasses(check.severity)}`}>
                                                                    {severityLabel(check.severity)}
                                                                </span>
                                                                <p className="mt-1 text-gray-700 line-clamp-2" title={check.value}>{check.value}</p>
                                                                <p className="mt-0.5 text-gray-400 line-clamp-2" title={check.message}>{check.message}</p>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-2 align-top">
                                                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${severityClasses(rowStatus)}`}>
                                                            {severityLabel(rowStatus)}
                                                        </span>
                                                        <div className="mt-2 space-y-1 text-gray-600">
                                                            {[...row.errors, ...row.warnings].slice(0, 3).map((message) => (
                                                                <p key={message} className="line-clamp-2" title={message}>{message}</p>
                                                            ))}
                                                            {row.errors.length + row.warnings.length === 0 && (
                                                                <p>Đủ điều kiện import.</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {filteredRows.length === 0 && (
                                    <div className="py-10 text-center text-sm text-gray-500">Không có dòng nào trong bộ lọc này.</div>
                                )}
                            </div>
                            {filteredRows.length > 100 && <p className="text-xs text-gray-400 text-center">Hiển thị 100/{filteredRows.length} dòng trong bộ lọc hiện tại</p>}
                        </div>
                    )}

                    {step === 'importing' && (
                        <div className="text-center py-10">
                            <Loader2 size={40} className="mx-auto text-orange-500 animate-spin mb-4" />
                            <p className="text-sm text-gray-600">Đang import... {progress.done}/{progress.total}</p>
                            <div className="w-64 mx-auto mt-3 bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-orange-500 h-2 rounded-full transition-all"
                                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {step === 'done' && (
                        <div className="text-center py-10">
                            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Import hoàn tất</h3>
                            <p className="text-sm text-gray-500">{importResults.success} thành công · {importResults.failed} lỗi</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 p-5 border-t shrink-0">
                    {step === 'preview' && (
                        <>
                            <button onClick={() => { setStep('upload'); setRows([]); setPreviewFilter('all'); setLocalImageProgress({ uploading: false, done: 0, total: 0 }); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                                Chọn lại
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={!canImport}
                                className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium"
                                title={canImport ? 'Import toàn bộ dữ liệu đã kiểm tra' : 'Cần sửa hết dòng lỗi trước khi import'}
                            >
                                {canImport ? `Import ${rows.length} dòng` : `Còn ${errorCount} dòng lỗi`}
                            </button>
                        </>
                    )}
                    {(step === 'done' || step === 'upload') && (
                        <button title="Đóng" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg">
                            Đóng
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
