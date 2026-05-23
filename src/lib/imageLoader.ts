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
  // Ảnh từ Firebase Storage
  if (src.includes('firebasestorage.googleapis.com')) {
    let disableProxy = false;
    if (typeof window !== 'undefined') {
      disableProxy = localStorage.getItem('disableImageProxy') === 'true';
    }

    const hasThumb = src.includes('hasThumb=true');
    const bypassProxyParam = src.includes('bypassProxy=true');
    
    // Clean up flags for final URL
    const cleanSrc = src
      .replace('&hasThumb=true', '')
      .replace('?hasThumb=true', '')
      .replace('&bypassProxy=true', '')
      .replace('?bypassProxy=true', '');

    // Nếu có cờ bypassProxy=true, trả về URL gốc luôn để fetch CDN nhanh nhất (dùng cho Hero Image)
    if (bypassProxyParam) {
      // Thêm tham số w= giả để tránh lỗi "does not implement width" của Next.js
      return cleanSrc.includes('?') ? `${cleanSrc}&w=${width}` : `${cleanSrc}?w=${width}`;
    }

    // Luôn sử dụng proxy để resize ảnh theo width (giúp responsive srcSet hoạt động đúng)
    if (!disableProxy) {
      const q = _quality || 75;
      return `https://wsrv.nl/?url=${encodeURIComponent(cleanSrc)}&w=${width}&output=webp&q=${q}&fit=cover`;
    }

    // Fallback: If proxy is disabled, or we didn't use proxy
    // If Next.js requests a small image (<= 384) and we have a thumb, use the thumb instead of the huge original
    if (width <= 384 && hasThumb) {
      // Thay thế phần mở rộng bằng _thumb
      // Firebase URLs format: .../media%2Fproducts%2F123_name.webp?alt=media
      const thumbUrl = cleanSrc.replace(/\.([a-zA-Z0-9]+)(\?alt=media)/, '_thumb.$1$2');
      return thumbUrl.includes('?') ? `${thumbUrl}&w=${width}` : `${thumbUrl}?w=${width}`;
    }

    // Ảnh lớn trả về gốc để giữ độ nét
    return cleanSrc.includes('?') ? `${cleanSrc}&w=${width}` : `${cleanSrc}?w=${width}`;
  }
  
  // Ảnh từ Google User Content (avatar, etc.)
  if (src.includes('googleusercontent.com')) {
    // Google image URLs support resize via =wN param
    return `${src}=w${width}`;
  }

  // Ảnh local hoặc external khác — trả về nguyên bản
  return src;
}
