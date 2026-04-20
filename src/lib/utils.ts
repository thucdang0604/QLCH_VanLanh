export function generateSlug(text: string): string {
    return text
        .toString()
        .normalize('NFD') // Normalize to decomposed form
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .trim()
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9 -]/g, '') // Remove invalid characters
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/-+/g, '-'); // Replace multiple - with single -
}
