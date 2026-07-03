import { normalizeVietnamPhone } from './phone';
import type { ContactMethod, ContactMethodSource, ContactMethodType } from './types/contact';
import { generateSearchKeywords, generateSlug } from './utils';

export interface ContactIdentityInput {
    name?: string;
    phone?: string;
    zalo?: string;
    facebook?: string;
    email?: string;
    address?: string;
    note?: string;
    other?: string;
    primaryType?: ContactMethodType;
    source?: ContactMethodSource;
    methodMeta?: Partial<Record<ContactMethodType, Partial<Omit<ContactMethod, 'type' | 'value' | 'normalizedValue' | 'isPrimary'>>>>;
}

const CONTACT_DEBT_TYPES = new Set<ContactMethodType>(['phone', 'zalo', 'facebook', 'email', 'address', 'other']);

function compact(value: string | undefined): string {
    return String(value || '').trim();
}

function compactOptional(value: string | undefined): string | undefined {
    const trimmed = compact(value);
    return trimmed || undefined;
}

function withoutUndefined<T extends object>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
    ) as T;
}

export function normalizeContactValue(type: ContactMethodType, value: string): string {
    const trimmed = compact(value);
    if (!trimmed) return '';

    if (type === 'phone') {
        return normalizeVietnamPhone(trimmed)?.local || '';
    }

    if (type === 'email') {
        return trimmed.toLowerCase();
    }

    if (type === 'facebook') {
        return trimmed
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '');
    }

    if (type === 'zalo') {
        return trimmed.toLowerCase().replace(/\s+/g, ' ');
    }

    return trimmed.toLowerCase().replace(/\s+/g, ' ');
}

export function buildContactMethods(input: ContactIdentityInput): ContactMethod[] {
    const candidates: Array<{ type: ContactMethodType; value: string; label?: string }> = [
        { type: 'phone', value: compact(input.phone), label: 'SDT' },
        { type: 'zalo', value: compact(input.zalo), label: 'Zalo' },
        { type: 'facebook', value: compact(input.facebook), label: 'Facebook' },
        { type: 'email', value: compact(input.email), label: 'Email' },
        { type: 'address', value: compact(input.address), label: 'Dia chi' },
        { type: 'note', value: compact(input.note), label: 'Ghi chu' },
        { type: 'other', value: compact(input.other), label: 'Khac' },
    ];

    const seen = new Set<string>();
    const methods = candidates.reduce<ContactMethod[]>((acc, candidate) => {
        if (!candidate.value) return acc;
        const normalizedValue = normalizeContactValue(candidate.type, candidate.value);
        if (!normalizedValue) return acc;
        const dedupeKey = `${candidate.type}:${normalizedValue}`;
        if (seen.has(dedupeKey)) return acc;
        seen.add(dedupeKey);
        const meta = input.methodMeta?.[candidate.type] || {};
        acc.push(withoutUndefined({
            type: candidate.type,
            label: candidate.label,
            value: candidate.value,
            normalizedValue,
            source: input.source,
            ...meta,
            externalId: compactOptional(meta.externalId),
            profileUrl: compactOptional(meta.profileUrl),
            qrImageUrl: compactOptional(meta.qrImageUrl),
            avatarUrl: compactOptional(meta.avatarUrl),
        }));
        return acc;
    }, []);

    const primaryIndex = methods.findIndex(method => method.type === input.primaryType);
    const fallbackIndex = methods.findIndex(method => CONTACT_DEBT_TYPES.has(method.type));
    const selectedIndex = primaryIndex >= 0 ? primaryIndex : fallbackIndex >= 0 ? fallbackIndex : 0;

    return methods.map((method, index) => ({
        ...method,
        isPrimary: index === selectedIndex,
    }));
}

function contactMethodKey(method: ContactMethod): string {
    const externalId = compact(method.externalId).toLowerCase();
    if (externalId) return `${method.type}:external:${externalId}`;
    const normalizedValue = compact(method.normalizedValue) || normalizeContactValue(method.type, method.value);
    return `${method.type}:value:${normalizedValue}`;
}

