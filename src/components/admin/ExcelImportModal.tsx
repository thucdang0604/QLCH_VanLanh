'use client';


import { useRef, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ClipboardList,
    Download,
    FolderOpen,
    Image as ImageIcon,
    Loader2,
    Package,
    ShoppingBag,
    Upload,
    Wrench,
    X,
} from 'lucide-react';
import { collection, doc, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import { buildProductCodeFromId, normalizeProductCode } from '@/lib/productCodes';
import { buildClientDocumentId } from '@/lib/clientDocumentIds';
import { buildContactMethods, buildContactSearchKeywords, getPrimaryContact, hasDebtSafeContact, hasProfileContact } from '@/lib/contactIdentity';
import { generateSearchKeywords, generateSlug } from '@/lib/utils';
import { triggerRevalidate } from '@/lib/revalidate';
import {
    ADDRESS_HEADERS,
    CUSTOMER_CODE_HEADERS,
    EMAIL_HEADERS,
    FIRESTORE_QUERY_CHUNK_SIZE,
    FACEBOOK_HEADERS,
    IMAGE_MAIN_HEADERS,
    IMAGE_OTHER_HEADERS,
    MODE_CONFIG,
    NOTE_HEADERS,
    OTHER_CONTACT_HEADERS,
    PHONE_HEADERS,
    QUALITY_OPTIONS,
    SUPPLIER_CODE_HEADERS,
    ZALO_HEADERS,
    buildCheck,
    buildImportContactInput,
    buildImportProductId,
    collectLocalImageRequirements,
    createInitialProductWithCodes,
    fileMatchesLocalReference,
    generateTemplate,
    getBoolean,
    getFileRelativePath,
    getNumber,
    getPreviewCheckKeys,
    getValue,
    getSignedNumber,
    imageUploadFolderForMode,
    isAccessoryCategory,
    isLocalImageReference,
    isValidHttpUrl,
    loadExistingDocIds,
    loadExistingProductCodes,
    normalizeConditionInput,
    normalizeImportPhone,
    normalizeLegacyImportDocId,
    normalizeText,
    normalizeLocalImageKey,
    normalizeMediaBaseName,
    parseImages,
    parseDebtInput,
    parseNumberInput,
    parseSpecs,
    productKindForMode,
    refreshImageChecks,
    replaceImageReferences,
    resolveCategoryPath,
    resolveCustomerImportDocId,
    resolveExpectedProductCode,
    resolveSupplierImportDocId,
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
    type CheckSeverity,
} from '@/features/excel-import/importSupport';

export type { ExcelImportMode } from '@/features/excel-import/importSupport';

function iconForMode(mode: ExcelImportMode) {
    if (MODE_CONFIG[mode].icon === 'part') return <Wrench size={22} className="text-emerald-600" />;
    if (MODE_CONFIG[mode].icon === 'service') return <Wrench size={22} className="text-blue-600" />;
    if (MODE_CONFIG[mode].icon === 'order') return <ShoppingBag size={22} className="text-indigo-600" />;
    if (MODE_CONFIG[mode].icon === 'repair') return <ClipboardList size={22} className="text-rose-600" />;
    return <Package size={22} className="text-orange-600" />;
}

const CUSTOMER_NAME_HEADERS = ['Tên KH', 'Tên khách hàng', 'Khách hàng', 'Customer Name'];
const ORDER_ID_HEADERS = ['Mã đơn', 'Order ID', 'Mã hóa đơn', 'orderId'];
const REPAIR_ID_HEADERS = ['Mã phiếu', 'Repair ID', 'Mã sửa chữa', 'repairId'];

function rawCellValue(row: ExcelRow, headers: string[]) {
    for (const header of headers) {
        const value = row[header];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
}

function buildCustomerImportIdentity(row: ExcelRow, name: string) {
    const contactInput = buildImportContactInput(row, name);
    const contactMethods = buildContactMethods(contactInput);
    const primaryContact = getPrimaryContact(contactMethods);
    const explicitId = normalizeLegacyImportDocId(getValue(row, CUSTOMER_CODE_HEADERS));
    const customerId = resolveCustomerImportDocId(row, name);
    return {
        customerId,
        explicitId,
        phone: contactInput.phone,
        phoneRaw: getValue(row, PHONE_HEADERS),
        contactInput,
        contactMethods,
        primaryContact,
        hasProfileContact: Boolean(explicitId) || hasProfileContact(contactMethods),
        hasDebtSafeContact: hasDebtSafeContact(contactMethods),
    };
}

function buildSupplierImportIdentity(row: ExcelRow, name: string) {
    const contactInput = buildImportContactInput(row, name);
    const contactMethods = buildContactMethods(contactInput);
    const primaryContact = getPrimaryContact(contactMethods);
    const explicitId = normalizeLegacyImportDocId(getValue(row, SUPPLIER_CODE_HEADERS));
    const supplierId = resolveSupplierImportDocId(row, name);
    return {
        supplierId,
        explicitId,
        phone: contactInput.phone,
        phoneRaw: getValue(row, PHONE_HEADERS),
        contactInput,
        contactMethods,
        primaryContact,
        hasProfileContact: Boolean(explicitId) || hasProfileContact(contactMethods),
        hasDebtSafeContact: hasDebtSafeContact(contactMethods),
    };
}

function formatContactCheckValue(identity: ReturnType<typeof buildCustomerImportIdentity> | ReturnType<typeof buildSupplierImportIdentity>, id: string) {
    return [
        id,
        identity.phone ? `SĐT ${identity.phone}` : '',
        identity.contactInput.zalo ? `Zalo: ${identity.contactInput.zalo}` : '',
        identity.contactInput.facebook ? `Facebook: ${identity.contactInput.facebook}` : '',
        identity.contactInput.email ? `Email: ${identity.contactInput.email}` : '',
        identity.contactInput.address ? `Địa chỉ: ${identity.contactInput.address}` : '',
        identity.contactInput.other ? `Khác: ${identity.contactInput.other}` : '',
        identity.contactInput.note ? `Ghi chú: ${identity.contactInput.note}` : '',
    ].filter(Boolean).join(' / ');
}

function parseLegacyDate(row: ExcelRow, headers: string[]): Date | null {
    const raw = rawCellValue(row, headers);
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const parsed = XLSX.SSF.parse_date_code(raw);
        if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
    }

    const text = String(raw || '').trim();
    if (!text) return null;
    const dmy = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (dmy) {
        const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
        const date = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCheckDate(date: Date | null): string {
    return date ? date.toLocaleDateString('vi-VN') : '';
}

function normalizeOrderStatus(raw: string): 'Pending' | 'Confirmed' | 'Shipping' | 'Completed' | 'Cancelled' {
    const normalized = normalizeText(raw);
    if (['pending', 'cho xu ly', 'cho xac nhan', 'moi'].includes(normalized)) return 'Pending';
    if (['confirmed', 'da xac nhan', 'xac nhan'].includes(normalized)) return 'Confirmed';
    if (['shipping', 'dang giao', 'giao hang'].includes(normalized)) return 'Shipping';
    if (['cancelled', 'canceled', 'huy', 'da huy'].includes(normalized)) return 'Cancelled';
    return 'Completed';
}

function normalizeOrderPaymentStatus(raw: string, methodRaw: string): 'paid' | 'unpaid' | 'debt' {
    const normalized = normalizeText(`${raw} ${methodRaw}`);
    if (normalized.includes('debt') || normalized.includes('ghi no') || normalized.includes('cong no')) return 'debt';
    if (normalized.includes('unpaid') || normalized.includes('chua thanh toan')) return 'unpaid';
    return 'paid';
}

function normalizeRepairPaymentStatus(raw: string): 'paid' | 'unpaid' | 'pay_later' {
    const normalized = normalizeText(raw);
    if (normalized.includes('debt') || normalized.includes('ghi no') || normalized.includes('cong no') || normalized.includes('pay_later')) return 'pay_later';
    if (normalized.includes('unpaid') || normalized.includes('chua thanh toan')) return 'unpaid';
    return 'paid';
}

function normalizePaymentMethod(raw: string): 'COD' | 'Bank' | 'Momo' | 'Card' | 'Installment' | 'Debt' | 'QR' {
    const normalized = normalizeText(raw);
    if (normalized.includes('debt') || normalized.includes('ghi no') || normalized.includes('cong no')) return 'Debt';
    if (normalized.includes('bank') || normalized.includes('chuyen khoan') || normalized.includes('ngan hang')) return 'Bank';
    if (normalized.includes('momo')) return 'Momo';
    if (normalized.includes('card') || normalized.includes('the')) return 'Card';
    if (normalized.includes('installment') || normalized.includes('tra gop')) return 'Installment';
    if (normalized.includes('qr')) return 'QR';
    return 'COD';
}

function parseOrderItems(row: ExcelRow, orderId: string) {
    const warrantyMonths = getNumber(row, ['Bảo hành tháng', 'Warranty Months']);
    const warrantyStartedAt = parseLegacyDate(row, ['Ngày bắt đầu BH', 'Warranty Started At']);
    const warrantyExpiresAt = parseLegacyDate(row, ['Ngày hết BH', 'Warranty Expires At']);
    const detailLines = getValue(row, ['Dòng hàng', 'Items', 'Chi tiết sản phẩm'])
        .split(/[\n;]+/)
        .map((line) => line.trim())
        .filter(Boolean);

    const buildItem = (productName: string, quantity: number, price: number, serialsRaw: string, lineWarrantyMonths = warrantyMonths, lineWarrantyExpiresAt = warrantyExpiresAt) => ({
        productId: `legacy-${generateSlug(productName || orderId)}`,
        productName: productName || 'Sản phẩm từ hệ thống cũ',
        quantity: Math.max(1, Math.floor(quantity || 1)),
        price: Math.max(0, price || 0),
        imeis: splitList(serialsRaw),
        warrantyMonths: lineWarrantyMonths || undefined,
        warrantyStartedAt: warrantyStartedAt?.getTime(),
        warrantyExpiresAt: lineWarrantyExpiresAt?.getTime(),
    });

    if (detailLines.length > 0) {
        return detailLines.map((line, index) => {
            const [nameRaw, quantityRaw, priceRaw, serialRaw, warrantyRaw, expiresRaw] = line.split('|').map((part) => part.trim());
            const lineWarrantyMonths = Number(warrantyRaw) || warrantyMonths;
            const lineWarrantyExpiresAt = expiresRaw ? parseLegacyDate({ value: expiresRaw }, ['value']) : warrantyExpiresAt;
            return buildItem(
                nameRaw || `Dòng hàng ${index + 1}`,
                Number(quantityRaw) || 1,
                Number(priceRaw?.replace(/[^\d-]/g, '')) || 0,
                serialRaw || '',
                lineWarrantyMonths,
                lineWarrantyExpiresAt,
            );
        });
    }

    return [buildItem(
        getValue(row, ['Sản phẩm', 'Tên SP', 'Product']),
        getNumber(row, ['Số lượng', 'Quantity']) || 1,
        getNumber(row, ['Đơn giá', 'Giá', 'Price']),
        getValue(row, ['IMEI/Serial', 'IMEI', 'Serial']),
    )];
}

function parseRepairIssues(row: ExcelRow) {
    return splitList(getValue(row, ['Lỗi/Bệnh', 'Lỗi', 'Bệnh', 'Issue', 'Issues'])).map((label, index) => ({
        id: `legacy-issue-${index + 1}`,
        label,
        estimatedPrice: 0,
        status: 'resolved' as const,
    }));
}

function parseRepairParts(row: ExcelRow) {
    return getValue(row, ['Linh kiện', 'Parts'])
        .split(/[\n;]+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const [nameRaw, quantityRaw, priceRaw, warrantyRaw, expiresRaw] = line.split('|').map((part) => part.trim());
            const warrantyExpiresAt = expiresRaw ? parseLegacyDate({ value: expiresRaw }, ['value']) : null;
            return {
                partLineId: `legacy-part-${index + 1}`,
                productId: `legacy-${generateSlug(nameRaw || `part-${index + 1}`)}`,
                productName: nameRaw || `Linh kiện ${index + 1}`,
                name: nameRaw || `Linh kiện ${index + 1}`,
                partName: nameRaw || `Linh kiện ${index + 1}`,
                quality: 'Không rõ',
                quantity: Math.max(1, Math.floor(Number(quantityRaw) || 1)),
                unitPriceAtUse: Number(priceRaw?.replace(/[^\d-]/g, '')) || 0,
                warrantyMonths: Number(warrantyRaw) || undefined,
                warrantyExpiresAt: warrantyExpiresAt || undefined,
                status: 'selected' as const,
            };
        });
}

function addMonths(date: Date, months: number): Date {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
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

                const taxonomy = (modeConfig.taxonomyType && config.taxonomy?.[modeConfig.taxonomyType]) || [];
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
                if (mode !== 'order' && mode !== 'repair') {
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
                }

                const existingDocIds = await loadExistingDocIds(modeConfig.collectionName, targetIds);
                const existingCodes = mode === 'service' || mode === 'customer' || mode === 'supplier' || mode === 'order' || mode === 'repair' ? new Set<string>() : await loadExistingProductCodes(expectedCodes);

                // --------------------------------------------------------
                // LUỒNG LAI (HYBRID RESOLUTION) - QUÉT ẢNH TRÙNG TÊN THÔ TRONG DB
                // --------------------------------------------------------
                const allImages = jsonRows.flatMap((row) => parseImages(row, IMAGE_MAIN_HEADERS, IMAGE_OTHER_HEADERS));
                const localImageSources = Array.from(new Set(allImages.filter(isLocalImageReference)));
                
                const autoMappedUrls = new Map<string, string>();
                const conflictedLocalKeys = new Set<string>();

                if (localImageSources.length > 0) {
                    const baseNameToSourceKeys = new Map<string, string[]>();
                    localImageSources.forEach((source) => {
                        const baseName = normalizeMediaBaseName(source);
                        const key = normalizeLocalImageKey(source);
                        const current = baseNameToSourceKeys.get(baseName) || [];
                        current.push(key);
                        baseNameToSourceKeys.set(baseName, current);
                    });

                    const baseNames = Array.from(baseNameToSourceKeys.keys());
                    const dbMatches = new Map<string, { url: string; hash?: string }[]>();

                    for (let index = 0; index < baseNames.length; index += FIRESTORE_QUERY_CHUNK_SIZE) {
                        const chunk = baseNames.slice(index, index + FIRESTORE_QUERY_CHUNK_SIZE);
                        const mediaQuery = query(
                            collection(db, 'media_library'),
                            where('normalizedBaseName', 'in', chunk)
                        );
                        const snapshot = await getDocs(mediaQuery);
                        snapshot.forEach((item) => {
                            const data = item.data();
                            const normalized = typeof data.normalizedBaseName === 'string' ? data.normalizedBaseName : '';
                            const url = typeof data.url === 'string' ? data.url : '';
                            const hash = typeof data.hash === 'string' ? data.hash : undefined;
                            if (normalized && url) {
                                const current = dbMatches.get(normalized) || [];
                                if (!current.some((x) => x.url === url || (hash && x.hash === hash))) {
                                    current.push({ url, hash });
                                }
                                dbMatches.set(normalized, current);
                            }
                        });
                    }

                    baseNameToSourceKeys.forEach((keys, baseName) => {
                        const matches = dbMatches.get(baseName) || [];
                        keys.forEach((key) => {
                            if (matches.length === 1) {
                                autoMappedUrls.set(key, matches[0].url);
                            } else if (matches.length > 1) {
                                conflictedLocalKeys.add(key);
                            }
                        });
                    });
                }

                const parsed = jsonRows.map((row, index) => {
                    const rowNum = index + 2;
                    
                    // Tạo bản sao processedRow để thay thế URL đã được map tự động
                    const processedRow = { ...row };
                    [...IMAGE_MAIN_HEADERS, ...IMAGE_OTHER_HEADERS].forEach((header) => {
                        const value = processedRow[header];
                        if (typeof value !== 'string' || !value.trim()) return;
                        const items = splitList(value);
                        if (items.length === 0) return;
                        const replaced = items.map((item) => {
                            const key = normalizeLocalImageKey(item);
                            return autoMappedUrls.get(key) || item;
                        });
                        processedRow[header] = replaced.join('; ');
                    });

                    const name = getValue(processedRow, modeConfig.nameHeaders);
                    const categoryPath = getValue(processedRow, ['Danh mục', 'Category']);
                    const { categoryIds, category } = resolveCategoryPath(categoryPath, taxonomy);
                    const targetDocId = resolveTargetDocId(mode, processedRow, modeConfig, taxonomy);
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

                    if (mode === 'customer') {
                        checks.length = 0;
                        const phoneRaw = getValue(processedRow, ['SĐT', 'sdt', 'phone', 'Phone', 'Số điện thoại']);
                        const phone = normalizeImportPhone(phoneRaw);
                        const customerTypeRaw = getValue(processedRow, ['Loại KH', 'Customer Type', 'Type']);
                        const customerType = customerTypeRaw.toLowerCase();
                        const email = getValue(processedRow, ['Email']);
                        const totalSpentInput = parseNumberInput(processedRow, ['Chi tiêu', 'Spent', 'Tổng chi tiêu']);
                        const totalOrdersInput = parseNumberInput(processedRow, ['Đơn hàng', 'Orders', 'Tổng đơn hàng']);
                        const totalRepairsInput = parseNumberInput(processedRow, ['Sửa chữa', 'Repairs', 'Tổng sửa chữa']);
                        const debtInput = parseDebtInput(processedRow, ['Công nợ', 'Nợ', 'Debt']);
                        const identity = buildCustomerImportIdentity(processedRow, name);

                        if (!name) {
                            checks.push(buildCheck('name', 'Tên', '', 'error', 'Thiếu tên khách hàng'));
                        } else {
                            checks.push(buildCheck('name', 'Tên', name, 'ok', 'Tên khách hàng hợp lệ'));
                        }

                        if (phoneRaw && !/^\d{9,15}$/.test(phone)) {
                            checks.push(buildCheck('phone', 'SĐT', phoneRaw, 'error', 'SĐT cần có 9-15 chữ số'));
                        } else if (!identity.hasProfileContact) {
                            checks.push(buildCheck('phone', 'Liên hệ', '', 'error', 'Cần SĐT, Mã KH, Zalo, Facebook, email, địa chỉ hoặc ghi chú nhận diện'));
                        } else if (duplicateTargetIdsInFile.has(identity.customerId)) {
                            checks.push(buildCheck('phone', 'Liên hệ', formatContactCheckValue(identity, identity.customerId), 'error', `Trùng ID khách hàng trong file: ${identity.customerId}`));
                        } else if (existingDocIds.has(identity.customerId)) {
                            checks.push(buildCheck('phone', 'Liên hệ', formatContactCheckValue(identity, identity.customerId), 'error', `Khách hàng ${identity.customerId} đã tồn tại`));
                        } else {
                            checks.push(buildCheck('phone', 'Liên hệ', formatContactCheckValue(identity, identity.customerId), 'ok', `ID sẽ tạo: ${identity.customerId}`));
                        }

                        if (!customerTypeRaw || ['khách lẻ', 'khach le', 'retail', 'le', 'khách sỉ', 'khach si', 'wholesale', 'si'].includes(customerType)) {
                            checks.push(buildCheck('type', 'Loại KH', customerTypeRaw || 'Khách lẻ', 'ok', customerTypeRaw ? 'Loại khách hợp lệ' : 'Mặc định Khách lẻ'));
                        } else {
                            checks.push(buildCheck('type', 'Loại KH', customerTypeRaw, 'warning', 'Không nhận diện loại khách, sẽ lưu Khách lẻ'));
                        }

                        const emailSeverity: CheckSeverity = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'warning' : 'ok';
                        checks.push(buildCheck('email', 'Email', email, emailSeverity, emailSeverity === 'ok' ? 'Email có thể import' : 'Email không đúng định dạng'));

                        const statsIssues = [
                            totalSpentInput.hasValue && !totalSpentInput.isValid ? 'Chi tiêu' : '',
                            totalOrdersInput.hasValue && !totalOrdersInput.isValid ? 'Đơn hàng' : '',
                            totalRepairsInput.hasValue && !totalRepairsInput.isValid ? 'Sửa chữa' : '',
                        ].filter(Boolean);
                        checks.push(buildCheck(
                            'stats',
                            'Thống kê',
                            [totalSpentInput.raw, totalOrdersInput.raw, totalRepairsInput.raw].filter(Boolean).join(' / '),
                            statsIssues.length > 0 ? 'error' : 'ok',
                            statsIssues.length > 0 ? `${statsIssues.join(', ')} không hợp lệ` : 'Thống kê có thể import',
                        ));

                        checks.push(buildCheck(
                            'debt',
                            'Công nợ',
                            debtInput.raw,
                            !debtInput.isValid || (debtInput.hasValue && debtInput.value !== 0 && !identity.hasDebtSafeContact) ? 'error' : 'ok',
                            !debtInput.isValid
                                ? 'Công nợ không hợp lệ'
                                : debtInput.hasValue && debtInput.value !== 0 && !identity.hasDebtSafeContact
                                    ? 'Công nợ cần kênh liên hệ rõ như SĐT, Zalo, Facebook, email hoặc địa chỉ'
                                    : 'Công nợ có thể import',
                        ));
                        checks.push(buildCheck('details', 'Thông tin thêm', getValue(processedRow, ['Tags', 'Ghi chú', 'Note']), 'ok', 'Thông tin phụ có thể import'));

                        const errors = summarizeChecks(checks, 'error');
                        const warnings = summarizeChecks(checks, 'warning');
                        return { rowNum, data: processedRow, errors, warnings, checks, categoryIds: [], category: '' };
                    }

                    if (mode === 'supplier') {
                        checks.length = 0;
                        const phoneRaw = getValue(processedRow, ['SĐT', 'sdt', 'phone', 'Phone', 'Số điện thoại']);
                        const phone = normalizeImportPhone(phoneRaw);
                        const email = getValue(processedRow, ['Email']);
                        const contact = getValue(processedRow, ['Người liên hệ', 'Contact']);
                        const bank = [getValue(processedRow, ['Số tài khoản', 'Bank Account']), getValue(processedRow, ['Ngân hàng', 'Bank'])].filter(Boolean).join(' / ');
                        const paymentTermsInput = parseNumberInput(processedRow, ['Hạn thanh toán', 'Payment Terms']);
                        const debtInput = parseDebtInput(processedRow, ['Công nợ', 'Nợ', 'Debt']);
                        const identity = buildSupplierImportIdentity(processedRow, name);

                        if (!name) {
                            checks.push(buildCheck('name', 'Tên', '', 'error', 'Thiếu tên nhà cung cấp'));
                        } else if (duplicateInFile.has(name.toLowerCase())) {
                            checks.push(buildCheck('name', 'Tên', name, 'error', 'Trùng tên trong file'));
                        } else if (duplicateTargetIdsInFile.has(identity.supplierId)) {
                            checks.push(buildCheck('name', 'Tên', name, 'error', `Trùng ID nhà cung cấp trong file: ${identity.supplierId}`));
                        } else if (existingDocIds.has(identity.supplierId)) {
                            checks.push(buildCheck('name', 'Tên', name, 'error', `Nhà cung cấp ${identity.supplierId} đã tồn tại`));
                        } else if (existingNames.has(name.toLowerCase())) {
                            checks.push(buildCheck('name', 'Tên', name, 'error', 'Tên đã tồn tại trên hệ thống'));
                        } else {
                            checks.push(buildCheck('name', 'Tên', name, 'ok', `ID sẽ tạo: ${identity.supplierId}`));
                        }

                        if (phoneRaw && !/^\d{9,15}$/.test(phone)) {
                            checks.push(buildCheck('phone', 'SĐT', phoneRaw, 'error', 'SĐT cần có 9-15 chữ số'));
                        } else if (!identity.hasProfileContact) {
                            checks.push(buildCheck('phone', 'Liên hệ', '', 'error', 'Cần SĐT, Mã NCC, Zalo, Facebook, email, địa chỉ hoặc ghi chú nhận diện'));
                        } else {
                            checks.push(buildCheck('phone', 'Liên hệ', formatContactCheckValue(identity, identity.supplierId), 'ok', 'Liên hệ NCC có thể import'));
                        }

                        checks.push(buildCheck('contact', 'Liên hệ', contact, contact ? 'ok' : 'warning', contact ? 'Người liên hệ có thể import' : 'Thiếu người liên hệ'));
                        const emailSeverity: CheckSeverity = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'warning' : 'ok';
                        checks.push(buildCheck('email', 'Email', email, emailSeverity, emailSeverity === 'ok' ? 'Email có thể import' : 'Email không đúng định dạng'));
                        checks.push(buildCheck('bank', 'Ngân hàng', bank, bank ? 'ok' : 'warning', bank ? 'Thông tin ngân hàng có thể import' : 'Thiếu thông tin ngân hàng'));
                        checks.push(buildCheck(
                            'terms',
                            'Hạn thanh toán',
                            paymentTermsInput.raw,
                            paymentTermsInput.isValid ? 'ok' : 'error',
                            paymentTermsInput.isValid ? 'Hạn thanh toán có thể import' : 'Hạn thanh toán không hợp lệ',
                        ));
                        checks.push(buildCheck(
                            'debt',
                            'Công nợ',
                            debtInput.raw,
                            !debtInput.isValid || (debtInput.hasValue && debtInput.value !== 0 && !identity.hasDebtSafeContact) ? 'error' : 'ok',
                            !debtInput.isValid
                                ? 'Công nợ không hợp lệ'
                                : debtInput.hasValue && debtInput.value !== 0 && !identity.hasDebtSafeContact
                                    ? 'Công nợ NCC còn sót cần kênh liên hệ rõ; không tạo phiếu nhập hàng lịch sử'
                                    : 'Chỉ import số dư công nợ NCC còn sót, không import phiếu nhập hàng lịch sử',
                        ));
                        checks.push(buildCheck('details', 'Thông tin thêm', getValue(processedRow, ['Phân loại', 'Tags', 'Ghi chú', 'Note']), 'ok', 'Thông tin phụ có thể import'));

                        const errors = summarizeChecks(checks, 'error');
                        const warnings = summarizeChecks(checks, 'warning');
                        return { rowNum, data: processedRow, errors, warnings, checks, categoryIds: [], category: '' };
                    }

                    if (mode === 'order') {
                        checks.length = 0;
                        const orderIdRaw = getValue(processedRow, ORDER_ID_HEADERS);
                        const orderId = normalizeLegacyImportDocId(orderIdRaw);
                        const customerName = getValue(processedRow, CUSTOMER_NAME_HEADERS);
                        const phoneRaw = getValue(processedRow, PHONE_HEADERS);
                        const phone = normalizeImportPhone(phoneRaw);
                        const productRaw = getValue(processedRow, ['Dòng hàng', 'Items', 'Chi tiết sản phẩm', 'Sản phẩm', 'Tên SP', 'Product']);
                        const totalInput = parseNumberInput(processedRow, ['Tổng tiền', 'Total']);
                        const subtotalInput = parseNumberInput(processedRow, ['Tạm tính', 'Subtotal']);
                        const discountInput = parseNumberInput(processedRow, ['Giảm giá', 'Discount']);
                        const paymentRaw = getValue(processedRow, ['Thanh toán', 'Payment Status']);
                        const methodRaw = getValue(processedRow, ['Phương thức', 'Payment Method']);
                        const statusRaw = getValue(processedRow, ['Trạng thái', 'Status']);
                        const createdAt = parseLegacyDate(processedRow, ['Ngày tạo', 'Created At']);
                        const completedAt = parseLegacyDate(processedRow, ['Ngày hoàn thành', 'Completed At']);
                        const warrantyExpiresAt = parseLegacyDate(processedRow, ['Ngày hết BH', 'Warranty Expires At']);
                        const identity = buildCustomerImportIdentity(processedRow, customerName);
                        const paymentStatus = normalizeOrderPaymentStatus(paymentRaw, methodRaw);

                        if (!orderIdRaw) {
                            checks.push(buildCheck('name', 'Mã đơn', '', 'error', 'Thiếu mã đơn hàng từ hệ thống cũ'));
                        } else if (!orderId) {
                            checks.push(buildCheck('name', 'Mã đơn', orderIdRaw, 'error', 'Mã đơn không hợp lệ để làm ID Firestore'));
                        } else if (duplicateTargetIdsInFile.has(orderId)) {
                            checks.push(buildCheck('name', 'Mã đơn', orderId, 'error', `Trùng mã đơn trong file: ${orderId}`));
                        } else if (existingDocIds.has(orderId)) {
                            checks.push(buildCheck('name', 'Mã đơn', orderId, 'error', `Đơn hàng ${orderId} đã tồn tại`));
                        } else {
                            checks.push(buildCheck('name', 'Mã đơn', orderId, 'ok', 'Mã đơn có thể import'));
                        }

                        if (!customerName) {
                            checks.push(buildCheck('phone', 'Khách hàng', phoneRaw, 'error', 'Thiếu tên khách hàng'));
                        } else if (phoneRaw && !/^\d{9,15}$/.test(phone)) {
                            checks.push(buildCheck('phone', 'Khách hàng', [customerName, phoneRaw].filter(Boolean).join(' / '), 'error', 'SĐT khách hàng cần có 9-15 chữ số'));
                        } else if (!identity.hasProfileContact) {
                            checks.push(buildCheck('phone', 'Khách hàng', customerName, 'error', 'Cần SĐT, Mã KH, Zalo, Facebook, email, địa chỉ hoặc ghi chú nhận diện'));
                        } else if (paymentStatus === 'debt' && !identity.hasDebtSafeContact) {
                            checks.push(buildCheck('phone', 'Khách hàng', formatContactCheckValue(identity, identity.customerId), 'error', 'Đơn còn nợ cần kênh liên hệ rõ như SĐT, Zalo, Facebook, email hoặc địa chỉ'));
                        } else {
                            checks.push(buildCheck('phone', 'Khách hàng', `${customerName} / ${formatContactCheckValue(identity, identity.customerId)}`, 'ok', 'Thông tin khách hàng hợp lệ'));
                        }

                        checks.push(buildCheck(
                            'items',
                            'Sản phẩm',
                            productRaw,
                            productRaw ? 'ok' : 'error',
                            productRaw ? 'Có dữ liệu sản phẩm/bảo hành để lưu vào đơn' : 'Thiếu sản phẩm hoặc dòng hàng của đơn cũ',
                        ));

                        const moneyIssues = [
                            totalInput.hasValue && !totalInput.isValid ? 'Tổng tiền' : '',
                            subtotalInput.hasValue && !subtotalInput.isValid ? 'Tạm tính' : '',
                            discountInput.hasValue && !discountInput.isValid ? 'Giảm giá' : '',
                        ].filter(Boolean);
                        checks.push(buildCheck(
                            'amount',
                            'Số tiền',
                            [subtotalInput.raw, discountInput.raw, totalInput.raw].filter(Boolean).join(' / '),
                            !totalInput.hasValue || moneyIssues.length > 0 ? 'error' : 'ok',
                            !totalInput.hasValue ? 'Thiếu tổng tiền đơn hàng' : moneyIssues.length > 0 ? `${moneyIssues.join(', ')} không hợp lệ` : 'Số tiền có thể import',
                        ));

                        checks.push(buildCheck('payment', 'Thanh toán', [paymentRaw || paymentStatus, methodRaw || normalizePaymentMethod(methodRaw)].filter(Boolean).join(' / '), 'ok', 'Trạng thái thanh toán sẽ được chuẩn hóa'));
                        checks.push(buildCheck('status', 'Trạng thái', statusRaw || 'Completed', 'ok', `Sẽ lưu trạng thái đơn: ${normalizeOrderStatus(statusRaw)}`));

                        checks.push(buildCheck(
                            'dates',
                            'Thời gian',
                            [formatCheckDate(createdAt), formatCheckDate(completedAt)].filter(Boolean).join(' / '),
                            createdAt ? 'ok' : 'error',
                            createdAt ? 'Mốc thời gian lịch sử hợp lệ' : 'Thiếu hoặc sai ngày tạo đơn',
                        ));
                        checks.push(buildCheck(
                            'warranty',
                            'Bảo hành',
                            [getValue(processedRow, ['Bảo hành tháng', 'Warranty Months']), formatCheckDate(warrantyExpiresAt)].filter(Boolean).join(' / '),
                            warrantyExpiresAt || getValue(processedRow, ['Bảo hành tháng', 'Warranty Months']) ? 'ok' : 'warning',
                            warrantyExpiresAt || getValue(processedRow, ['Bảo hành tháng', 'Warranty Months']) ? 'Có thông tin bảo hành' : 'Thiếu thông tin bảo hành cho dòng hàng',
                        ));

                        const errors = summarizeChecks(checks, 'error');
                        const warnings = summarizeChecks(checks, 'warning');
                        return { rowNum, data: processedRow, errors, warnings, checks, categoryIds: [], category: '' };
                    }

                    if (mode === 'repair') {
                        checks.length = 0;
                        const repairIdRaw = getValue(processedRow, REPAIR_ID_HEADERS);
                        const repairId = normalizeLegacyImportDocId(repairIdRaw);
                        const customerName = getValue(processedRow, CUSTOMER_NAME_HEADERS);
                        const phoneRaw = getValue(processedRow, PHONE_HEADERS);
                        const phone = normalizeImportPhone(phoneRaw);
                        const device = getValue(processedRow, ['Thiết bị', 'Dòng máy', 'Device']);
                        const issuesRaw = getValue(processedRow, ['Lỗi/Bệnh', 'Lỗi', 'Bệnh', 'Issue', 'Issues']);
                        const partsRaw = getValue(processedRow, ['Linh kiện', 'Parts']);
                        const statusRaw = getValue(processedRow, ['Trạng thái', 'Status']);
                        const receivedAt = parseLegacyDate(processedRow, ['Ngày nhận', 'Received At']);
                        const completedAt = parseLegacyDate(processedRow, ['Ngày hoàn thành', 'Completed At']);
                        const warrantyExpiresAt = parseLegacyDate(processedRow, ['Ngày hết BH dịch vụ', 'Service Warranty Expires At']);
                        const amountInput = parseNumberInput(processedRow, ['Tổng tiền', 'Total']);
                        const partsCostInput = parseNumberInput(processedRow, ['Tiền linh kiện', 'Parts Cost']);
                        const laborCostInput = parseNumberInput(processedRow, ['Phí sửa chữa', 'Labor Cost']);
                        const additionalFeesInput = parseNumberInput(processedRow, ['Phí phát sinh', 'Additional Fees']);
                        const discountInput = parseNumberInput(processedRow, ['Giảm giá', 'Discount']);
                        const identity = buildCustomerImportIdentity(processedRow, customerName);
                        const paymentStatus = normalizeRepairPaymentStatus(getValue(processedRow, ['Thanh toán', 'Payment Status']));

                        if (!repairIdRaw) {
                            checks.push(buildCheck('name', 'Mã phiếu', '', 'error', 'Thiếu mã phiếu sửa chữa từ hệ thống cũ'));
                        } else if (!repairId) {
                            checks.push(buildCheck('name', 'Mã phiếu', repairIdRaw, 'error', 'Mã phiếu không hợp lệ để làm ID Firestore'));
                        } else if (duplicateTargetIdsInFile.has(repairId)) {
                            checks.push(buildCheck('name', 'Mã phiếu', repairId, 'error', `Trùng mã phiếu trong file: ${repairId}`));
                        } else if (existingDocIds.has(repairId)) {
                            checks.push(buildCheck('name', 'Mã phiếu', repairId, 'error', `Phiếu sửa ${repairId} đã tồn tại`));
                        } else {
                            checks.push(buildCheck('name', 'Mã phiếu', repairId, 'ok', 'Mã phiếu có thể import'));
                        }

                        if (!customerName) {
                            checks.push(buildCheck('phone', 'Khách hàng', phoneRaw, 'error', 'Thiếu tên khách hàng'));
                        } else if (phoneRaw && !/^\d{9,15}$/.test(phone)) {
                            checks.push(buildCheck('phone', 'Khách hàng', [customerName, phoneRaw].filter(Boolean).join(' / '), 'error', 'SĐT khách hàng cần có 9-15 chữ số'));
                        } else if (!identity.hasProfileContact) {
                            checks.push(buildCheck('phone', 'Khách hàng', customerName, 'error', 'Cần SĐT, Mã KH, Zalo, Facebook, email, địa chỉ hoặc ghi chú nhận diện'));
                        } else if (paymentStatus === 'pay_later' && !identity.hasDebtSafeContact) {
                            checks.push(buildCheck('phone', 'Khách hàng', formatContactCheckValue(identity, identity.customerId), 'error', 'Phiếu sửa trả sau cần kênh liên hệ rõ như SĐT, Zalo, Facebook, email hoặc địa chỉ'));
                        } else {
                            checks.push(buildCheck('phone', 'Khách hàng', `${customerName} / ${formatContactCheckValue(identity, identity.customerId)}`, 'ok', 'Thông tin khách hàng hợp lệ'));
                        }

                        checks.push(buildCheck('device', 'Thiết bị', device, device ? 'ok' : 'error', device ? 'Có thông tin thiết bị' : 'Thiếu thiết bị cần sửa'));
                        checks.push(buildCheck('issues', 'Lỗi/Bệnh', issuesRaw, issuesRaw ? 'ok' : 'error', issuesRaw ? 'Có lỗi/bệnh lịch sử' : 'Thiếu lỗi hoặc bệnh của phiếu'));

                        const moneyIssues = [
                            amountInput.hasValue && !amountInput.isValid ? 'Tổng tiền' : '',
                            partsCostInput.hasValue && !partsCostInput.isValid ? 'Tiền linh kiện' : '',
                            laborCostInput.hasValue && !laborCostInput.isValid ? 'Phí sửa chữa' : '',
                            additionalFeesInput.hasValue && !additionalFeesInput.isValid ? 'Phí phát sinh' : '',
                            discountInput.hasValue && !discountInput.isValid ? 'Giảm giá' : '',
                        ].filter(Boolean);
                        checks.push(buildCheck(
                            'amount',
                            'Số tiền',
                            [partsCostInput.raw, laborCostInput.raw, amountInput.raw].filter(Boolean).join(' / '),
                            moneyIssues.length > 0 ? 'error' : 'ok',
                            moneyIssues.length > 0 ? `${moneyIssues.join(', ')} không hợp lệ` : 'Chi phí sửa chữa có thể import',
                        ));
                        checks.push(buildCheck('payment', 'Thanh toán', getValue(processedRow, ['Thanh toán', 'Payment Status']) || 'paid', 'ok', 'Trạng thái thanh toán sẽ được chuẩn hóa'));
                        checks.push(buildCheck('status', 'Trạng thái', statusRaw, statusRaw ? 'ok' : 'error', statusRaw ? 'Giữ nguyên trạng thái phiếu từ Excel' : 'Thiếu trạng thái phiếu'));
                        checks.push(buildCheck('warranty', 'Bảo hành', [getValue(processedRow, ['Bảo hành dịch vụ tháng']), formatCheckDate(warrantyExpiresAt)].filter(Boolean).join(' / '), warrantyExpiresAt || getValue(processedRow, ['Bảo hành dịch vụ tháng']) ? 'ok' : 'warning', warrantyExpiresAt || getValue(processedRow, ['Bảo hành dịch vụ tháng']) ? 'Có thông tin bảo hành dịch vụ' : 'Thiếu bảo hành dịch vụ'));
                        checks.push(buildCheck('details', 'Chi tiết', partsRaw || getValue(processedRow, ['Ghi chú kỹ thuật', 'Ghi chú']), partsRaw ? 'ok' : 'warning', partsRaw ? 'Có linh kiện lịch sử' : 'Không có linh kiện, vẫn import được phiếu sửa không thay linh kiện'));

                        checks.push(buildCheck(
                            'dates',
                            'Thời gian',
                            [formatCheckDate(receivedAt), formatCheckDate(completedAt)].filter(Boolean).join(' / '),
                            receivedAt ? 'ok' : 'error',
                            receivedAt ? 'Mốc nhận máy hợp lệ' : 'Thiếu hoặc sai ngày nhận máy',
                        ));

                        const errors = summarizeChecks(checks, 'error');
                        const warnings = summarizeChecks(checks, 'warning');
                        return { rowNum, data: processedRow, errors, warnings, checks, categoryIds: [], category: '' };
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

                    const priceOriginalInput = parseNumberInput(processedRow, ['Giá gốc', 'Giá']);
                    const pricePromoInput = parseNumberInput(processedRow, ['Giá KM', 'Giá bán']);
                    const costInput = parseNumberInput(processedRow, ['Giá vốn', 'Cost']);

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

                    const stockInput = parseNumberInput(processedRow, ['Tồn kho', 'Stock']);
                    if (!stockInput.hasValue) {
                        checks.push(buildCheck('stock', 'Tồn kho', '', 'warning', 'Để trống sẽ nhập tồn kho 0'));
                    } else if (!stockInput.isValid) {
                        checks.push(buildCheck('stock', 'Tồn kho', stockInput.raw, 'error', 'Tồn kho phải là số không âm'));
                    } else {
                        checks.push(buildCheck('stock', 'Tồn kho', stockInput.raw, 'ok', 'Tồn kho hợp lệ'));
                    }

                    const customCode = getValue(processedRow, ['Mã hàng', 'SKU', 'Barcode']);
                    const normalizedCode = normalizeProductCode(customCode);
                    const expectedCode = resolveExpectedProductCode(mode, processedRow, modeConfig, taxonomy);
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

                    const images = parseImages(processedRow, IMAGE_MAIN_HEADERS, IMAGE_OTHER_HEADERS);
                    const invalidImages = images.filter((image) => !isValidHttpUrl(image) && !isLocalImageReference(image));
                    const localImages = images.filter(isLocalImageReference);
                    if (invalidImages.length > 0) {
                        checks.push(buildCheck('images', 'Ảnh', invalidImages[0], 'error', 'Ảnh phải là URL http/https hoặc đường dẫn file ảnh local'));
                    } else if (localImages.length > 0) {
                        const hasConflict = localImages.some((image) => conflictedLocalKeys.has(normalizeLocalImageKey(image)));
                        if (hasConflict) {
                            checks.push(buildCheck('images', 'Ảnh', localImages[0], 'warning', `Xung đột ảnh: Có nhiều ảnh khác nhau cùng tên trên hệ thống. Vui lòng chọn file thực tế để phân giải.`));
                        } else {
                            checks.push(buildCheck('images', 'Ảnh', localImages[0], 'error', `Có ${localImages.length} ảnh local cần chọn file để upload`));
                        }
                    } else {
                        checks.push(images.length > 0
                            ? buildCheck('images', 'Ảnh', `${images.length} URL`, 'ok', 'Có ảnh')
                            : buildCheck('images', 'Ảnh', '', 'warning', 'Thiếu ảnh, item sẽ không có hình hiển thị')
                        );
                    }

                    if (mode === 'part') {
                        const partType = getValue(processedRow, ['Loại linh kiện', 'Part Type']);
                        const quality = getValue(processedRow, ['Chất lượng', 'Phân loại']);
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
                        const warranty = getValue(processedRow, ['Bảo hành', 'Warranty']);
                        const repairTime = getValue(processedRow, ['Thời gian sửa', 'Repair Time']);
                        if (!warranty || !repairTime) {
                            checks.push(buildCheck('details', 'Thông tin thêm', [warranty, repairTime].filter(Boolean).join(' / '), 'warning', 'Nên có bảo hành và thời gian sửa'));
                        } else {
                            checks.push(buildCheck('details', 'Thông tin thêm', `${warranty} / ${repairTime}`, 'ok', 'Thông tin dịch vụ đủ'));
                        }
                    } else {
                        const brand = getValue(processedRow, ['Thương hiệu', 'Brand']);
                        const specs = getValue(processedRow, ['Thông số', 'Specs']);
                        const rawCondition = getValue(processedRow, ['Tình trạng', 'Condition']);
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
                    return { rowNum, data: processedRow, errors, warnings, checks, categoryIds, category };
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

    const calculateHash = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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
            const { getDoc, doc } = await import('firebase/firestore');

            for (const item of matched) {
                const fileKey = normalizeLocalImageKey(getFileRelativePath(item.file));
                const hash = await calculateHash(item.file);
                const docId = `MED-import-${folder}-${hash}`;

                if (!imageResolveCache.has(fileKey)) {
                    imageResolveCache.set(fileKey, (async () => {
                        const mediaDocRef = doc(db, 'media_library', docId);
                        const mediaDocSnap = await getDoc(mediaDocRef);

                        if (mediaDocSnap.exists()) {
                            return { url: mediaDocSnap.data().url as string, reused: true };
                        }
                        
                        const newUrl = await uploadInitialImportImage(item.file, folder, hash);
                        return { url: newUrl, reused: false };
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
        if (mode === 'service' || mode === 'customer' || mode === 'supplier' || mode === 'order' || mode === 'repair') {
            throw new Error(`${modeConfig.title} không được import bằng luồng sản phẩm.`);
        }
        const productMode = mode;
        const productId = buildImportProductId(productMode, name, productMode === 'accessory' ? 'phu-kien' : row.category);
        const kind = productKindForMode(productMode, category, row.categoryIds);
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

    const importCustomerRow = async (row: ParsedRow) => {
        const name = getValue(row.data, modeConfig.nameHeaders);
        const identity = buildCustomerImportIdentity(row.data, name);
        if (!identity.hasProfileContact) throw new Error('Thiếu kênh liên hệ hoặc mã khách hàng.');

        const rawType = getValue(row.data, ['Loại KH', 'Customer Type', 'Type']).toLowerCase();
        const type = ['khách sỉ', 'khach si', 'wholesale', 'si'].includes(rawType) ? 'wholesale' : 'retail';
        const totalDebt = getSignedNumber(row.data, ['Công nợ', 'Nợ', 'Debt']);
        if (totalDebt !== 0 && !identity.hasDebtSafeContact) throw new Error('Công nợ khách hàng cần kênh liên hệ rõ.');
        const totalSpent = getNumber(row.data, ['Chi tiêu', 'Spent', 'Tổng chi tiêu']);
        const totalOrders = getNumber(row.data, ['Đơn hàng', 'Orders', 'Tổng đơn hàng']);
        const totalRepairs = getNumber(row.data, ['Sửa chữa', 'Repairs', 'Tổng sửa chữa']);
        const customerRef = doc(db, 'customers', identity.customerId);
        const txRef = totalDebt !== 0 ? doc(db, 'customer_transactions', buildClientDocumentId('CT', identity.customerId)) : null;

        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(customerRef);
            if (snapshot.exists()) {
                throw new Error(`Khách hàng ${identity.customerId} đã tồn tại.`);
            }

            transaction.set(customerRef, {
                id: identity.customerId,
                phone: identity.phone,
                primaryPhone: identity.phone,
                name,
                type,
                primaryContactType: identity.primaryContact?.type || null,
                primaryContactValue: identity.primaryContact?.value || '',
                contactMethods: identity.contactMethods,
                searchKeywords: buildContactSearchKeywords(identity.contactInput, identity.contactMethods),
                email: getValue(row.data, ['Email']),
                address: getValue(row.data, ['Địa chỉ', 'Address']),
                zalo: getValue(row.data, ZALO_HEADERS),
                facebook: getValue(row.data, FACEBOOK_HEADERS),
                otherContact: getValue(row.data, OTHER_CONTACT_HEADERS),
                tags: splitList(getValue(row.data, ['Tags', 'Tag'])),
                note: getValue(row.data, ['Ghi chú', 'Note']),
                totalSpent,
                totalOrders,
                totalRepairs,
                totalDebt,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastVisit: serverTimestamp(),
            });

            if (txRef) {
                transaction.set(txRef, {
                    customerId: identity.customerId,
                    customerName: name || identity.customerId,
                    type: totalDebt > 0 ? 'DEBT' : 'PAYMENT',
                    amount: Math.abs(totalDebt),
                    paymentMethod: 'INITIAL_EXCEL_IMPORT',
                    note: 'Công nợ khởi tạo từ import Excel',
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || user?.email || '',
                    createdAt: serverTimestamp(),
                });
            }
        });
    };

    const importSupplierRow = async (row: ParsedRow) => {
        const name = getValue(row.data, modeConfig.nameHeaders);
        if (!name) throw new Error('Thiếu tên nhà cung cấp.');

        const identity = buildSupplierImportIdentity(row.data, name);
        if (!identity.hasProfileContact) throw new Error('Thiếu kênh liên hệ hoặc mã nhà cung cấp.');
        const supplierId = identity.supplierId;
        const supplierRef = doc(db, 'suppliers', supplierId);
        const totalDebt = getSignedNumber(row.data, ['Công nợ', 'Nợ', 'Debt']);
        if (totalDebt !== 0 && !identity.hasDebtSafeContact) throw new Error('Công nợ NCC còn sót cần kênh liên hệ rõ.');
        const txRef = totalDebt !== 0 ? doc(db, 'supplier_transactions', buildClientDocumentId('ST', supplierId)) : null;

        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(supplierRef);
            if (snapshot.exists()) {
                throw new Error(`Nhà cung cấp ${supplierId} đã tồn tại.`);
            }

            transaction.set(supplierRef, {
                id: supplierId,
                code: identity.explicitId || supplierId,
                name,
                phone: identity.phone,
                primaryPhone: identity.phone,
                primaryContactType: identity.primaryContact?.type || null,
                primaryContactValue: identity.primaryContact?.value || '',
                contactMethods: identity.contactMethods,
                searchKeywords: buildContactSearchKeywords(identity.contactInput, identity.contactMethods),
                contactPerson: getValue(row.data, ['Người liên hệ', 'Contact']),
                email: getValue(row.data, ['Email']),
                address: getValue(row.data, ['Địa chỉ', 'Address']),
                companyName: getValue(row.data, ['Công ty', 'Company']),
                supplierType: getValue(row.data, ['Phân loại', 'Supplier Type']),
                taxCode: getValue(row.data, ['Mã số thuế', 'Tax Code']),
                bankAccount: getValue(row.data, ['Số tài khoản', 'Bank Account']),
                bankName: getValue(row.data, ['Ngân hàng', 'Bank']),
                paymentTermsDays: getNumber(row.data, ['Hạn thanh toán', 'Payment Terms']),
                assignedOwner: getValue(row.data, ['Phụ trách', 'Assigned Owner']),
                tags: splitList(getValue(row.data, ['Tags', 'Tag'])),
                note: getValue(row.data, ['Ghi chú', 'Note']),
                totalDebt,
                isActive: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            if (txRef) {
                transaction.set(txRef, {
                    supplierId,
                    supplierName: name,
                    type: totalDebt > 0 ? 'IMPORT' : 'PAYMENT',
                    amount: Math.abs(totalDebt),
                    paymentMethod: 'INITIAL_BALANCE_EXCEL_IMPORT',
                    note: 'Số dư công nợ NCC còn sót từ hệ thống cũ; không tạo phiếu nhập hàng lịch sử',
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || user?.email || '',
                    createdAt: serverTimestamp(),
                });
            }
        });
    };

    const importLegacyOrderRow = async (row: ParsedRow) => {
        const orderId = normalizeLegacyImportDocId(getValue(row.data, ORDER_ID_HEADERS));
        const customerName = getValue(row.data, CUSTOMER_NAME_HEADERS);
        const identity = buildCustomerImportIdentity(row.data, customerName);
        if (!orderId) throw new Error('Thiếu mã đơn hàng.');
        if (!identity.hasProfileContact) throw new Error('Thiếu kênh liên hệ hoặc mã khách hàng.');

        const items = parseOrderItems(row.data, orderId);
        const subtotal = getNumber(row.data, ['Tạm tính', 'Subtotal']) || items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const discount = getNumber(row.data, ['Giảm giá', 'Discount']);
        const total = getNumber(row.data, ['Tổng tiền', 'Total']) || Math.max(0, subtotal - discount);
        const paymentRaw = getValue(row.data, ['Thanh toán', 'Payment Status']);
        const methodRaw = getValue(row.data, ['Phương thức', 'Payment Method']);
        const paymentStatus = normalizeOrderPaymentStatus(paymentRaw, methodRaw);
        const paymentMethod = normalizePaymentMethod(methodRaw || paymentRaw);
        const createdAt = parseLegacyDate(row.data, ['Ngày tạo', 'Created At']) || new Date();
        const completedAt = parseLegacyDate(row.data, ['Ngày hoàn thành', 'Completed At']);
        const status = normalizeOrderStatus(getValue(row.data, ['Trạng thái', 'Status']));
        const orderRef = doc(db, 'orders', orderId);
        const customerRef = doc(db, 'customers', identity.customerId);
        const txRef = paymentStatus === 'debt' ? doc(db, 'customer_transactions', buildClientDocumentId('CT', orderId)) : null;
        if (paymentStatus === 'debt' && !identity.hasDebtSafeContact) throw new Error('Đơn hàng còn nợ cần kênh liên hệ rõ.');

        await runTransaction(db, async (transaction) => {
            const orderSnapshot = await transaction.get(orderRef);
            const customerSnapshot = await transaction.get(customerRef);
            if (orderSnapshot.exists()) {
                throw new Error(`Đơn hàng ${orderId} đã tồn tại.`);
            }

            const customerData = customerSnapshot.data() as { totalSpent?: number; totalOrders?: number; totalDebt?: number } | undefined;
            transaction.set(orderRef, {
                id: orderId,
                customer_info: {
                    customerId: identity.customerId,
                    name: customerName,
                    phone: identity.phone,
                    primaryContactType: identity.primaryContact?.type || null,
                    primaryContactValue: identity.primaryContact?.value || '',
                    contactMethods: identity.contactMethods,
                    email: getValue(row.data, EMAIL_HEADERS),
                    address: getValue(row.data, ADDRESS_HEADERS),
                    note: getValue(row.data, NOTE_HEADERS),
                },
                customer: {
                    id: identity.customerId,
                    name: customerName,
                    phone: identity.phone,
                    primaryContactType: identity.primaryContact?.type || null,
                    primaryContactValue: identity.primaryContact?.value || '',
                    contactMethods: identity.contactMethods,
                    email: getValue(row.data, EMAIL_HEADERS),
                    address: getValue(row.data, ADDRESS_HEADERS),
                    note: getValue(row.data, NOTE_HEADERS),
                },
                items,
                subtotal_amount: subtotal,
                discount_amount: discount,
                total_amount: total,
                status,
                is_vat_exported: false,
                payment_method: paymentMethod,
                paymentStatus,
                source: 'pos',
                legacyImport: true,
                createdBy: user?.uid || '',
                createdByName: user?.displayName || user?.email || 'Admin',
                createdAt,
                updatedAt: completedAt || createdAt,
                ...(completedAt || status === 'Completed' ? { completedAt: completedAt || createdAt } : {}),
                paymentHistory: paymentStatus === 'paid'
                    ? [{ type: 'full', amount: total, timestamp: (completedAt || createdAt).getTime(), note: 'Thanh toán lịch sử từ import Excel' }]
                    : [],
                note: getValue(row.data, NOTE_HEADERS),
            });

            transaction.set(customerRef, {
                id: identity.customerId,
                phone: identity.phone,
                primaryPhone: identity.phone,
                name: customerName || identity.customerId,
                primaryContactType: identity.primaryContact?.type || null,
                primaryContactValue: identity.primaryContact?.value || '',
                contactMethods: identity.contactMethods,
                searchKeywords: buildContactSearchKeywords(identity.contactInput, identity.contactMethods),
                email: getValue(row.data, EMAIL_HEADERS),
                address: getValue(row.data, ADDRESS_HEADERS),
                zalo: getValue(row.data, ZALO_HEADERS),
                facebook: getValue(row.data, FACEBOOK_HEADERS),
                otherContact: getValue(row.data, OTHER_CONTACT_HEADERS),
                totalSpent: (customerData?.totalSpent || 0) + (paymentStatus === 'paid' ? total : 0),
                totalOrders: (customerData?.totalOrders || 0) + 1,
                totalDebt: (customerData?.totalDebt || 0) + (paymentStatus === 'debt' ? total : 0),
                lastOrderDate: completedAt || createdAt,
                lastVisit: completedAt || createdAt,
                updatedAt: serverTimestamp(),
                ...(customerSnapshot.exists() ? {} : { createdAt: serverTimestamp(), type: 'retail' }),
            }, { merge: true });

            if (txRef) {
                transaction.set(txRef, {
                    customerId: identity.customerId,
                    customerName: customerName || identity.customerId,
                    type: 'DEBT',
                    amount: total,
                    orderIds: [orderId],
                    paymentMethod: 'LEGACY_ORDER_IMPORT',
                    note: `Công nợ đơn hàng lịch sử ${orderId}`,
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || user?.email || '',
                    createdAt,
                });
            }
        });
    };

    const importLegacyRepairRow = async (row: ParsedRow) => {
        const repairId = normalizeLegacyImportDocId(getValue(row.data, REPAIR_ID_HEADERS));
        const customerName = getValue(row.data, CUSTOMER_NAME_HEADERS);
        const identity = buildCustomerImportIdentity(row.data, customerName);
        if (!repairId) throw new Error('Thiếu mã phiếu sửa chữa.');
        if (!identity.hasProfileContact) throw new Error('Thiếu kênh liên hệ hoặc mã khách hàng.');

        const receivedAt = parseLegacyDate(row.data, ['Ngày nhận', 'Received At']) || new Date();
        const estimatedReturnAt = parseLegacyDate(row.data, ['Ngày hẹn trả', 'Estimated Return At']);
        const completedAt = parseLegacyDate(row.data, ['Ngày hoàn thành', 'Completed At']);
        const serviceWarrantyMonths = getNumber(row.data, ['Bảo hành dịch vụ tháng', 'Service Warranty Months']);
        const explicitWarrantyExpiresAt = parseLegacyDate(row.data, ['Ngày hết BH dịch vụ', 'Service Warranty Expires At']);
        const serviceWarrantyExpiresAt = explicitWarrantyExpiresAt || (serviceWarrantyMonths > 0 ? addMonths(completedAt || receivedAt, serviceWarrantyMonths) : null);
        const parts = parseRepairParts(row.data);
        const issues = parseRepairIssues(row.data);
        const partsCost = getNumber(row.data, ['Tiền linh kiện', 'Parts Cost']) || parts.reduce((sum, part) => sum + (Number(part.unitPriceAtUse) || 0) * part.quantity, 0);
        const laborCost = getNumber(row.data, ['Phí sửa chữa', 'Labor Cost']);
        const additionalFees = getNumber(row.data, ['Phí phát sinh', 'Additional Fees']);
        const discountAmount = getNumber(row.data, ['Giảm giá', 'Discount']);
        const depositAmount = getNumber(row.data, ['Đã cọc', 'Deposit']);
        const amount = getNumber(row.data, ['Tổng tiền', 'Total']) || Math.max(0, partsCost + laborCost + additionalFees - discountAmount);
        const paymentStatus = normalizeRepairPaymentStatus(getValue(row.data, ['Thanh toán', 'Payment Status']));
        const status = getValue(row.data, ['Trạng thái', 'Status']);
        const repairRef = doc(db, 'repairs', repairId);
        const customerRef = doc(db, 'customers', identity.customerId);
        const txRef = paymentStatus === 'pay_later' ? doc(db, 'customer_transactions', buildClientDocumentId('CT', repairId)) : null;
        if (paymentStatus === 'pay_later' && !identity.hasDebtSafeContact) throw new Error('Phiếu sửa trả sau cần kênh liên hệ rõ.');

        await runTransaction(db, async (transaction) => {
            const repairSnapshot = await transaction.get(repairRef);
            const customerSnapshot = await transaction.get(customerRef);
            if (repairSnapshot.exists()) {
                throw new Error(`Phiếu sửa ${repairId} đã tồn tại.`);
            }

            const customerData = customerSnapshot.data() as { totalSpent?: number; totalRepairs?: number; totalDebt?: number } | undefined;
            transaction.set(repairRef, {
                id: repairId,
                customer: {
                    id: identity.customerId,
                    name: customerName,
                    phone: identity.phone,
                    primaryContactType: identity.primaryContact?.type || null,
                    primaryContactValue: identity.primaryContact?.value || '',
                    contactMethods: identity.contactMethods,
                },
                deviceInfo: {
                    model: getValue(row.data, ['Thiết bị', 'Dòng máy', 'Device']),
                    imei: getValue(row.data, ['IMEI/Serial', 'IMEI', 'Serial']),
                    passcode: getValue(row.data, ['Mật khẩu', 'Passcode']),
                    color: getValue(row.data, ['Màu máy', 'Color']),
                    checklist: {},
                },
                preRepairMedia: [],
                postRepairMedia: [],
                statusTimeline: [{
                    status,
                    timestamp: receivedAt.getTime(),
                    eventType: 'status_transition',
                    toStatus: status,
                    actorId: user?.uid || '',
                    actorName: user?.displayName || user?.email || 'Admin',
                    actorRole: user?.role || 'admin',
                    source: 'legacy_excel_import',
                    note: 'Trạng thái lịch sử từ hệ thống cũ',
                }],
                issue: {
                    description: issues.length > 0 ? issues.map((issue) => issue.label).join(' | ') : getValue(row.data, ['Lỗi/Bệnh', 'Lỗi', 'Bệnh', 'Issue', 'Issues']),
                    notes: getValue(row.data, ['Ghi chú kỹ thuật', 'Tech Notes']),
                },
                issues,
                parts,
                timing: {
                    receivedAt,
                    ...(estimatedReturnAt ? { estimatedReturnAt } : {}),
                    ...(completedAt ? { completedAt } : {}),
                },
                payment: {
                    status: paymentStatus,
                    partsCost,
                    laborCost,
                    additionalFees,
                    discountAmount,
                    amount,
                    depositAmount,
                },
                paymentHistory: paymentStatus === 'paid' || depositAmount > 0
                    ? [{
                        type: paymentStatus === 'paid' ? 'full' : 'deposit',
                        amount: paymentStatus === 'paid' ? amount : depositAmount,
                        timestamp: (completedAt || receivedAt).getTime(),
                        note: 'Thanh toán lịch sử từ import Excel',
                    }]
                    : [],
                staff: {
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || user?.email || 'Admin',
                    assignedTechnicianName: getValue(row.data, ['KTV', 'Technician']),
                },
                status,
                ticketType: 'repair',
                legacyImport: true,
                note: getValue(row.data, NOTE_HEADERS),
                ...(serviceWarrantyExpiresAt ? { serviceWarrantyExpiresAt: serviceWarrantyExpiresAt.getTime() } : {}),
                createdAt: receivedAt,
                updatedAt: completedAt || receivedAt,
                version: 1,
            });

            transaction.set(customerRef, {
                id: identity.customerId,
                phone: identity.phone,
                primaryPhone: identity.phone,
                name: customerName || identity.customerId,
                primaryContactType: identity.primaryContact?.type || null,
                primaryContactValue: identity.primaryContact?.value || '',
                contactMethods: identity.contactMethods,
                searchKeywords: buildContactSearchKeywords(identity.contactInput, identity.contactMethods),
                email: getValue(row.data, EMAIL_HEADERS),
                address: getValue(row.data, ADDRESS_HEADERS),
                zalo: getValue(row.data, ZALO_HEADERS),
                facebook: getValue(row.data, FACEBOOK_HEADERS),
                otherContact: getValue(row.data, OTHER_CONTACT_HEADERS),
                totalSpent: (customerData?.totalSpent || 0) + (paymentStatus === 'paid' ? amount : 0),
                totalRepairs: (customerData?.totalRepairs || 0) + 1,
                totalDebt: (customerData?.totalDebt || 0) + (paymentStatus === 'pay_later' ? Math.max(0, amount - depositAmount) : 0),
                lastVisit: completedAt || receivedAt,
                updatedAt: serverTimestamp(),
                ...(customerSnapshot.exists() ? {} : { createdAt: serverTimestamp(), type: 'retail' }),
            }, { merge: true });

            if (txRef) {
                transaction.set(txRef, {
                    customerId: identity.customerId,
                    customerName: customerName || identity.customerId,
                    type: 'DEBT',
                    amount: Math.max(0, amount - depositAmount),
                    paymentMethod: 'LEGACY_REPAIR_IMPORT',
                    note: `Công nợ phiếu sửa lịch sử ${repairId}`,
                    createdBy: user?.uid || '',
                    createdByName: user?.displayName || user?.email || '',
                    createdAt: completedAt || receivedAt,
                });
            }
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
                batch.map((row) => {
                    if (mode === 'customer') return importCustomerRow(row);
                    if (mode === 'supplier') return importSupplierRow(row);
                    if (mode === 'order') return importLegacyOrderRow(row);
                    if (mode === 'repair') return importLegacyRepairRow(row);
                    if (mode === 'service') return importServiceRow(row);
                    return importProductLikeRow(row);
                })
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
            } else if (mode === 'customer') {
                await triggerRevalidate(['/admin/customers'], ['customers']);
            } else if (mode === 'supplier') {
                await triggerRevalidate(['/admin/suppliers'], ['suppliers']);
            } else if (mode === 'order') {
                await triggerRevalidate(['/admin/orders', '/admin/customers', '/admin/revenue'], ['orders', 'customers']);
            } else if (mode === 'repair') {
                await triggerRevalidate(['/admin/repairs', '/admin/customers', '/admin/revenue'], ['repairs', 'customers']);
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
                                onClick={() => generateTemplate(mode, (modeConfig.taxonomyType && config.taxonomy?.[modeConfig.taxonomyType]) || [])}
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
                                            {getPreviewCheckKeys(mode).map((key) => (
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
                                                    {getPreviewCheckKeys(mode).map((key) => {
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
