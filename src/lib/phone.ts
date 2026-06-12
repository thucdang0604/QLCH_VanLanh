export interface NormalizedVietnamPhone {
    local: string;
    e164: string;
}

export function normalizeVietnamPhone(raw: string): NormalizedVietnamPhone | null {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return null;

    let local = digits;
    if (digits.startsWith('84')) {
        local = `0${digits.slice(2)}`;
    }

    if (!/^0\d{9,10}$/.test(local)) {
        return null;
    }

    return {
        local,
        e164: `+84${local.slice(1)}`,
    };
}
