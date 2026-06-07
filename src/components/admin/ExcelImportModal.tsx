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
import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { db, getStorageInstance } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import type { ProductSpecs, TaxonomyNode } from '@/lib/types';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import { buildProductCodeFromId, getProductCodeKind, normalizeProductCode, type ProductCodeKind } from '@/lib/productCodes';
import { assertProductCodesAvailable } from '@/lib/productCodeRegistry';
import { generateSearchKeywords, generateSlug } from '@/lib/utils';
import { triggerRevalidate } from '@/lib/revalidate';
import { optimizeImage } from '@/lib/imageOptimizer';
import { validateImageFile } from '@/lib/validateImage';

export type ExcelImportMode = 'product' | 'accessory' | 'part' | 'service';

type Step = 'upload' | 'validating' | 'preview' | 'importing' | 'done';
type CellValue = string | number | boolean | Date | null | undefined;
type ExcelRow = Record<string, CellValue>;
type TaxonomyType = 'retail' | 'component' | 'service';
type PreviewFilter = 'all' | 'valid' | 'errors' | 'warnings';
type CheckSeverity = 'ok' | 'warning' | 'error';
type ProductCondition = 'new' | 'like-new' | 'used';
type LocalImageUploadFolder = 'products' | 'parts' | 'services';

interface FieldCheck {
    key: string;
    label: string;
    value: string;
    severity: CheckSeverity;
    message: string;
}

interface ParsedRow {
    rowNum: number;
    data: ExcelRow;
    errors: string[];
    warnings: string[];
    checks: FieldCheck[];
    categoryIds: string[];
    category: string;
}

interface LocalImageRequirement {
    source: string;
    key: string;
    fileName: string;
    rows: number[];
}

interface UploadedMediaMatch {
    url: string;
    name: string;
    folder?: string;
}

interface ModeConfig {
    title: string;
    shortLabel: string;
    sheetName: string;
    collectionName: 'products' | 'services';
    taxonomyType: TaxonomyType;
    nameHeaders: string[];
    requiredHeaders: string[];
    templateHeaders: string[];
    exampleRow: string[];
    icon: 'product' | 'part' | 'service';
}

const MODE_CONFIG: Record<ExcelImportMode, ModeConfig> = {
    product: {
        title: 'Sản phẩm bán lẻ',
        shortLabel: 'sản phẩm',
        sheetName: 'San_pham',
        collectionName: 'products',
        taxonomyType: 'retail',
        nameHeaders: ['Tên SP', 'Tên', 'Tên sản phẩm'],
        requiredHeaders: ['Tên SP', 'Danh mục', 'Giá gốc'],
        templateHeaders: ['Tên SP', 'Mã hàng', 'Thương hiệu', 'Danh mục', 'Giá gốc', 'Giá KM', 'Giá vốn', 'NCC', 'Tồn kho', 'Tình trạng', 'Bảo hành tháng', 'Mô tả', 'Ảnh chính', 'Ảnh phụ', 'Thông số', 'Series ID', 'Màu sắc', 'Dung lượng', 'Flash Sale', 'Video'],
        exampleRow: ['iPhone 15 Pro Max 256GB', '', 'Apple', 'Điện thoại > iPhone > iPhone 15 Series', '29000000', '28500000', '27000000', 'NCC VN/A', '10', 'new', '12', 'Hàng chính hãng VN/A nguyên seal', 'https://example.com/iphone-15.jpg', 'https://example.com/iphone-15-2.jpg; https://example.com/iphone-15-3.jpg', 'Màn hình:6.7 inch; RAM:8GB; Bộ nhớ:256GB', 'iphone-15-pro-max', 'Titan tự nhiên', '256GB', 'yes', ''],
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
        exampleRow: ['Cáp sạc USB-C 60W chính hãng', '', 'Apple', 'Phụ kiện > Cáp sạc', '450000', '390000', '250000', 'NCC Phụ kiện', '30', 'new', '6', 'Cáp sạc nhanh USB-C 60W', 'https://example.com/cap-sac.jpg', '', 'Công suất:60W; Chuẩn:USB-C', ''],
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
        exampleRow: ['Màn hình iPhone 13 Pro Max Zin', '', 'Linh kiện Điện thoại > Màn hình', '1800000', '2500000', 'NCC Linh kiện', '5', 'Zin', 'Màn hình', 'iPhone 13 Pro Max', '6', 'Màn zin bóc máy, ép kính sẵn', 'https://example.com/man-iphone-13pm.jpg', ''],
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
        exampleRow: ['Thay pin iPhone 15 Pro Max', 'iPhone 15 Pro Max', 'Dịch vụ phổ biến > Thay Pin', '1500000', '1450000', '6 tháng', '30 phút', 'Pin dung lượng cao, bảo hành rõ ràng', 'https://example.com/thay-pin.jpg', 'https://example.com/thay-pin-2.jpg; https://example.com/thay-pin-3.jpg', 'Thay pin iPhone 15 Pro Max chính hãng, lấy liền tại Văn Lành.', 'pin, iphone, thay pin', ''],
        icon: 'service',
    },
};

