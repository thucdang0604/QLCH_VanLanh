/**
 * Custom Image Loader cho Firebase Hosting
 * 
 * Vì Firebase Hosting (Cloud Run) không ổn định với /_next/image proxy,
 * loader này trả về URL gốc của ảnh — vẫn giữ được:
 * - Responsive srcSet (sizes attribute)
 * - Lazy loading
 * - CLS prevention (width/height/fill)
 * - Priority preload cho LCP
 *
 * Mất đi: auto WebP/AVIF conversion (phụ thuộc vào source image format)
 */

import type { ImageLoaderProps } from 'next/image';

export default function firebaseImageLoader({ src, width, quality: _quality }: ImageLoaderProps): string {
  // Ảnh từ Firebase Storage — trả về URL gốc (đã được CDN cache)
  if (src.includes('firebasestorage.googleapis.com')) {
    return src;
  }
  
  // Ảnh từ Google User Content (avatar, etc.)
  if (src.includes('googleusercontent.com')) {
    // Google image URLs support resize via =wN param
    return `${src}=w${width}`;
  }

  // Ảnh local hoặc external khác — trả về nguyên bản
  return src;
}
