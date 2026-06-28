/**
 * Image upload validation utility.
 * Used by upload surfaces before optional client-side optimization.
 */

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface ValidateImageOptions {
  maxFileSize?: number;
  maxFileSizeLabel?: string;
}

/**
 * Validate image file before upload.
 * @returns Error message string, or null if valid.
 */
export function validateImageFile(file: File, options: ValidateImageOptions = {}): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Chỉ chấp nhận JPG, PNG, WebP';
  }

  const maxFileSize = options.maxFileSize ?? MAX_FILE_SIZE;
  const maxFileSizeLabel = options.maxFileSizeLabel ?? `${(maxFileSize / 1024 / 1024).toFixed(0)} MB`;
  if (file.size > maxFileSize) {
    return `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa ${maxFileSizeLabel}.`;
  }

  return null;
}

export { MAX_FILE_SIZE, ALLOWED_TYPES };
