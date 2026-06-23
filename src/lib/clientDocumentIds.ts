import { generateSlug } from '@/lib/utils';

function dateKey() {
    const now = new Date();
    return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export function buildClientDocumentId(prefix: string, scope?: string | number) {
    const suffix = generateSlug(String(scope || 'doc')).slice(0, 48) || 'doc';
    return `${prefix.toUpperCase()}-${dateKey()}-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}
