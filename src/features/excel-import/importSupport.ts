import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

import { db, getStorageInstance } from '@/lib/firebase';
import type { ProductSpecs, TaxonomyNode } from '@/lib/types';
import { buildProductCodeFromId, getProductCodeKind, normalizeProductCode, type ProductCodeKind } from '@/lib/productCodes';
import { assertProductCodesAvailable } from '@/lib/productCodeRegistry';
import { buildClientDocumentId } from '@/lib/clientDocumentIds';
import { buildContactlessDocumentBaseId } from '@/lib/contactIdentity';
import type { ContactMethodType } from '@/lib/types/contact';
import { generateSlug } from '@/lib/utils';
import { optimizeImage } from '@/lib/imageOptimizer';
import { validateImageFile } from '@/lib/validateImage';
import { EXCEL_IMPORT_ADDITIONAL_EXAMPLE_ROWS, EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS } from '@/components/admin/excelImportTemplateFixtures';

export type ExcelImportMode = 'product' | 'accessory' | 'part' | 'service' | 'customer' | 'supplier' | 'order' | 'repair';

export type Step = 'upload' | 'validating' | 'preview' | 'importing' | 'done';
export type CellValue = string | number | boolean | Date | null | undefined;
export type ExcelRow = Record<string, CellValue>;
export type TaxonomyType = 'retail' | 'component' | 'service';
export type PreviewFilter = 'all' | 'valid' | 'errors' | 'warnings';
export type CheckSeverity = 'ok' | 'warning' | 'error';
export type ProductCondition = 'new' | 'like-new' | 'used';
export type LocalImageUploadFolder = 'products' | 'parts' | 'services' | 'general';

export interface FieldCheck {
    key: string;
    label: string;
    value: string;
    severity: CheckSeverity;
    message: string;
}

export interface ParsedRow {
    rowNum: number;
    data: ExcelRow;
    errors: string[];
    warnings: string[];
    checks: FieldCheck[];
    categoryIds: string[];
    category: string;
}

export interface LocalImageRequirement {
    source: string;
    key: string;
    fileName: string;
    rows: number[];
}

export interface UploadedMediaMatch {
    url: string;
    name: string;
    folder?: string;
}

export interface ModeConfig {
    title: string;
    shortLabel: string;
    sheetName: string;
    collectionName: 'products' | 'services' | 'customers' | 'suppliers' | 'orders' | 'repairs';
    taxonomyType?: TaxonomyType;
    nameHeaders: string[];
    requiredHeaders: string[];
    templateHeaders: string[];
    exampleRow: string[];
    icon: 'product' | 'part' | 'service' | 'customer' | 'supplier' | 'order' | 'repair';
}

