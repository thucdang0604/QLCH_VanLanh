/**
 * Image upload validation utility
 * Dùng chung cho mọi upload component (banner, product, article, review)
 */

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validate image file before upload
 * @returns Error message string, or null if valid
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Chỉ chấp nhận JPG, PNG, WebP';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 2 MB.`;
  }
  return null;
}

export { MAX_FILE_SIZE, ALLOWED_TYPES };