const QUALITY_OPTIONS = ['Zin', 'Loại 1', 'Loại 2', 'Bóc máy'];
const PRODUCT_CONDITIONS: ProductCondition[] = ['new', 'like-new', 'used'];
const PREVIEW_CHECK_KEYS = ['name', 'category', 'price', 'cost', 'stock', 'code', 'images', 'details'];
const FIRESTORE_QUERY_CHUNK_SIZE = 10;
const IMAGE_MAIN_HEADERS = ['Ảnh chính', 'Ảnh', 'Image'];
const IMAGE_OTHER_HEADERS = ['Ảnh phụ', 'Images'];

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim();
}

function getValue(row: ExcelRow, headers: string[]): string {
    for (const header of headers) {
        const value = row[header];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return '';
}

function parseRawNumber(raw: string): number {
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

function getNumber(row: ExcelRow, headers: string[]): number {
    const raw = getValue(row, headers);
    if (!raw) return 0;
    const value = parseRawNumber(raw);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function parseNumberInput(row: ExcelRow, headers: string[]) {
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

function getBoolean(row: ExcelRow, headers: string[]): boolean {
    const raw = getValue(row, headers).toLowerCase();
    return ['1', 'true', 'yes', 'y', 'co', 'có', 'x'].includes(raw);
}

function splitList(value: string): string[] {
    return value
        .split(/[\n;,|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseImages(row: ExcelRow, mainHeaders: string[], otherHeaders: string[]): string[] {
    const main = getValue(row, mainHeaders);
    const others = splitList(getValue(row, otherHeaders));
    return Array.from(new Set([main, ...others].filter(Boolean)));
}

function normalizeLocalImageKey(value: string): string {
    return value
        .trim()
        .replace(/^file:\/+/i, '')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/([a-zA-Z]:\/)/, '$1')
        .toLowerCase();
}

function localImageFileName(value: string): string {
    const normalized = normalizeLocalImageKey(value);
    return decodeURIComponent(normalized.split('/').filter(Boolean).pop() || normalized);
}

function normalizeMediaBaseName(value: string): string {
    return localImageFileName(value).replace(/\.[^.]+$/, '').toLowerCase();
}

function buildMediaNameCandidates(fileName: string): string[] {
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

function preferMediaMatch(matches: UploadedMediaMatch[], preferredFolder: LocalImageUploadFolder): UploadedMediaMatch | null {
    if (matches.length === 0) return null;
    return [...matches].sort((left, right) => {
        const leftScore = left.folder === preferredFolder ? 0 : 1;
        const rightScore = right.folder === preferredFolder ? 0 : 1;
        return leftScore - rightScore;
    })[0];
}

function isLocalImageReference(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed || isValidHttpUrl(trimmed)) return false;
    return /\.(jpe?g|png|webp)$/i.test(trimmed);
}

function getFileRelativePath(file: File): string {
    const withRelativePath = file as File & { webkitRelativePath?: string };
    return withRelativePath.webkitRelativePath || file.name;
}

function fileMatchesLocalReference(file: File, source: string): boolean {
    const sourceKey = normalizeLocalImageKey(source);
    const relativePath = normalizeLocalImageKey(getFileRelativePath(file));
    const fileName = localImageFileName(file.name);
    if (relativePath && (sourceKey.endsWith(relativePath) || sourceKey.endsWith(`/${relativePath}`))) return true;
    return localImageFileName(sourceKey) === fileName;
}

function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function parseSpecs(raw: string): ProductSpecs {
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

function resolveCategoryPath(pathStr: string, taxonomy: TaxonomyNode[]): { categoryIds: string[]; category: string } {
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

function productKindForMode(mode: ExcelImportMode, category: string, categoryIds: string[]): ProductCodeKind {
    if (mode === 'part') return 'component';
    if (mode === 'accessory') return 'accessory';
    return getProductCodeKind({ category, categoryIds });
}

function buildImportProductId(mode: Exclude<ExcelImportMode, 'service'>, name: string, category: string): string {
    const categorySlug = generateSlug(category || '');
    const prefix =
        mode === 'part'
            ? 'LK'
            : mode === 'accessory' || categorySlug === 'accessory' || categorySlug === 'phu-kien'
              ? 'PK'
              : 'SP';
    return `${prefix}-${generateSlug(name)}`;
}

function resolveTargetDocId(mode: ExcelImportMode, row: ExcelRow, modeConfig: ModeConfig, taxonomy: TaxonomyNode[]): string {
    const name = getValue(row, modeConfig.nameHeaders);
    if (!name) return '';
    if (mode === 'service') return generateSlug(name);
    const categoryPath = getValue(row, ['Danh mục', 'Category']);
    const { category } = resolveCategoryPath(categoryPath, taxonomy);
    return buildImportProductId(mode, name, category);
}

function resolveExpectedProductCode(mode: ExcelImportMode, row: ExcelRow, modeConfig: ModeConfig, taxonomy: TaxonomyNode[]): string {
    if (mode === 'service') return '';
    const customCode = normalizeProductCode(getValue(row, ['Mã hàng', 'SKU', 'Barcode']));
    if (customCode) return customCode;
    const targetId = resolveTargetDocId(mode, row, modeConfig, taxonomy);
    const categoryPath = getValue(row, ['Danh mục', 'Category']);
    const { categoryIds, category } = resolveCategoryPath(categoryPath, taxonomy);
    const kind = productKindForMode(mode, category, categoryIds);
    return targetId ? buildProductCodeFromId(targetId, kind) : '';
}

function isAccessoryCategory(categoryIds: string[]): boolean {
    const firstCategoryId = normalizeText(categoryIds[0] || '');
    return firstCategoryId === 'phu-kien' || firstCategoryId.startsWith('phu-kien/');
}

function normalizeConditionInput(raw: string): ProductCondition | '' {
    const normalized = normalizeText(raw);
    if (!normalized) return '';
    if (PRODUCT_CONDITIONS.includes(raw as ProductCondition)) return raw as ProductCondition;
    if (['moi', 'moi-100', 'new-100'].includes(normalized)) return 'new';
    if (['like-new', 'likenew', 'cu-99', 'cu-99%', '99'].includes(normalized)) return 'like-new';
    if (['used', 'cu', 'hang-cu', 'tbh'].includes(normalized)) return 'used';
    return '';
}

function buildCheck(key: string, label: string, value: string, severity: CheckSeverity, message: string): FieldCheck {
    return { key, label, value: value || '—', severity, message };
}

function summarizeChecks(checks: FieldCheck[], severity: CheckSeverity): string[] {
    return checks
        .filter((check) => check.severity === severity)
        .map((check) => `${check.label}: ${check.message}`);
}

function severityClasses(severity: CheckSeverity): string {
    if (severity === 'error') return 'bg-red-50 text-red-700 border-red-200';
    if (severity === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-green-50 text-green-700 border-green-200';
}

function severityLabel(severity: CheckSeverity): string {
    if (severity === 'error') return 'Lỗi';
    if (severity === 'warning') return 'Cảnh báo';
    return 'Hợp lệ';
}

function imageUploadFolderForMode(mode: ExcelImportMode): LocalImageUploadFolder {
    if (mode === 'service') return 'services';
    if (mode === 'part') return 'parts';
    return 'products';
}

function collectLocalImageRequirements(rows: ParsedRow[]): LocalImageRequirement[] {
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

function replaceImageReferences(row: ExcelRow, replacements: Record<string, string>): ExcelRow {
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

function refreshImageChecks(row: ParsedRow): ParsedRow {
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

async function uploadInitialImportImage(file: File, folder: LocalImageUploadFolder): Promise<string> {
    const validationError = validateImageFile(file);
    if (validationError) throw new Error(validationError);

    const optimized = await optimizeImage(file, 800, 1600, 0.75);
    const thumb = await optimizeImage(file, 128, 128, 0.60);
    const storage = await getStorageInstance();
    const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const storagePath = `media/${folder}/${Date.now()}_${optimized.file.name}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, optimized.file, { contentType: optimized.file.type });
    let url = await getDownloadURL(storageRef);

    const thumbPath = storagePath.replace(/\.([a-zA-Z0-9]+)$/, '_thumb.$1');
    const thumbRef = ref(storage, thumbPath);
    await uploadBytes(thumbRef, thumb.file, { contentType: thumb.file.type });
    url = `${url}&hasThumb=true`;

    await addDoc(collection(db, 'media_library'), {
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
        createdAt: serverTimestamp(),
    });

    return url;
}

async function findExistingImportImage(fileName: string, folder: LocalImageUploadFolder): Promise<UploadedMediaMatch | null> {
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

async function loadExistingDocIds(collectionName: 'products' | 'services', ids: string[]): Promise<Set<string>> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    const existingIds = new Set<string>();
    await Promise.all(uniqueIds.map(async (id) => {
        const snapshot = await getDoc(doc(db, collectionName, id));
        if (snapshot.exists()) existingIds.add(id);
    }));
    return existingIds;
}

async function loadExistingProductCodes(codes: string[]): Promise<Set<string>> {
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

async function createInitialProductWithCodes(
    productId: string,
    data: Record<string, unknown>,
    codes: string[],
    inventoryLog?: Record<string, unknown>,
): Promise<string> {
    const normalizedCodes = await assertProductCodesAvailable(codes);
    const productRef = doc(db, 'products', productId);
    const registryRefs = normalizedCodes.map((code) => doc(db, 'product_code_registry', code));
    const logRef = inventoryLog ? doc(collection(db, 'inventory_logs')) : null;

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

function iconForMode(mode: ExcelImportMode) {
    if (MODE_CONFIG[mode].icon === 'part') return <Wrench size={22} className="text-emerald-600" />;
    if (MODE_CONFIG[mode].icon === 'service') return <Wrench size={22} className="text-blue-600" />;
    return <Package size={22} className="text-orange-600" />;
}

type TemplateCell = string | number;

interface ColumnGuide {
    column: string;
    required: string;
    purpose: string;
    inputRule: string;
    acceptedValues: string;
    example: string;
    savedTo: string;
}

function makeTemplateRow(modeConfig: ModeConfig, values: Record<string, string>): string[] {
    return modeConfig.templateHeaders.map((header) => values[normalizeText(header)] || '');
}

function worksheetFromRows(rows: TemplateCell[][], widths: number[], addFilter = false): XLSX.WorkSheet {
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

function columnGuideForHeader(header: string, modeConfig: ModeConfig): ColumnGuide {
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

    return base;
}

function buildColumnGuideRows(modeConfig: ModeConfig): TemplateCell[][] {
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

function flattenTaxonomyRows(nodes: TaxonomyNode[], parentNames: string[] = [], level = 1): TemplateCell[][] {
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

function buildQuickGuideRows(modeConfig: ModeConfig): TemplateCell[][] {
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

function buildAcceptedValuesRows(mode: ExcelImportMode): TemplateCell[][] {
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

function buildMediaGuideRows(mode: ExcelImportMode): TemplateCell[][] {
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

function buildExampleRows(mode: ExcelImportMode, modeConfig: ModeConfig): TemplateCell[][] {
    const rows: TemplateCell[][] = [modeConfig.templateHeaders, modeConfig.exampleRow];

    if (mode === 'product') {
        rows.push(makeTemplateRow(modeConfig, {
            'ten sp': 'Samsung Galaxy S25 Ultra 512GB',
            'ma hang': '',
            'thuong hieu': 'Samsung',
            'danh muc': 'Điện thoại > Samsung > Galaxy S Series',
            'gia goc': '31990000',
            'gia km': '29990000',
            'gia von': '28000000',
            ncc: 'NCC Samsung',
            'ton kho': '5',
            'tinh trang': 'new',
            'bao hanh thang': '12',
            'mo ta': 'Máy mới fullbox, bảo hành chính hãng.',
            'anh chinh': 'M:\\anh\\s25-ultra-front.png',
            'anh phu': 'M:\\anh\\s25-ultra-back.png; https://example.com/s25-side.webp',
            'thong so': 'Màn hình:6.8 inch; RAM:12GB; Bộ nhớ:512GB',
            'series id': 'galaxy-s25-ultra',
            'mau sac': 'Titan đen',
            'dung luong': '512GB',
            'flash sale': 'yes',
            video: 'https://www.youtube.com/watch?v=example',
        }));
    } else if (mode === 'accessory') {
        rows.push(makeTemplateRow(modeConfig, {
            'ten phu kien': 'Ốp lưng chống sốc iPhone 15 Pro Max',
            'ma hang': '',
            'thuong hieu': 'UAG',
            'danh muc': 'Phụ kiện > Ốp lưng',
            'gia goc': '650000',
            'gia km': '590000',
            'gia von': '380000',
            ncc: 'NCC Phụ kiện',
            'ton kho': '20',
            'tinh trang': 'new',
            'bao hanh thang': '3',
            'mo ta': 'Ốp chống sốc, bảo vệ camera.',
            'anh chinh': 'op-lung-iphone-15pm.png',
            'anh phu': 'op-lung-iphone-15pm-2.png; op-lung-iphone-15pm-3.png',
            'thong so': 'Chất liệu:TPU; Màu:Đen',
            video: '',
        }));
    } else if (mode === 'part') {
        rows.push(makeTemplateRow(modeConfig, {
            'ten linh kien': 'Pin iPhone 13 Pro Max Pisen',
            'ma hang': '',
            'danh muc': 'Linh kiện Điện thoại > Pin',
            'gia von': '420000',
            'gia ban': '650000',
            ncc: 'NCC Linh kiện',
            'ton kho': '8',
            'chat luong': 'Loại 1',
            'loai linh kien': 'Pin',
            'dong may tuong thich': 'iPhone 13 Pro Max',
            'bao hanh thang': '6',
            'mo ta': 'Pin dung lượng chuẩn, bảo hành 6 tháng.',
            'anh chinh': 'M:\\linh-kien\\pin-iphone-13pm.png',
            'anh phu': '',
        }));
    } else {
        rows.push(makeTemplateRow(modeConfig, {
            'ten dv': 'Ép kính iPhone 14 Pro Max',
            'dong may': 'iPhone 14 Pro Max',
            'danh muc': 'Dịch vụ phổ biến > Ép Kính',
            'gia goc': '900000',
            'gia km': '850000',
            'bao hanh': '30 ngày',
            'thoi gian sua': '2 giờ',
            'mo ta': 'Ép kính lấy liền, giữ màn zin nếu đủ điều kiện.',
            'anh chinh': 'ep-kinh-iphone-14pm.png',
            'anh phu': 'ep-kinh-iphone-14pm-2.png; https://example.com/ep-kinh-demo.webp',
            'seo description': 'Ép kính iPhone 14 Pro Max lấy liền, bảo hành rõ ràng tại Văn Lành.',
            tags: 'ep kinh, iphone, sua chua',
            video: 'https://www.youtube.com/watch?v=example',
        }));
    }

    return rows;
}

function buildTaxonomyRows(taxonomy: TaxonomyNode[]): TemplateCell[][] {
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

function generateTemplate(mode: ExcelImportMode, taxonomy: TaxonomyNode[] = []) {
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
            if (normalized.includes('mo ta') || normalized.includes('anh') || normalized.includes('thong so')) return 44;
            if (normalized === 'danh muc') return 38;
            return 18;
        }),
        true,
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, dataSheet, modeConfig.sheetName);
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildQuickGuideRows(modeConfig), [24, 96, 48]), 'Huong_dan');
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildColumnGuideRows(modeConfig), [24, 14, 44, 56, 38, 42, 38], true), 'Quy_uoc_cot');
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildAcceptedValuesRows(mode), [24, 44, 30, 70], true), 'Gia_tri_hop_le');
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildMediaGuideRows(mode), [34, 58, 74], true), 'Anh_va_Media');
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildTaxonomyRows(taxonomy), [10, 58, 36, 28, 22, 18, 44], true), 'Taxonomy_mau');
    XLSX.utils.book_append_sheet(wb, worksheetFromRows(buildExampleRows(mode, modeConfig), modeConfig.templateHeaders.map(() => 24), true), 'Vi_du_day_du');
    XLSX.writeFile(wb, `mau_khoi_tao_${modeConfig.sheetName.toLowerCase()}.xlsx`);
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