export const MODE_CONFIG: Record<ExcelImportMode, ModeConfig> = {
    product: {
        title: 'Sản phẩm bán lẻ',
        shortLabel: 'sản phẩm',
        sheetName: 'San_pham',
        collectionName: 'products',
        taxonomyType: 'retail',
        nameHeaders: ['Tên SP', 'Tên', 'Tên sản phẩm'],
        requiredHeaders: ['Tên SP', 'Danh mục', 'Giá gốc'],
        templateHeaders: ['Tên SP', 'Mã hàng', 'Thương hiệu', 'Danh mục', 'Giá gốc', 'Giá KM', 'Giá vốn', 'NCC', 'Tồn kho', 'Tình trạng', 'Bảo hành tháng', 'Mô tả', 'Ảnh chính', 'Ảnh phụ', 'Thông số', 'Series ID', 'Màu sắc', 'Dung lượng', 'Flash Sale', 'Video'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.product,
        icon: 'product',
    },
    accessory: {
        title: 'Phụ kiện',
        shortLabel: 'phụ kiện',
        sheetName: 'Phu_kien',
        collectionName: 'products',
        taxonomyType: 'retail',
        nameHeaders: ['Tên phụ kiện', 'Tên SP', 'Tên', 'Tên sản phẩm'],
        requiredHeaders: ['Tên phụ kiện', 'Danh mục', 'Giá gốc'],
        templateHeaders: ['Tên phụ kiện', 'Mã hàng', 'Thương hiệu', 'Danh mục', 'Giá gốc', 'Giá KM', 'Giá vốn', 'NCC', 'Tồn kho', 'Tình trạng', 'Bảo hành tháng', 'Mô tả', 'Ảnh chính', 'Ảnh phụ', 'Thông số', 'Video'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.accessory,
        icon: 'product',
    },
    part: {
        title: 'Linh kiện sửa chữa',
        shortLabel: 'linh kiện',
        sheetName: 'Linh_kien',
        collectionName: 'products',
        taxonomyType: 'component',
        nameHeaders: ['Tên linh kiện', 'Tên LK', 'Tên', 'Tên SP'],
        requiredHeaders: ['Tên linh kiện', 'Danh mục', 'Giá vốn', 'Giá bán'],
        templateHeaders: ['Tên linh kiện', 'Mã hàng', 'Danh mục', 'Giá vốn', 'Giá bán', 'NCC', 'Tồn kho', 'Chất lượng', 'Loại linh kiện', 'Dòng máy tương thích', 'Bảo hành tháng', 'Mô tả', 'Ảnh chính', 'Ảnh phụ'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.part,
        icon: 'part',
    },
    service: {
        title: 'Dịch vụ sửa chữa',
        shortLabel: 'dịch vụ',
        sheetName: 'Dich_vu',
        collectionName: 'services',
        taxonomyType: 'service',
        nameHeaders: ['Tên DV', 'Tên dịch vụ', 'Tên'],
        requiredHeaders: ['Tên DV', 'Danh mục', 'Giá gốc'],
        templateHeaders: ['Tên DV', 'Dòng máy', 'Danh mục', 'Giá gốc', 'Giá KM', 'Bảo hành', 'Thời gian sửa', 'Mô tả', 'Ảnh chính', 'Ảnh phụ', 'SEO Description', 'Tags', 'Video'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.service,
        icon: 'service',
    },
    customer: {
        title: 'Khách hàng',
        shortLabel: 'khách hàng',
        sheetName: 'Khach_hang',
        collectionName: 'customers',
        nameHeaders: ['Tên KH', 'Tên', 'Tên khách hàng'],
        requiredHeaders: ['Tên KH'],
        templateHeaders: ['Mã KH', 'Tên KH', 'SĐT', 'Zalo', 'Facebook', 'Kênh liên hệ chính', 'Loại KH', 'Email', 'Địa chỉ', 'Tags', 'Chi tiêu', 'Đơn hàng', 'Sửa chữa', 'Công nợ', 'Ghi chú'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.customer,
        icon: 'customer',
    },
    supplier: {
        title: 'Nhà cung cấp',
        shortLabel: 'nhà cung cấp',
        sheetName: 'Nha_cung_cap',
        collectionName: 'suppliers',
        nameHeaders: ['Tên NCC', 'Tên', 'Tên nhà cung cấp'],
        requiredHeaders: ['Tên NCC'],
        templateHeaders: ['Mã NCC', 'Tên NCC', 'SĐT', 'Zalo', 'Facebook', 'Kênh liên hệ chính', 'Người liên hệ', 'Email', 'Địa chỉ', 'Công ty', 'Phân loại', 'Mã số thuế', 'Số tài khoản', 'Ngân hàng', 'Hạn thanh toán', 'Phụ trách', 'Tags', 'Công nợ', 'Ghi chú'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.supplier,
        icon: 'supplier',
    },
    order: {
        title: 'Đơn hàng lịch sử',
        shortLabel: 'đơn hàng',
        sheetName: 'Don_hang_cu',
        collectionName: 'orders',
        nameHeaders: ['Mã đơn', 'Order ID', 'Mã hóa đơn', 'orderId'],
        requiredHeaders: ['Mã đơn', 'Tên KH', 'Tổng tiền', 'Ngày tạo'],
        templateHeaders: ['Mã đơn', 'Mã KH', 'Tên KH', 'SĐT', 'Zalo', 'Facebook', 'Email', 'Địa chỉ', 'Sản phẩm', 'Số lượng', 'Đơn giá', 'IMEI/Serial', 'Bảo hành tháng', 'Ngày bắt đầu BH', 'Ngày hết BH', 'Tạm tính', 'Giảm giá', 'Tổng tiền', 'Trạng thái', 'Thanh toán', 'Phương thức', 'Ngày tạo', 'Ngày hoàn thành', 'Ghi chú'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.order,
        icon: 'order',
    },
    repair: {
        title: 'Phiếu sửa chữa lịch sử',
        shortLabel: 'phiếu sửa',
        sheetName: 'Phieu_sua_cu',
        collectionName: 'repairs',
        nameHeaders: ['Mã phiếu', 'Repair ID', 'Mã sửa chữa', 'repairId'],
        requiredHeaders: ['Mã phiếu', 'Tên KH', 'Thiết bị', 'Lỗi/Bệnh', 'Trạng thái', 'Ngày nhận'],
        templateHeaders: ['Mã phiếu', 'Mã KH', 'Tên KH', 'SĐT', 'Zalo', 'Facebook', 'Thiết bị', 'IMEI/Serial', 'Mật khẩu', 'Màu máy', 'Lỗi/Bệnh', 'Linh kiện', 'Tiền linh kiện', 'Phí sửa chữa', 'Phí phát sinh', 'Giảm giá', 'Đã cọc', 'Tổng tiền', 'Thanh toán', 'Trạng thái', 'KTV', 'Ngày nhận', 'Ngày hẹn trả', 'Ngày hoàn thành', 'Bảo hành dịch vụ tháng', 'Ngày hết BH dịch vụ', 'Ghi chú kỹ thuật', 'Ghi chú'],
        exampleRow: EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS.repair,
        icon: 'repair',
    },
};

export const QUALITY_OPTIONS = ['Zin', 'Loại 1', 'Loại 2', 'Bóc máy'];
export const PRODUCT_CONDITIONS: ProductCondition[] = ['new', 'like-new', 'used'];
export const PREVIEW_CHECK_KEYS = ['name', 'category', 'price', 'cost', 'stock', 'code', 'images', 'details'];
export function getPreviewCheckKeys(mode: ExcelImportMode): string[] {
    if (mode === 'customer') {
        return ['name', 'phone', 'type', 'email', 'stats', 'debt', 'details'];
    }
    if (mode === 'supplier') {
        return ['name', 'phone', 'contact', 'email', 'bank', 'terms', 'debt', 'details'];
    }
    if (mode === 'order') {
        return ['name', 'phone', 'items', 'amount', 'payment', 'status', 'dates', 'warranty'];
    }
    if (mode === 'repair') {
        return ['name', 'phone', 'device', 'issues', 'amount', 'payment', 'status', 'dates', 'warranty', 'details'];
    }
    return ['name', 'category', 'price', 'cost', 'stock', 'code', 'images', 'details'];
}

export function parseDebtInput(row: ExcelRow, headers: string[]) {
    const raw = getValue(row, headers);
    if (!raw) return { raw, value: 0, hasValue: false, isValid: true };
    const value = parseRawNumber(raw);
    return {
        raw,
        value,
        hasValue: true,
        isValid: Number.isFinite(value),
    };
}

export function getSignedNumber(row: ExcelRow, headers: string[]): number {
    const raw = getValue(row, headers);
    if (!raw) return 0;
    const value = parseRawNumber(raw);
    return Number.isFinite(value) ? value : 0;
}

export const FIRESTORE_QUERY_CHUNK_SIZE = 10;
export const IMAGE_MAIN_HEADERS = ['Ảnh chính', 'Ảnh', 'Image'];
export const IMAGE_OTHER_HEADERS = ['Ảnh phụ', 'Images'];
export const PHONE_HEADERS = ['SĐT', 'sdt', 'phone', 'Phone', 'Số điện thoại'];
export const CUSTOMER_CODE_HEADERS = ['Mã KH', 'Mã khách hàng', 'Customer ID', 'customerId'];
export const SUPPLIER_CODE_HEADERS = ['Mã NCC', 'Mã nhà cung cấp', 'Supplier ID', 'supplierId'];
export const ZALO_HEADERS = ['Zalo', 'zalo'];
export const FACEBOOK_HEADERS = ['Facebook', 'facebook', 'Messenger'];
export const PRIMARY_CONTACT_HEADERS = ['Kênh liên hệ chính', 'Primary Contact', 'primaryContactType'];
export const OTHER_CONTACT_HEADERS = ['Liên hệ khác', 'Khác', 'Other Contact'];
export const EMAIL_HEADERS = ['Email'];
export const ADDRESS_HEADERS = ['Địa chỉ', 'Address'];
export const NOTE_HEADERS = ['Ghi chú', 'Note'];

export function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim();
}

export function getValue(row: ExcelRow, headers: string[]): string {
    for (const header of headers) {
        const value = row[header];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return '';
}

export function normalizeImportPhone(value: string): string {
    return value.trim().replace(/[^\d]/g, '');
}

export function normalizeLegacyImportDocId(value: string): string {
    return value
        .trim()
        .replace(/[\/\\#?\[\]]+/g, '-')
        .replace(/\s+/g, '-')
        .slice(0, 120);
}

export function normalizeImportContactType(value: string): ContactMethodType | undefined {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    if (['sdt', 'phone', 'dien thoai', 'so dien thoai'].includes(normalized)) return 'phone';
    if (normalized === 'zalo') return 'zalo';
    if (['facebook', 'messenger', 'fb'].includes(normalized)) return 'facebook';
    if (normalized === 'email') return 'email';
    if (['dia chi', 'address'].includes(normalized)) return 'address';
    if (['ghi chu', 'note'].includes(normalized)) return 'note';
    if (['khac', 'other', 'lien he khac'].includes(normalized)) return 'other';
    return undefined;
}

export function buildImportContactInput(row: ExcelRow, name: string) {
    return {
        name,
        phone: normalizeImportPhone(getValue(row, PHONE_HEADERS)),
        zalo: getValue(row, ZALO_HEADERS),
        facebook: getValue(row, FACEBOOK_HEADERS),
        email: getValue(row, EMAIL_HEADERS),
        address: getValue(row, ADDRESS_HEADERS),
        note: getValue(row, NOTE_HEADERS),
        other: getValue(row, OTHER_CONTACT_HEADERS),
        primaryType: normalizeImportContactType(getValue(row, PRIMARY_CONTACT_HEADERS)),
        source: 'excel' as const,
    };
}

function hasImportContactInput(input: ReturnType<typeof buildImportContactInput>): boolean {
    return Boolean(input.phone || input.zalo || input.facebook || input.email || input.address || input.note || input.other);
}

export function resolveCustomerImportDocId(row: ExcelRow, name: string): string {
    const phone = normalizeImportPhone(getValue(row, PHONE_HEADERS));
    if (phone) return phone;
    const explicitId = normalizeLegacyImportDocId(getValue(row, CUSTOMER_CODE_HEADERS));
    if (explicitId) return explicitId;
    const contactInput = buildImportContactInput(row, name);
    if (!hasImportContactInput(contactInput)) return '';
    return buildContactlessDocumentBaseId('KH', contactInput);
}

export function resolveSupplierImportDocId(row: ExcelRow, name: string): string {
    const explicitId = normalizeLegacyImportDocId(getValue(row, SUPPLIER_CODE_HEADERS));
    if (explicitId) return explicitId;
    const contactInput = buildImportContactInput(row, name);
    if (!hasImportContactInput(contactInput)) return '';
    return buildContactlessDocumentBaseId('NCC', contactInput);
}

export function parseRawNumber(raw: string): number {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const value = trimmed
        .replace(/\s*(vnd|vnđ|đ|₫)\s*$/i, '')
        .replace(/\s+/g, '');
    if (!/^-?(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(value)) return Number.NaN;
    const sign = value.startsWith('-') ? -1 : 1;
    const digitsOnly = value.replace(/[^\d]/g, '');
    return sign * Number(digitsOnly);
}

export function getNumber(row: ExcelRow, headers: string[]): number {
    const raw = getValue(row, headers);
    if (!raw) return 0;
    const value = parseRawNumber(raw);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function parseNumberInput(row: ExcelRow, headers: string[]) {
    const raw = getValue(row, headers);
    if (!raw) return { raw, value: 0, hasValue: false, isValid: true };
    const value = parseRawNumber(raw);
    return {
        raw,
        value,
        hasValue: true,
        isValid: Number.isFinite(value) && value >= 0,
    };
}

export function getBoolean(row: ExcelRow, headers: string[]): boolean {
    const raw = getValue(row, headers).toLowerCase();
    return ['1', 'true', 'yes', 'y', 'co', 'có', 'x'].includes(raw);
}

export function splitList(value: string): string[] {
    return value
        .split(/[\n;,|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function parseImages(row: ExcelRow, mainHeaders: string[], otherHeaders: string[]): string[] {
    const main = getValue(row, mainHeaders);
    const others = splitList(getValue(row, otherHeaders));
    return Array.from(new Set([main, ...others].filter(Boolean)));
}

export function normalizeLocalImageKey(value: string): string {
    return value
        .trim()
        .replace(/^file:\/+/i, '')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/([a-zA-Z]:\/)/, '$1')
        .toLowerCase();
}

export function localImageFileName(value: string): string {
    const normalized = normalizeLocalImageKey(value);
    return decodeURIComponent(normalized.split('/').filter(Boolean).pop() || normalized);
}

export function normalizeMediaBaseName(value: string): string {
    return localImageFileName(value).replace(/\.[^.]+$/, '').toLowerCase();
}

export function buildMediaNameCandidates(fileName: string): string[] {
    const extractedName = localImageFileName(fileName);
    const baseName = extractedName.replace(/\.[^.]+$/, '');
    return Array.from(new Set([
        extractedName,
        `${baseName}.webp`,
        `${baseName}.jpg`,
        `${baseName}.jpeg`,
        `${baseName}.png`,
    ].filter(Boolean)));
}

export function preferMediaMatch(matches: UploadedMediaMatch[], preferredFolder: LocalImageUploadFolder): UploadedMediaMatch | null {
    if (matches.length === 0) return null;
    return [...matches].sort((left, right) => {
        const leftScore = left.folder === preferredFolder ? 0 : 1;
        const rightScore = right.folder === preferredFolder ? 0 : 1;
        return leftScore - rightScore;
    })[0];
}

export function isLocalImageReference(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed || isValidHttpUrl(trimmed)) return false;
    return /\.(jpe?g|png|webp)$/i.test(trimmed);
}

export function getFileRelativePath(file: File): string {
    const withRelativePath = file as File & { webkitRelativePath?: string };
    return withRelativePath.webkitRelativePath || file.name;
}

export function fileMatchesLocalReference(file: File, source: string): boolean {
    const sourceKey = normalizeLocalImageKey(source);
    const relativePath = normalizeLocalImageKey(getFileRelativePath(file));
    const fileName = localImageFileName(file.name);
    if (relativePath && (sourceKey.endsWith(relativePath) || sourceKey.endsWith(`/${relativePath}`))) return true;
    return localImageFileName(sourceKey) === fileName;
}

export function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function parseSpecs(raw: string): ProductSpecs {
    const specs: ProductSpecs = {};
    for (const pair of splitList(raw)) {
        const separatorIndex = pair.search(/[:=]/);
        if (separatorIndex <= 0) continue;
        const key = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();
        if (key && value) specs[key] = value;
    }
    return specs;
}

export function resolveCategoryPath(pathStr: string, taxonomy: TaxonomyNode[]): { categoryIds: string[]; category: string } {
    if (!pathStr) return { categoryIds: [], category: '' };

    const parts = pathStr.split('>').map((part) => part.trim()).filter(Boolean);
    let currentNodes = taxonomy;
    const ids: string[] = [];
    let matchedLeafName = '';

    for (const part of parts) {
        const matchedNode = currentNodes.find((node) => node.name.trim().toLowerCase() === part.toLowerCase());
        if (!matchedNode) break;
        ids.push(matchedNode.id);
        matchedLeafName = matchedNode.name;
        currentNodes = matchedNode.children || [];
    }

    if (ids.length === parts.length) {
        return { categoryIds: ids, category: matchedLeafName };
    }
    return { categoryIds: [], category: pathStr };
}

export function productKindForMode(mode: ExcelImportMode, category: string, categoryIds: string[]): ProductCodeKind {
    if (mode === 'part') return 'component';
    if (mode === 'accessory') return 'accessory';
    return getProductCodeKind({ category, categoryIds });
}

export function buildImportProductId(mode: 'product' | 'accessory' | 'part', name: string, category: string): string {
    const categorySlug = generateSlug(category || '');
    const prefix =
        mode === 'part'
            ? 'LK'
            : mode === 'accessory' || categorySlug === 'accessory' || categorySlug === 'phu-kien'
              ? 'PK'
              : 'SP';
    return `${prefix}-${generateSlug(name)}`;
}

export function resolveTargetDocId(mode: ExcelImportMode, row: ExcelRow, modeConfig: ModeConfig, taxonomy: TaxonomyNode[]): string {
    const name = getValue(row, modeConfig.nameHeaders);
    if (!name) return '';
    if (mode === 'customer') {
        return resolveCustomerImportDocId(row, name);
    }
    if (mode === 'supplier') {
        return resolveSupplierImportDocId(row, name);
    }
    if (mode === 'order' || mode === 'repair') {
        return normalizeLegacyImportDocId(name);
    }
    if (mode === 'service') return generateSlug(name);
    const categoryPath = getValue(row, ['Danh mục', 'Category']);
    const { category } = resolveCategoryPath(categoryPath, taxonomy);
    return buildImportProductId(mode, name, category);
}

export function resolveExpectedProductCode(mode: ExcelImportMode, row: ExcelRow, modeConfig: ModeConfig, taxonomy: TaxonomyNode[]): string {
    if (mode === 'service' || mode === 'customer' || mode === 'supplier' || mode === 'order' || mode === 'repair') return '';
    const customCode = normalizeProductCode(getValue(row, ['Mã hàng', 'SKU', 'Barcode']));
    if (customCode) return customCode;
    const targetId = resolveTargetDocId(mode, row, modeConfig, taxonomy);
    const categoryPath = getValue(row, ['Danh mục', 'Category']);
    const { categoryIds, category } = resolveCategoryPath(categoryPath, taxonomy);
    const kind = productKindForMode(mode as 'product' | 'accessory' | 'part', category, categoryIds);
    return targetId ? buildProductCodeFromId(targetId, kind) : '';
}

export function isAccessoryCategory(categoryIds: string[]): boolean {
    const firstCategoryId = normalizeText(categoryIds[0] || '');
    return firstCategoryId === 'phu-kien' || firstCategoryId.startsWith('phu-kien/');
}

export function normalizeConditionInput(raw: string): ProductCondition | '' {
    const normalized = normalizeText(raw);
    if (!normalized) return '';
    if (PRODUCT_CONDITIONS.includes(raw as ProductCondition)) return raw as ProductCondition;
    if (['moi', 'moi-100', 'new-100'].includes(normalized)) return 'new';
    if (['like-new', 'likenew', 'cu-99', 'cu-99%', '99'].includes(normalized)) return 'like-new';
    if (['used', 'cu', 'hang-cu', 'tbh'].includes(normalized)) return 'used';
    return '';
}

export function buildCheck(key: string, label: string, value: string, severity: CheckSeverity, message: string): FieldCheck {
    return { key, label, value: value || '—', severity, message };
}

export function summarizeChecks(checks: FieldCheck[], severity: CheckSeverity): string[] {
    return checks
        .filter((check) => check.severity === severity)
        .map((check) => `${check.label}: ${check.message}`);
}

export function severityClasses(severity: CheckSeverity): string {
    if (severity === 'error') return 'bg-red-50 text-red-700 border-red-200';
    if (severity === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-green-50 text-green-700 border-green-200';
}

export function severityLabel(severity: CheckSeverity): string {
    if (severity === 'error') return 'Lỗi';
    if (severity === 'warning') return 'Cảnh báo';
    return 'Hợp lệ';
}

export function imageUploadFolderForMode(mode: ExcelImportMode): LocalImageUploadFolder {
    if (mode === 'service') return 'services';
    if (mode === 'part') return 'parts';
    return 'products';
}

export function collectLocalImageRequirements(rows: ParsedRow[]): LocalImageRequirement[] {
    const byKey = new Map<string, LocalImageRequirement>();

    rows.forEach((row) => {
        parseImages(row.data, IMAGE_MAIN_HEADERS, IMAGE_OTHER_HEADERS)
            .filter(isLocalImageReference)
            .forEach((source) => {
                const key = normalizeLocalImageKey(source);
                const current = byKey.get(key);
                if (current) {
                    current.rows.push(row.rowNum);
                } else {
                    byKey.set(key, {
                        source,
                        key,
                        fileName: localImageFileName(source),
                        rows: [row.rowNum],
                    });
                }
            });
    });

    return Array.from(byKey.values());
}

export function replaceImageReferences(row: ExcelRow, replacements: Record<string, string>): ExcelRow {
    const nextRow = { ...row };
    [...IMAGE_MAIN_HEADERS, ...IMAGE_OTHER_HEADERS].forEach((header) => {
        const value = nextRow[header];
        if (typeof value !== 'string' || !value.trim()) return;
        const items = splitList(value);
        if (items.length === 0) return;
        const replaced = items.map((item) => replacements[normalizeLocalImageKey(item)] || item);
        nextRow[header] = replaced.join('; ');
    });
    return nextRow;
}

export function refreshImageChecks(row: ParsedRow): ParsedRow {
    const checks = row.checks.filter((check) => check.key !== 'images');
    const images = parseImages(row.data, IMAGE_MAIN_HEADERS, IMAGE_OTHER_HEADERS);
    const invalidImages = images.filter((image) => !isValidHttpUrl(image) && !isLocalImageReference(image));
    const localImages = images.filter(isLocalImageReference);

    if (invalidImages.length > 0) {
        checks.push(buildCheck('images', 'Ảnh', invalidImages[0], 'error', 'Ảnh phải là URL http/https hoặc đường dẫn file ảnh local'));
    } else if (localImages.length > 0) {
        checks.push(buildCheck('images', 'Ảnh', localImages[0], 'error', `Còn ${localImages.length} ảnh local chưa upload`));
    } else {
        checks.push(images.length > 0
            ? buildCheck('images', 'Ảnh', `${images.length} URL`, 'ok', 'Có ảnh')
            : buildCheck('images', 'Ảnh', '', 'warning', 'Thiếu ảnh, item sẽ không có hình hiển thị')
        );
    }

    return {
        ...row,
        checks,
        errors: summarizeChecks(checks, 'error'),
        warnings: summarizeChecks(checks, 'warning'),
    };
}

export async function uploadInitialImportImage(file: File, folder: LocalImageUploadFolder, hash?: string): Promise<string> {
    const validationError = validateImageFile(file);
    if (validationError) throw new Error(validationError);

    const optimized = await optimizeImage(file, 800, 1600, 0.75);
    const thumb = await optimizeImage(file, 128, 128, 0.60);
    const storage = await getStorageInstance();
    const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const storagePath = hash 
        ? `media/${folder}/${hash}.webp` 
        : `media/${folder}/${Date.now()}_${optimized.file.name}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, optimized.file, { contentType: optimized.file.type });
    let url = await getDownloadURL(storageRef);

    const thumbPath = storagePath.replace(/\.([a-zA-Z0-9]+)$/, '_thumb.$1');
    const thumbRef = ref(storage, thumbPath);
    await uploadBytes(thumbRef, thumb.file, { contentType: thumb.file.type });
    url = `${url}&hasThumb=true`;

    const docId = hash 
        ? `MED-import-${folder}-${hash}` 
        : buildImportMediaDocumentId(folder, optimized.file.name);

    await setDoc(doc(db, 'media_library', docId), {
        url,
        path: storagePath,
        name: optimized.file.name,
        originalName: file.name,
        normalizedBaseName: normalizeMediaBaseName(file.name),
        type: optimized.file.type,
        size: optimized.file.size,
        folder,
        width: optimized.width,
        height: optimized.height,
        hash: hash || null,
        createdAt: serverTimestamp(),
    });

    return url;
}

function buildImportMediaDocumentId(folder: LocalImageUploadFolder, fileName: string): string {
    const slug = generateSlug(normalizeMediaBaseName(fileName)).slice(0, 70) || 'media';
    return `MED-import-${folder}-${Date.now()}-${slug}`;
}

export async function findExistingImportImage(fileName: string, folder: LocalImageUploadFolder): Promise<UploadedMediaMatch | null> {
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

    const directSnapshot = await getDocs(query(
        collection(db, 'media_library'),
        where('name', 'in', buildMediaNameCandidates(fileName).slice(0, 10)),
    ));
    const directMatches = directSnapshot.docs
        .map((docSnapshot) => toMatch(docSnapshot.data()))
        .filter((item): item is UploadedMediaMatch => Boolean(item));
    const directMatch = preferMediaMatch(directMatches, folder);
    if (directMatch) return directMatch;

    const normalizedSnapshot = await getDocs(query(
        collection(db, 'media_library'),
        where('normalizedBaseName', '==', baseName),
    ));
    const normalizedMatches = normalizedSnapshot.docs
        .map((docSnapshot) => toMatch(docSnapshot.data()))
        .filter((item): item is UploadedMediaMatch => Boolean(item));
    const normalizedMatch = preferMediaMatch(normalizedMatches, folder);
    if (normalizedMatch) return normalizedMatch;

    const recentSnapshot = await getDocs(query(
        collection(db, 'media_library'),
        orderBy('createdAt', 'desc'),
        limit(300),
    ));
    const recentMatches = recentSnapshot.docs
        .map((docSnapshot) => toMatch(docSnapshot.data()))
        .filter((item): item is UploadedMediaMatch => Boolean(item));
    return preferMediaMatch(recentMatches, folder);
}

export async function loadExistingDocIds(collectionName: ModeConfig['collectionName'], ids: string[]): Promise<Set<string>> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    const existingIds = new Set<string>();
    await Promise.all(uniqueIds.map(async (id) => {
        const snapshot = await getDoc(doc(db, collectionName, id));
        if (snapshot.exists()) existingIds.add(id);
    }));
    return existingIds;
}

export async function loadExistingProductCodes(codes: string[]): Promise<Set<string>> {
    const uniqueCodes = Array.from(new Set(codes.map(normalizeProductCode).filter(Boolean)));
    const existingCodes = new Set<string>();

    for (let index = 0; index < uniqueCodes.length; index += FIRESTORE_QUERY_CHUNK_SIZE) {
        const chunk = uniqueCodes.slice(index, index + FIRESTORE_QUERY_CHUNK_SIZE);
        if (chunk.length === 0) continue;

        const snapshots = await Promise.all([
            getDocs(query(collection(db, 'product_code_registry'), where('code', 'in', chunk))),
            getDocs(query(collection(db, 'products'), where('sku', 'in', chunk))),
            getDocs(query(collection(db, 'products'), where('barcode', 'in', chunk))),
            getDocs(query(collection(db, 'products'), where('productCode', 'in', chunk))),
            getDocs(query(collection(db, 'products'), where('qrCodes', 'array-contains-any', chunk))),
        ]);

        snapshots.forEach((snapshot) => {
            snapshot.forEach((item) => {
                const data = item.data();
                [
                    data.code,
                    data.sku,
                    data.barcode,
                    data.productCode,
                    ...(Array.isArray(data.qrCodes) ? data.qrCodes : []),
                ].forEach((value) => {
                    const code = normalizeProductCode(value);
                    if (code && chunk.includes(code)) existingCodes.add(code);
                });
            });
        });
    }

    return existingCodes;
}

export async function createInitialProductWithCodes(
    productId: string,
    data: Record<string, unknown>,
    codes: string[],
    inventoryLog?: Record<string, unknown>,
): Promise<string> {
    const normalizedCodes = await assertProductCodesAvailable(codes);
    const productRef = doc(db, 'products', productId);
    const registryRefs = normalizedCodes.map((code) => doc(db, 'product_code_registry', code));
    const logRef = inventoryLog ? doc(db, 'inventory_logs', buildClientDocumentId('IL', productId)) : null;

    await runTransaction(db, async (transaction) => {
        const [productSnapshot, ...registrySnapshots] = await Promise.all([
            transaction.get(productRef),
            ...registryRefs.map((ref) => transaction.get(ref)),
        ]);

        if (productSnapshot.exists()) {
            throw new Error(`ID sản phẩm ${productId} đã tồn tại.`);
        }

        registrySnapshots.forEach((snapshot, index) => {
            if (snapshot.exists()) {
                throw new Error(`Mã QR ${normalizedCodes[index]} đã được gán cho sản phẩm khác.`);
            }
        });

        registryRefs.forEach((ref, index) => {
            transaction.set(ref, {
                productId,
                code: normalizedCodes[index],
                updatedAt: serverTimestamp(),
            });
        });

        transaction.set(productRef, {
            ...data,
            qrCodes: normalizedCodes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        if (logRef && inventoryLog) {
            transaction.set(logRef, {
                ...inventoryLog,
                createdAt: serverTimestamp(),
            });
        }
    });

    return productId;
}


export type TemplateCell = string | number;

export interface ColumnGuide {
    column: string;
    required: string;
    purpose: string;
    inputRule: string;
    acceptedValues: string;
    example: string;
    savedTo: string;
}

export function makeTemplateRow(modeConfig: ModeConfig, values: Record<string, string>): string[] {
    return modeConfig.templateHeaders.map((header) => values[normalizeText(header)] || '');
}

export function worksheetFromRows(rows: TemplateCell[][], widths: number[], addFilter = false): XLSX.WorkSheet {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = widths.map((wch) => ({ wch }));
    if (addFilter && rows.length > 0 && rows[0].length > 0) {
        sheet['!autofilter'] = {
            ref: XLSX.utils.encode_range({
                s: { r: 0, c: 0 },
                e: { r: 0, c: rows[0].length - 1 },
            }),
        };
    }
    return sheet;
}

export function columnGuideForHeader(header: string, modeConfig: ModeConfig): ColumnGuide {
    const normalized = normalizeText(header);
    const exampleIndex = modeConfig.templateHeaders.indexOf(header);
    const base: ColumnGuide = {
        column: header,
        required: modeConfig.requiredHeaders.includes(header) ? 'Bắt buộc' : 'Tùy chọn',
        purpose: 'Thông tin bổ sung cho item.',
        inputRule: 'Nhập text nếu có dữ liệu, để trống nếu chưa dùng.',
        acceptedValues: 'Tự do',
        example: modeConfig.exampleRow[exampleIndex] || '',
        savedTo: header,
    };

    if (normalized.startsWith('ten')) {
        return { ...base, purpose: 'Tên hiển thị và khóa tạo ID chuẩn hóa.', inputRule: 'Không để trống, không trùng item đang có hoặc trùng trong file.', savedTo: 'name, searchKeywords' };
    }
    if (normalized === 'ma hang') {
        return { ...base, purpose: 'Mã QR/barcode/SKU dùng chung cho POS và tem QR.', inputRule: 'Có thể để trống để hệ thống tự sinh. Nếu nhập tay phải không trùng.', acceptedValues: 'A-Z, 0-9, dấu gạch ngang; ví dụ SP-IP15PM-256.', savedTo: 'sku, barcode, productCode, qrCodes, product_code_registry' };
    }
    if (normalized === 'thuong hieu') {
        return { ...base, purpose: 'Thương hiệu hiển thị và hỗ trợ tìm kiếm.', inputRule: 'Nhập đúng tên brand đang dùng nếu có.', savedTo: 'brand' };
    }
    if (normalized === 'danh muc') {
        return { ...base, purpose: 'Gắn item vào taxonomy chung.', inputRule: 'Nhập breadcrumb đúng cây danh mục, phân cấp bằng dấu >.', acceptedValues: 'Copy từ sheet Taxonomy_mau.', savedTo: 'category, categoryIds' };
    }
    if (normalized.startsWith('gia')) {
        return { ...base, purpose: 'Giá dùng cho web, POS và tính lợi nhuận.', inputRule: 'Chỉ nhập số, không nhập dấu phẩy hoặc ký tự tiền tệ.', acceptedValues: 'Số nguyên >= 0.', savedTo: normalized.includes('von') ? 'costPrice' : normalized.includes('km') || normalized.includes('ban') ? 'price_promo' : 'price_original' };
    }
    if (normalized === 'ncc') {
        return { ...base, purpose: 'Nhà cung cấp ban đầu.', inputRule: 'Text tự do, có thể để trống.', savedTo: 'supplier' };
    }
    if (normalized === 'ton kho') {
        return { ...base, purpose: 'Số lượng tồn khởi tạo.', inputRule: 'Nhập số nguyên. Nếu > 0 hệ thống tạo inventory log IMPORT.', acceptedValues: '0, 1, 10...', savedTo: 'stock, inventory_logs' };
    }
    if (normalized === 'tinh trang') {
        return { ...base, purpose: 'Tình trạng hàng bán lẻ/phụ kiện.', inputRule: 'Nếu để trống hệ thống dùng new.', acceptedValues: 'new, like-new, used', savedTo: 'condition' };
    }
    if (normalized === 'bao hanh thang') {
        return { ...base, purpose: 'Số tháng bảo hành cho sản phẩm/phụ kiện/linh kiện.', inputRule: 'Chỉ nhập số tháng.', acceptedValues: '0, 3, 6, 12...', savedTo: 'warrantyMonths' };
    }
    if (normalized === 'bao hanh') {
        return { ...base, purpose: 'Nội dung bảo hành hiển thị cho dịch vụ.', inputRule: 'Text ngắn, ví dụ 6 tháng hoặc 30 ngày.', savedTo: 'warranty_text' };
    }
    if (normalized === 'thoi gian sua') {
        return { ...base, purpose: 'Thời gian dự kiến hoàn tất dịch vụ.', inputRule: 'Text ngắn, ví dụ 30 phút hoặc 1-2 ngày.', savedTo: 'repair_time' };
    }
    if (normalized === 'mo ta') {
        return { ...base, purpose: 'Mô tả hiển thị trên web/admin.', inputRule: 'Text tự do, nên ngắn gọn và rõ tình trạng/cam kết.', savedTo: 'description' };
    }
    if (normalized === 'anh chinh') {
        return { ...base, purpose: 'Ảnh đại diện chính.', inputRule: 'Dùng URL http/https hoặc đường dẫn local rồi chọn file ở bước preview.', acceptedValues: 'URL public, URL MediaManager, hoặc M:\\anh\\ten-file.png.', savedTo: 'imageUrl, images[0]' };
    }
    if (normalized === 'anh phu') {
        return { ...base, purpose: 'Gallery ảnh phụ.', inputRule: 'Nhập nhiều ảnh bằng dấu ; hoặc xuống dòng. Có thể trộn URL và local path.', acceptedValues: 'url-1; url-2; M:\\anh\\ten-file-3.png', savedTo: 'images[]' };
    }
    if (normalized === 'thong so') {
        return { ...base, purpose: 'Thông số kỹ thuật dạng key-value.', inputRule: 'Mỗi cặp key:value, phân tách bằng dấu ;.', acceptedValues: 'RAM:8GB; Bộ nhớ:256GB; Pin:5000mAh', savedTo: 'specs' };
    }
    if (normalized === 'series id') {
        return { ...base, purpose: 'Nhóm series/model để gom biến thể sản phẩm.', inputRule: 'Slug ngắn, thống nhất giữa các màu/dung lượng.', savedTo: 'seriesId' };
    }
    if (normalized === 'mau sac') {
        return { ...base, purpose: 'Màu sắc biến thể.', inputRule: 'Text tự do.', savedTo: 'color' };
    }
    if (normalized === 'dung luong') {
        return { ...base, purpose: 'Dung lượng/bộ nhớ biến thể.', inputRule: 'Text ngắn.', savedTo: 'storageCapacity' };
    }
    if (normalized === 'flash sale') {
        return { ...base, purpose: 'Đưa item vào nhóm flash sale.', inputRule: 'Nhập yes/true/1/x để bật, để trống để tắt.', acceptedValues: 'yes, true, 1, x hoặc để trống', savedTo: 'isFlashSale' };
    }
    if (normalized === 'video') {
        return { ...base, purpose: 'URL video embed/giới thiệu.', inputRule: 'Nhập URL video nếu có.', acceptedValues: 'https://...', savedTo: 'videoEmbedUrl' };
    }
    if (normalized === 'chat luong') {
        return { ...base, purpose: 'Phân loại chất lượng linh kiện.', inputRule: 'Nên dùng đúng danh sách để lọc và thống kê.', acceptedValues: QUALITY_OPTIONS.join(', '), savedTo: 'quality' };
    }
    if (normalized === 'loai linh kien') {
        return { ...base, purpose: 'Nhóm nghiệp vụ của linh kiện sửa chữa.', inputRule: 'Nhập loại linh kiện thống nhất với quy trình sửa chữa.', acceptedValues: 'Màn hình, Pin, Camera, Chân sạc...', savedTo: 'partType' };
    }
    if (normalized === 'dong may tuong thich' || normalized === 'dong may') {
        return { ...base, purpose: 'Dòng máy áp dụng.', inputRule: 'Text ngắn, có thể nhập nhiều model bằng dấu phẩy.', savedTo: normalized === 'dong may' ? 'device_model' : 'description' };
    }
    if (normalized === 'seo description') {
        return { ...base, purpose: 'Mô tả SEO riêng cho dịch vụ.', inputRule: 'Khoảng 120-160 ký tự nếu có thể.', savedTo: 'seoDescription' };
    }
    if (normalized === 'tags') {
        return { ...base, purpose: 'Từ khóa nội bộ cho dịch vụ.', inputRule: 'Phân tách bằng dấu phẩy, dấu ; hoặc xuống dòng.', acceptedValues: 'pin, iphone, thay pin', savedTo: 'tags[]' };
    }
    if (normalized === 'ten kh') {
        return { ...base, purpose: 'Tên khách hàng.', inputRule: 'Không để trống.', savedTo: 'name' };
    }
    if (normalized === 'sdt') {
        return { ...base, purpose: 'Số điện thoại liên hệ nếu khách/NCC có cung cấp.', inputRule: 'Có thể để trống nếu có Mã KH/Mã NCC, Zalo, Facebook, email, địa chỉ hoặc ghi chú nhận diện. Nếu nhập thì phải có 9-15 chữ số sau chuẩn hóa.', savedTo: 'phone, primaryPhone, contactMethods[]' };
    }
    if (normalized === 'ma kh') {
        return { ...base, purpose: 'Mã khách hàng từ hệ thống cũ hoặc mã nội bộ mới.', inputRule: 'Nên nhập khi khách không có SĐT để link đơn hàng/phiếu sửa lịch sử ổn định.', acceptedValues: 'KH-CU-0001, KH-ZALO-LAN...', savedTo: 'customers/{customerId}, customer_info.customerId' };
    }
    if (normalized === 'ma ncc') {
        return { ...base, purpose: 'Mã nhà cung cấp từ hệ thống cũ hoặc mã nội bộ mới.', inputRule: 'Nên nhập để tránh trùng NCC cùng tên. Không dùng để tạo phiếu nhập hàng lịch sử.', acceptedValues: 'NCC-CU-0001, NCC-PISEN...', savedTo: 'suppliers/{supplierId}' };
    }
    if (normalized === 'zalo') {
        return { ...base, purpose: 'Kênh liên hệ Zalo khi không có hoặc không muốn lưu SĐT.', inputRule: 'Nhập tên Zalo, số Zalo hoặc ghi chú nhận diện đủ rõ.', savedTo: 'contactMethods[type=zalo]' };
    }
    if (normalized === 'facebook') {
        return { ...base, purpose: 'Kênh liên hệ Facebook/Messenger.', inputRule: 'Nhập URL profile/page hoặc tên hiển thị đủ rõ.', savedTo: 'contactMethods[type=facebook]' };
    }
    if (normalized === 'kenh lien he chinh') {
        return { ...base, purpose: 'Chọn kênh liên hệ ưu tiên khi có nhiều kênh.', inputRule: 'Nếu để trống hệ thống ưu tiên SĐT, rồi Zalo/Facebook/email/địa chỉ.', acceptedValues: 'SĐT, Zalo, Facebook, Email, Địa chỉ, Khác', savedTo: 'primaryContactType, primaryContactValue' };
    }
    if (normalized === 'ma don') {
        return { ...base, purpose: 'Mã đơn hàng từ hệ thống cũ, dùng làm ID để tránh import trùng.', inputRule: 'Không chứa /, #, ?, [, ]. Nên giữ nguyên mã hóa đơn cũ.', savedTo: 'orders/{id}' };
    }
    if (normalized === 'ma phieu') {
        return { ...base, purpose: 'Mã phiếu sửa chữa từ hệ thống cũ, dùng làm ID để tránh import trùng.', inputRule: 'Không chứa /, #, ?, [, ]. Nên giữ nguyên mã phiếu cũ.', savedTo: 'repairs/{id}' };
    }
    if (normalized === 'tong tien') {
        return { ...base, purpose: 'Tổng tiền lịch sử của đơn hoặc phiếu sửa.', inputRule: 'Chỉ nhập số nguyên không âm.', acceptedValues: '0, 1500000...', savedTo: 'total_amount, payment.amount' };
    }
    if (normalized === 'thanh toan') {
        return { ...base, purpose: 'Trạng thái thanh toán lịch sử.', inputRule: 'Nhập paid/đã thanh toán, unpaid/chưa thanh toán hoặc debt/ghi nợ.', acceptedValues: 'paid, unpaid, debt', savedTo: 'paymentStatus, payment.status' };
    }
    if (normalized === 'trang thai') {
        return { ...base, purpose: 'Trạng thái nghiệp vụ lịch sử.', inputRule: 'Đơn hàng dùng Pending/Completed/Cancelled. Phiếu sửa giữ nguyên trạng thái workflow cũ nếu cần đối soát.', savedTo: 'status, statusTimeline' };
    }
    if (normalized.startsWith('ngay')) {
        return { ...base, purpose: 'Mốc thời gian lịch sử cần giữ để bảo hành và báo cáo.', inputRule: 'Nhập dạng yyyy-mm-dd hoặc dd/mm/yyyy. Excel date cũng được hỗ trợ.', savedTo: 'createdAt, completedAt, warrantyExpiresAt, timing.*' };
    }
    if (normalized === 'loai kh') {
        return { ...base, purpose: 'Loại khách hàng.', inputRule: 'Nhập Khách lẻ hoặc Khách sỉ. Để trống mặc định Khách lẻ.', acceptedValues: 'Khách lẻ, Khách sỉ, retail, wholesale', savedTo: 'type' };
    }
    if (normalized === 'chi tieu') {
        return { ...base, purpose: 'Tổng chi tiêu cũ của khách hàng.', inputRule: 'Chỉ nhập số nguyên không âm.', savedTo: 'totalSpent' };
    }
    if (normalized === 'don hang') {
        return { ...base, purpose: 'Tổng số đơn hàng cũ.', inputRule: 'Chỉ nhập số nguyên không âm.', savedTo: 'totalOrders' };
    }
    if (normalized === 'sua chua') {
        return { ...base, purpose: 'Tổng số lần sửa chữa cũ.', inputRule: 'Chỉ nhập số nguyên không âm.', savedTo: 'totalRepairs' };
    }
    if (normalized === 'cong no') {
        return { ...base, purpose: 'Công nợ khởi tạo hoặc công nợ còn sót từ hệ thống cũ.', inputRule: 'Nhập số dương nếu cửa hàng nợ đối tác, số âm nếu đối tác nợ cửa hàng. Dòng có công nợ phải có kênh liên hệ rõ. Với NCC, đây chỉ là số dư còn sót, không tạo phiếu nhập hàng lịch sử.', savedTo: 'totalDebt, *_transactions' };
    }
    if (normalized === 'ten ncc') {
        return { ...base, purpose: 'Tên nhà cung cấp.', inputRule: 'Không để trống, không trùng lặp.', savedTo: 'name' };
    }
    if (normalized === 'nguoi lien he') {
        return { ...base, purpose: 'Tên người liên hệ đại diện.', inputRule: 'Nhập text.', savedTo: 'contactPerson' };
    }
    if (normalized === 'cong ty') {
        return { ...base, purpose: 'Tên công ty hoặc pháp nhân.', inputRule: 'Nhập text.', savedTo: 'companyName' };
    }
    if (normalized === 'phan loai') {
        return { ...base, purpose: 'Phân loại nhóm nhà cung cấp.', inputRule: 'Nhập text.', savedTo: 'supplierType' };
    }
    if (normalized === 'ma so thue') {
        return { ...base, purpose: 'Mã số thuế của NCC.', inputRule: 'Nhập chuỗi số.', savedTo: 'taxCode' };
    }
    if (normalized === 'so tai khoan') {
        return { ...base, purpose: 'Số tài khoản ngân hàng.', inputRule: 'Nhập chuỗi số.', savedTo: 'bankAccount' };
    }
    if (normalized === 'ngan hang') {
        return { ...base, purpose: 'Tên ngân hàng thụ hưởng.', inputRule: 'Nhập text.', savedTo: 'bankName' };
    }
    if (normalized === 'han thanh toan') {
        return { ...base, purpose: 'Hạn thanh toán định kỳ (số ngày).', inputRule: 'Nhập số nguyên không âm.', savedTo: 'paymentTermsDays' };
    }
    if (normalized === 'phu trach') {
        return { ...base, purpose: 'Nhân sự phụ trách NCC.', inputRule: 'Nhập text.', savedTo: 'assignedOwner' };
    }

    return base;
}

export function buildColumnGuideRows(modeConfig: ModeConfig): TemplateCell[][] {
    return [
        ['Cột', 'Bắt buộc', 'Dùng để làm gì', 'Quy ước nhập', 'Giá trị hợp lệ', 'Ví dụ', 'Ghi vào dữ liệu'],
        ...modeConfig.templateHeaders.map((header) => {
            const guide = columnGuideForHeader(header, modeConfig);
            return [
                guide.column,
                guide.required,
                guide.purpose,
                guide.inputRule,
                guide.acceptedValues,
                guide.example,
                guide.savedTo,
            ];
        }),
    ];
}

export function flattenTaxonomyRows(nodes: TaxonomyNode[], parentNames: string[] = [], level = 1): TemplateCell[][] {
    return nodes.flatMap((node) => {
        const names = [...parentNames, node.name];
        return [
            [
                level,
                names.join(' > '),
                node.id,
                node.slug,
                node.warrantyType || '',
                node.warrantyMonths ?? '',
                node.seoKeywords || '',
            ],
            ...flattenTaxonomyRows(node.children || [], names, level + 1),
        ];
    });
}

export function buildQuickGuideRows(modeConfig: ModeConfig): TemplateCell[][] {
    const isProductLike = modeConfig.collectionName === 'products' || modeConfig.collectionName === 'services';

    if (!isProductLike) {
        return [
            ['HƯỚNG DẪN IMPORT DỮ LIỆU BAN ĐẦU', '', ''],
            ['Loại dữ liệu', modeConfig.title, ''],
            ['Sheet cần nhập', `Nhập dữ liệu ở sheet đầu tiên: ${modeConfig.sheetName}. Các sheet sau chỉ để hướng dẫn.`, ''],
            ['Cột bắt buộc', modeConfig.requiredHeaders.join(', '), 'Không được để trống.'],
            ['Quy trình', '1. Tải mẫu -> 2. Điền sheet đầu tiên -> 3. Upload Excel -> 4. Sửa lỗi trong bảng preview -> 5. Import hàng loạt.', ''],
            ['Công nợ', 'Nhập số dương nếu cửa hàng nợ đối tác, số âm nếu đối tác nợ cửa hàng.', ''],
            ['Import gate', 'Nút import bị khóa nếu còn lỗi. Warning chỉ nhắc kiểm tra lại và không chặn import.', ''],
        ];
    }

    return [
        ['HƯỚNG DẪN IMPORT DỮ LIỆU BAN ĐẦU', '', ''],
        ['Loại dữ liệu', modeConfig.title, ''],
        ['Sheet cần nhập', `Nhập dữ liệu ở sheet đầu tiên: ${modeConfig.sheetName}. Các sheet sau chỉ để hướng dẫn.`, ''],
        ['Cột bắt buộc', modeConfig.requiredHeaders.join(', '), 'Không được để trống.'],
        ['Quy trình', '1. Tải mẫu -> 2. Điền sheet đầu tiên -> 3. Upload Excel -> 4. Sửa lỗi trong bảng preview -> 5. Chọn ảnh local nếu có -> 6. Import hàng loạt.', ''],
        ['Danh mục', 'Phải nhập breadcrumb đúng taxonomy, ví dụ A > B > C. Copy từ sheet Taxonomy_mau để tránh sai chính tả.', ''],
        ['Mã hàng', 'Có thể để trống để hệ thống tự sinh QR/barcode. Nếu nhập tay, mã phải hợp lệ và chưa tồn tại.', ''],
        ['Ảnh', 'Dùng URL đã upload trong MediaManager, URL public, hoặc đường dẫn local. Local path sẽ được resolve ở bước preview.', ''],
        ['Nhiều ảnh', 'Ảnh chính là ảnh đầu tiên. Ảnh phụ phân tách bằng dấu ; hoặc xuống dòng và sẽ lưu vào images[].', ''],
        ['Ảnh đã upload', 'Nếu chọn file local trùng tên ảnh đã có trong MediaManager, ví dụ ten-anh.png và ten-anh.webp, hệ thống dùng lại URL đã upload.', ''],
        ['Tồn kho', 'Nếu tồn kho > 0, hệ thống tạo inventory_logs type IMPORT cùng transaction với sản phẩm.', ''],
        ['Import gate', 'Nút import bị khóa nếu còn lỗi. Warning chỉ nhắc kiểm tra lại và không chặn import.', ''],
    ];
}

export function buildAcceptedValuesRows(mode: ExcelImportMode): TemplateCell[][] {
    const folder = imageUploadFolderForMode(mode);
    return [
        ['Nhóm', 'Giá trị / Quy ước', 'Áp dụng', 'Ghi chú'],
        ['Tình trạng', 'new', 'Sản phẩm, phụ kiện', 'Hàng mới. Nếu để trống sẽ mặc định new.'],
        ['Tình trạng', 'like-new', 'Sản phẩm, phụ kiện', 'Hàng cũ đẹp/99%.'],
        ['Tình trạng', 'used', 'Sản phẩm, phụ kiện', 'Hàng đã qua sử dụng.'],
        ['Chất lượng linh kiện', QUALITY_OPTIONS.join(', '), 'Linh kiện', 'Nên dùng thống nhất để lọc và bảo hành.'],
        ['Boolean', 'yes, true, 1, x', 'Flash Sale', 'Các giá trị này được hiểu là bật. Để trống là tắt.'],
        ['Danh sách', 'Dùng dấu phẩy, dấu ; hoặc xuống dòng', 'Tags, ảnh phụ', 'Importer sẽ tách thành mảng.'],
        ['Thông số', 'key:value; key:value', 'Sản phẩm, phụ kiện', 'Ví dụ RAM:8GB; Bộ nhớ:256GB.'],
        ['Ảnh URL', 'http:// hoặc https://', 'Tất cả loại', 'URL phải tải được từ trình duyệt.'],
        ['Ảnh local', 'M:\\anh\\ten-file.png hoặc ten-file.png', 'Tất cả loại', 'Sau preview phải chọn file/thư mục ảnh để resolve thành URL.'],
        ['Storage folder', folder, mode === 'service' ? 'Dịch vụ' : mode === 'part' ? 'Linh kiện' : 'Sản phẩm/phụ kiện', 'Ảnh local upload mới sẽ đi vào folder này.'],
        ['Tối ưu ảnh', 'Resize + convert WebP + thumbnail', 'Ảnh local upload mới', 'Tên gốc được giữ base name, đổi đuôi sang .webp để tái sử dụng.'],
        ['Video', 'URL video/embed', 'Sản phẩm, phụ kiện, dịch vụ', 'Lưu vào videoEmbedUrl.'],
    ];
}

export function buildMediaGuideRows(mode: ExcelImportMode): TemplateCell[][] {
    const folder = imageUploadFolderForMode(mode);
    return [
        ['Tình huống', 'Cách điền trong Excel', 'Kết quả khi preview/import'],
        ['Dùng ảnh đã có trong MediaManager', 'Paste URL Firebase/MediaManager vào Ảnh chính hoặc Ảnh phụ.', 'Importer dùng URL đó, không upload thêm.'],
        ['Dùng ảnh public online', 'https://domain.com/image.jpg', 'Importer chấp nhận nếu URL hợp lệ.'],
        ['Dùng file local chưa upload', 'M:\\anh-san-pham\\iphone-front.png', `Ở preview, chọn file/thư mục ảnh. Hệ thống upload WebP vào media/${folder}.`],
        ['Dùng file local đã upload trước đó', 'iphone-front.png', 'Nếu MediaManager có iphone-front.webp, hệ thống dùng lại URL cũ thay vì upload trùng.'],
        ['Nhiều ảnh phụ', 'url-1; url-2; M:\\anh\\url-3.png', 'Tất cả được gom vào images[]. Ảnh chính vẫn là images[0].'],
        ['Bỏ bớt ảnh', 'Xóa URL/path khỏi ô Ảnh phụ trước khi import.', 'Item chỉ lưu các ảnh còn lại, không xóa file gốc khỏi MediaManager.'],
        ['Đổi ảnh chính', 'Đưa URL/path muốn làm ảnh chính vào cột Ảnh chính.', 'imageUrl sẽ lấy ảnh chính đó.'],
    ];
}

export function buildExampleRows(mode: ExcelImportMode, modeConfig: ModeConfig): TemplateCell[][] {
    const rows: TemplateCell[][] = [modeConfig.templateHeaders, modeConfig.exampleRow];
    rows.push(makeTemplateRow(modeConfig, EXCEL_IMPORT_ADDITIONAL_EXAMPLE_ROWS[mode]));

    return rows;
}

export function buildTaxonomyRows(taxonomy: TaxonomyNode[]): TemplateCell[][] {
    const taxonomyRows = flattenTaxonomyRows(taxonomy);
    return [
        ['Cấp', 'Breadcrumb copy vào cột Danh mục', 'ID taxonomy', 'Slug', 'Loại bảo hành', 'Tháng BH mặc định', 'SEO keywords'],
        ...(taxonomyRows.length > 0
            ? taxonomyRows
            : [[
                '',
                'Chưa có taxonomy trong cấu hình hiện tại. Hãy tạo taxonomy ở Admin Settings trước khi import.',
                '',
                '',
                '',
                '',
                '',
            ]]),
    ];
}

export function generateTemplate(mode: ExcelImportMode, taxonomy: TaxonomyNode[] = []) {
    const modeConfig = MODE_CONFIG[mode];
    const dataRows: TemplateCell[][] = [
        modeConfig.templateHeaders,
        modeConfig.exampleRow,
        ...Array.from({ length: 8 }, () => modeConfig.templateHeaders.map(() => '')),
    ];
    const dataSheet = worksheetFromRows(
        dataRows,
        modeConfig.templateHeaders.map((header) => {
            const normalized = normalizeText(header);
            if (normalized.includes('mo ta') || normalized.includes('anh') || normalized.includes('thong so') || normalized.includes('dia chi') || normalized.includes('ghi chu')) return 44;
            if (normalized === 'danh muc') return 38;
            return 18;
        }),
        true,
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, dataSheet, modeConfig.sheetName);
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildQuickGuideRows(modeConfig), [24, 96, 48]), 'Huong_dan');
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildColumnGuideRows(modeConfig), [24, 14, 44, 56, 38, 42, 38], true), 'Quy_uoc_cot');

    if (modeConfig.collectionName === 'products' || modeConfig.collectionName === 'services') {
        XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildAcceptedValuesRows(mode), [24, 44, 30, 70], true), 'Gia_tri_hop_le');
        XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildMediaGuideRows(mode), [34, 58, 74], true), 'Anh_va_Media');
        XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildTaxonomyRows(taxonomy), [10, 58, 36, 28, 22, 18, 44], true), 'Taxonomy_mau');
    }

    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildExampleRows(mode, modeConfig), modeConfig.templateHeaders.map(() => 24), true), 'Vi_du_day_du');
    XLSX.writeFile(wb, `mau_khoi_tao_${modeConfig.sheetName.toLowerCase()}.xlsx`);
}