function mergeMethod(existing: ContactMethod | undefined, incoming: ContactMethod): ContactMethod {
    if (!existing) return withoutUndefined(incoming);
    return withoutUndefined({
        ...existing,
        ...incoming,
        label: incoming.label || existing.label,
        value: incoming.value || existing.value,
        normalizedValue: incoming.normalizedValue || existing.normalizedValue,
        source: incoming.source || existing.source,
        confidence: incoming.confidence || existing.confidence,
        externalId: incoming.externalId || existing.externalId,
        profileUrl: incoming.profileUrl || existing.profileUrl,
        qrImageUrl: incoming.qrImageUrl || existing.qrImageUrl,
        avatarUrl: incoming.avatarUrl || existing.avatarUrl,
        verified: incoming.verified ?? existing.verified,
        createdAt: existing.createdAt || incoming.createdAt,
        updatedAt: incoming.updatedAt || existing.updatedAt,
    });
}

export function mergeContactMethods(existing: unknown, incoming: ContactMethod[]): ContactMethod[] {
    const byKey = new Map<string, ContactMethod>();
    const originalPrimaryKey = Array.isArray(existing)
        ? (existing as ContactMethod[]).find(method => method?.isPrimary)
        : undefined;
    const incomingPrimaryKey = incoming.find(method => method?.isPrimary);
    const selectedPrimaryKey = incomingPrimaryKey
        ? contactMethodKey(incomingPrimaryKey)
        : originalPrimaryKey
            ? contactMethodKey(originalPrimaryKey)
            : '';

    const add = (method: ContactMethod) => {
        if (!method?.type || !(method.normalizedValue || method.value || method.externalId)) return;
        const key = contactMethodKey(method);
        byKey.set(key, mergeMethod(byKey.get(key), method));
    };

    if (Array.isArray(existing)) {
        existing.forEach(method => add(method as ContactMethod));
    }
    incoming.forEach(add);

    return Array.from(byKey.entries()).map(([key, method], index) => withoutUndefined({
        ...method,
        isPrimary: selectedPrimaryKey ? key === selectedPrimaryKey : index === 0,
    }));
}

export function getPrimaryContact(methods: ContactMethod[]): ContactMethod | null {
    return methods.find(method => method.isPrimary) || methods[0] || null;
}

export function hasProfileContact(methods: ContactMethod[]): boolean {
    return methods.some(method => Boolean(method.normalizedValue || method.value));
}

export function hasDebtSafeContact(methods: ContactMethod[]): boolean {
    return methods.some(method => CONTACT_DEBT_TYPES.has(method.type) && Boolean(method.normalizedValue || method.value));
}

export function buildContactSearchKeywords(input: ContactIdentityInput, methods = buildContactMethods(input)): string[] {
    const rawValues = [
        input.name,
        ...methods.flatMap(method => [method.value, method.normalizedValue, method.externalId, method.profileUrl]),
    ].filter(Boolean) as string[];

    const exactTokens = rawValues
        .map(value => normalizeContactValue('other', value))
        .filter(Boolean);
    const prefixTokens = generateSearchKeywords(rawValues.join(' '));

    return Array.from(new Set([...exactTokens, ...prefixTokens])).slice(0, 80);
}

export function buildContactlessDocumentBaseId(prefix: 'KH' | 'NCC', input: ContactIdentityInput): string {
    const methods = buildContactMethods(input);
    const primary = getPrimaryContact(methods);
    const phone = methods.find(method => method.type === 'phone')?.normalizedValue;
    const base = compact(phone)
        || compact(primary?.normalizedValue)
        || compact(primary?.value)
        || compact(input.name)
        || prefix.toLowerCase();
    const slug = generateSlug(base).slice(0, 80) || prefix.toLowerCase();
    return `${prefix}-${slug}`;
}
