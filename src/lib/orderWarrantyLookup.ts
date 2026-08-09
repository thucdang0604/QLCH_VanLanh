/** Normalized form used by the Firestore warranty-serial lookup index. */
export function normalizeWarrantySerial(value: unknown): string {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Collects serials from order rows without storing duplicate index values. */
export function collectOrderWarrantySerials(items: unknown): string[] {
    if (!Array.isArray(items)) return [];

    const serials = new Set<string>();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const imeis = (item as { imeis?: unknown }).imeis;
        if (!Array.isArray(imeis)) continue;
        for (const imei of imeis) {
            const serial = normalizeWarrantySerial(imei);
            if (serial) serials.add(serial);
        }
    }
    return [...serials];
}
