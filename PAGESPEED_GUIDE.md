# PageSpeed Insights — Hướng Dẫn Đánh Giá & Tối Ưu

> **Dự án:** fixphone.vn (QLCH_VanLanh)  
> **Stack:** Next.js 14 (App Router) + Firebase Hosting + Firestore  
> **Nguồn:** [Lighthouse Scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring) · [PSI API](https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed)  
> **Cập nhật:** 2026-05-04

---

## Mục Lục

1. [Tổng Quan Hệ Thống Chấm Điểm](#1-tổng-quan-hệ-thống-chấm-điểm)
2. [Performance (Hiệu Suất)](#2-performance-hiệu-suất)
3. [Accessibility (Hỗ Trợ Tiếp Cận)](#3-accessibility-hỗ-trợ-tiếp-cận)
4. [Best Practices (Phương Pháp Hay Nhất)](#4-best-practices-phương-pháp-hay-nhất)
5. [SEO](#5-seo)
6. [Diagnostics & Opportunities (Không Tính Điểm)](#6-diagnostics--opportunities-không-tính-điểm)
7. [Ánh Xạ Cụ Thể Cho Dự Án fixphone.vn](#7-ánh-xạ-cụ-thể-cho-dự-án-fixphonevn)
8. [Cách Kiểm Tra Nhanh Bằng API](#8-cách-kiểm-tra-nhanh-bằng-api)

---

## 1. Tổng Quan Hệ Thống Chấm Điểm

PageSpeed Insights chấm **4 danh mục** độc lập, mỗi danh mục có điểm 0–100:

| Danh mục | Mô tả | Ảnh hưởng SEO |
|---|---|---|
| **Performance** | Tốc độ tải trang, tương tác | ✅ Core Web Vitals (ranking signal) |
| **Accessibility** | Khả năng tiếp cận cho tất cả người dùng | ⚠️ Gián tiếp (UX/engagement) |
| **Best Practices** | Bảo mật, API hiện đại, không lỗi console | ⚠️ Gián tiếp |
| **SEO** | Meta tags, cấu trúc HTML, mobile-friendly | ✅ Trực tiếp |

### Thang Màu

| Điểm | Màu | Đánh giá |
|---|---|---|
| 90–100 | 🟢 Xanh | Tốt |
| 50–89 | 🟠 Cam | Cần cải thiện |
| 0–49 | 🔴 Đỏ | Kém |

### Dữ Liệu Nguồn

PSI sử dụng 2 loại dữ liệu:
- **Field Data (CrUX):** Dữ liệu thực tế từ người dùng Chrome trong 28 ngày. Đây là dữ liệu Google dùng để xếp hạng.
- **Lab Data (Lighthouse):** Dữ liệu mô phỏng từ môi trường kiểm soát. Hữu ích để debug nhưng không phải ranking signal.

---

## 2. Performance (Hiệu Suất)

### Cách Tính Điểm

Điểm Performance = **trung bình có trọng số** (weighted average) của 5 chỉ số. Mỗi chỉ số được chuyển đổi từ giá trị ms/số sang điểm 0-100 dựa trên phân phối log-normal từ dữ liệu HTTP Archive.

### 5 Chỉ Số & Trọng Số (Lighthouse 10+)

| Chỉ số | Trọng số | Mô tả | 🟢 Tốt | 🟠 Trung bình | 🔴 Kém |
|---|---|---|---|---|---|
| **FCP** (First Contentful Paint) | **10%** | Thời gian hiển thị nội dung đầu tiên | ≤ 1.8s | 1.8–3.0s | > 3.0s |
| **SI** (Speed Index) | **10%** | Tốc độ hiển thị nội dung trực quan | ≤ 3.4s | 3.4–5.8s | > 5.8s |
| **LCP** (Largest Contentful Paint) | **25%** | Thời gian hiển thị phần tử lớn nhất | ≤ 2.5s | 2.5–4.0s | > 4.0s |
| **TBT** (Total Blocking Time) | **30%** | Tổng thời gian main thread bị block | ≤ 200ms | 200–600ms | > 600ms |
| **CLS** (Cumulative Layout Shift) | **25%** | Mức độ dịch chuyển layout | ≤ 0.1 | 0.1–0.25 | > 0.25 |

> **Ghi chú quan trọng:** TBT (30%) + LCP (25%) + CLS (25%) = **80%** tổng điểm. Tập trung vào 3 chỉ số này để đạt hiệu quả tối ưu cao nhất.

### Chi Tiết Từng Chỉ Số

#### FCP — First Contentful Paint (10%)
- **Đo gì:** Thời gian từ khi user request đến khi browser render text/image đầu tiên.
- **Ảnh hưởng bởi:** Server response time, render-blocking CSS/JS, font loading.
- **Dự án fixphone.vn:** Font chữ, CSS critical path, Firebase Hosting response time.

#### SI — Speed Index (10%)
- **Đo gì:** Tốc độ nội dung trở nên hiển thị trong viewport.
- **Ảnh hưởng bởi:** Mọi thứ ảnh hưởng FCP + rendering tiến trình.

#### LCP — Largest Contentful Paint (25%) ⭐
- **Đo gì:** Thời gian phần tử lớn nhất (image, video, text block) hiển thị xong.
- **Phần tử LCP thường gặp:** `<img>`, `<video>`, block-level element với background-image, text node lớn.
- **4 pha của LCP:**
  1. Time to First Byte (TTFB)
  2. Resource load delay (image discovery)
  3. Resource load time
  4. Element render delay
- **Dự án fixphone.vn:** Banner slider trong `HeroSection.tsx` là LCP element.

#### TBT — Total Blocking Time (30%) ⭐⭐
- **Đo gì:** Tổng thời gian main thread bị block bởi long tasks (> 50ms) giữa FCP và TTI.
- **Ảnh hưởng bởi:** JavaScript evaluation, parsing, compilation.
- **Dự án fixphone.vn:** Bundle JS từ Firebase SDK, Firestore listeners, client components.

#### CLS — Cumulative Layout Shift (25%) ⭐
- **Đo gì:** Tổng điểm dịch chuyển layout bất ngờ (không do user interaction).
- **Nguyên nhân phổ biến:** Image không có kích thước, font loading, dynamic content injection.
- **Dự án fixphone.vn:** Banner slider, lazy-loaded images, dynamic booking form.

### Desktop vs Mobile

- **Desktop:** Mô phỏng với Moto G Power, CPU throttling 1x, network không throttle.
- **Mobile:** Mô phỏng với Moto G Power, CPU throttling 4x, network "Slow 4G" (RTT 150ms, throughput 1.6Mbps).
- **Lưu ý:** Cùng một trang, điểm Mobile thường thấp hơn Desktop 20-40 điểm do throttling.

---

## 3. Accessibility (Hỗ Trợ Tiếp Cận)

### Cách Tính Điểm

Điểm Accessibility = trung bình có trọng số của **tất cả audit items** mà Lighthouse kiểm tra được. Mỗi audit có weight riêng (thường 1, 3, hoặc 10). Lighthouse chỉ kiểm tra **một phần** tiêu chuẩn WCAG 2.1 (khoảng 50+ audits tự động).

### Các Nhóm Kiểm Tra

| Nhóm | Ví dụ Audits | Weight |
|---|---|---|
| **Tên & Label** | `<input>` có `<label>`, `<select>` có `aria-label`, `<img>` có `alt` | 🔴 **10** (nặng) |
| **Tương phản** | Tỷ lệ contrast giữa text/background ≥ 4.5:1 (AA) | 🔴 **7** |
| **Điều hướng** | Focus order hợp lý, skip links, tabindex | 🟠 **3** |
| **ARIA** | ARIA attributes hợp lệ, roles đúng | 🟠 **3** |
| **Cấu trúc** | Heading hierarchy (`h1` → `h2` → `h3`), landmark regions | 🟡 **1-3** |
| **Touch target** | Kích thước touch target ≥ 48x48px | 🟡 **1-3** |

### Audits Phổ Biến Gây Mất Điểm

| Audit ID | Mô tả | Fix |
|---|---|---|
| `label` | `<select>`, `<input>` không có label | Thêm `<label>` hoặc `aria-label` |
| `color-contrast` | Text contrast ratio quá thấp | Tăng contrast CSS |
| `image-alt` | `<img>` không có `alt` attribute | Thêm `alt` mô tả |
| `button-name` | `<button>` không có accessible name | Thêm text hoặc `aria-label` |
| `link-name` | `<a>` không có discernible text | Thêm text hoặc `aria-label` |
| `tap-targets` | Touch target nhỏ hơn 48×48px | Tăng padding/size |

> **Lưu ý:** Accessibility score chỉ phản ánh phần Lighthouse tự động kiểm tra được. Cần test thủ công bằng screen reader (NVDA/VoiceOver) để đạt WCAG đầy đủ.

---

## 4. Best Practices (Phương Pháp Hay Nhất)

### Các Nhóm Kiểm Tra

| Nhóm | Audits | Pass Condition |
|---|---|---|
| **HTTPS** | Trang sử dụng HTTPS | ✅ Firebase Hosting mặc định |
| **Console errors** | Không có lỗi JS trong console | Kiểm tra `window.onerror` |
| **DOCTYPE** | Trang có `<!DOCTYPE html>` | ✅ Next.js mặc định |
| **Charset** | `<meta charset="UTF-8">` | ✅ Next.js mặc định |
| **Deprecated APIs** | Không dùng API deprecated | Kiểm tra `document.write()`, `unload` event |
| **Image aspect ratio** | `width`/`height` đúng tỉ lệ | Set `width`/`height` trên `<img>` |
| **Image resolution** | Ảnh có độ phân giải phù hợp | Dùng `srcset` / `sizes` |

---

## 5. SEO

### Các Nhóm Kiểm Tra

| Nhóm | Audits | Trạng Thái Dự Án |
|---|---|---|
| **Meta tags** | `<title>`, `<meta description>`, viewport | Cần kiểm tra từng page |
| **Crawlability** | robots.txt, `<a>` có `href`, no `noindex` | ✅ |
| **Mobile** | Viewport meta tag, font size ≥ 12px | ✅ responsive design |
| **Structured data** | Schema markup hợp lệ (nếu có) | Cần thêm LocalBusiness schema |
| **Canonical** | `<link rel="canonical">` | Cần kiểm tra |
| **Hreflang** | Nếu đa ngôn ngữ | N/A (tiếng Việt only) |

### Audits Quan Trọng

| Audit | Mô tả | Weight |
|---|---|---|
| `viewport` | Có `<meta name="viewport">` | **Nặng** |
| `document-title` | `<title>` không trống | Nặng |
| `meta-description` | `<meta name="description">` có nội dung | Nặng |
| `http-status-code` | Trả về 200 | Nặng |
| `link-text` | Text link mô tả (không dùng "click here") | Trung bình |
| `is-crawlable` | Không bị block bởi robots | Nặng |
| `hreflang` | Hreflang hợp lệ (nếu có) | Nhẹ |

---

## 6. Diagnostics & Opportunities (Không Tính Điểm)

Các mục này **KHÔNG trực tiếp ảnh hưởng điểm** nhưng cải thiện chúng sẽ **gián tiếp** cải thiện 5 chỉ số Performance.

### Opportunities (Đề Xuất Cải Thiện)

| Opportunity | Ảnh hưởng gián tiếp | Liên quan dự án |
|---|---|---|
| **Eliminate render-blocking resources** | FCP, LCP | CSS/JS blocking render |
| **Properly size images** | LCP, SI | Firebase Storage images |
| **Serve images in next-gen formats** | LCP, SI | WebP conversion (`imageOptimizer.ts`) |
| **Reduce unused JavaScript** | TBT | Firebase SDK bundles |
| **Reduce unused CSS** | FCP | Tailwind purge |
| **Enable text compression** | FCP, LCP | Firebase Hosting gzip/brotli |
| **Preconnect to required origins** | FCP, LCP | `firebasestorage.googleapis.com` |
| **Preload LCP image** | LCP | HeroSection banner |
| **Avoid lazy-loading LCP image** | LCP | ⚠️ **Đã fix** |
| **Use fetchpriority=high on LCP image** | LCP | ⚠️ **Đã fix** |

### Diagnostics (Chẩn Đoán)

| Diagnostic | Mô tả | Ngưỡng cảnh báo |
|---|---|---|
| **Minimize main thread work** | Tổng thời gian xử lý main thread | > 2s (warning), > 4s (error) |
| **Reduce JavaScript execution time** | Thời gian evaluate/compile/execute JS | > 2s |
| **Avoid excessive DOM size** | Số lượng DOM elements | > 800 elements |
| **Avoid enormous network payloads** | Tổng kích thước tải | > 5MB |
| **Serve static assets with efficient cache** | Cache TTL quá ngắn | < 1 ngày |
| **Avoid non-composited animations** | Animation gây layout/paint | Bất kỳ animation nào |

---

## 7. Ánh Xạ Cụ Thể Cho Dự Án fixphone.vn

### Bảng Ánh Xạ: Vấn Đề → File → Fix

| Vấn đề PageSpeed | File liên quan | Cách fix | Trạng thái |
|---|---|---|---|
| **LCP: lazy-loading + fetchpriority** | `HeroSection.tsx` | `priority={true}`, defer non-first images | ✅ Đã fix |
| **A11y: Select thiếu label** | `BookingSection.tsx`, `ServiceDetailClient.tsx` | `aria-label="..."` | ✅ Đã fix |
| **A11y: Select thiếu label** | `CategoryClient.tsx` | `aria-label="..."` | ✅ Đã có sẵn |
| **TBT: JS execution time** | Bundle JS, Firebase SDK | Dynamic import, tree-shaking | 🔲 Chưa fix |
| **DOM Size** | `UniversalProductModal.tsx`, `HeroSection.tsx` | Flatten DOM, conditional render | 🔲 Chưa fix |
| **Cache: static assets** | `firebase.json`, `next.config.mjs` | Tăng `Cache-Control` TTL | 🔲 Cần kiểm tra |
| **Image: next-gen formats** | `imageOptimizer.ts` | WebP conversion at upload | ✅ Đã có |
| **Font: display** | `layout.tsx` (customer) | `font-display: swap` | Cần kiểm tra |

### Ưu Tiên Tối Ưu (ROI Cao → Thấp)

1. **TBT (30%)** — Giảm JS bundle: code-splitting, dynamic import Firebase SDK
2. **LCP (25%)** — ✅ Đã fix priority/fetchpriority cho banner
3. **CLS (25%)** — Set explicit width/height cho tất cả images, font preload
4. **FCP (10%)** — Preconnect Firebase origins, inline critical CSS
5. **SI (10%)** — Tổng hợp từ các cải thiện trên

### Preconnect Recommendations

Thêm vào `src/app/(customer)/layout.tsx` hoặc `layout.shell.tsx`:

```html
<link rel="preconnect" href="https://firebasestorage.googleapis.com" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

---

## 8. Cách Kiểm Tra Nhanh Bằng API

### API Endpoint

```
GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed
```

### Tham Số

| Param | Giá trị | Bắt buộc |
|---|---|---|
| `url` | URL cần test | ✅ |
| `strategy` | `DESKTOP` hoặc `MOBILE` | Không (mặc định: DESKTOP) |
| `category` | `PERFORMANCE`, `ACCESSIBILITY`, `BEST_PRACTICES`, `SEO` | Không (mặc định: PERFORMANCE) |
| `locale` | `vi` | Không |

### Ví Dụ: Test fixphone.vn

```bash
# Desktop - Performance only
curl "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://fixphone.vn&strategy=DESKTOP&category=PERFORMANCE&locale=vi"

# Desktop - Tất cả categories
curl "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://fixphone.vn&strategy=DESKTOP&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO&locale=vi"

# Mobile - Performance
curl "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://fixphone.vn&strategy=MOBILE&category=PERFORMANCE&locale=vi"
```

### Đọc Kết Quả API

```
response.lighthouseResult.categories.performance.score       → 0.0 - 1.0
response.lighthouseResult.categories.accessibility.score     → 0.0 - 1.0
response.lighthouseResult.audits["largest-contentful-paint"] → { numericValue: ms }
response.lighthouseResult.audits["total-blocking-time"]      → { numericValue: ms }
response.lighthouseResult.audits["cumulative-layout-shift"]  → { numericValue: score }
```

---

## Tham Khảo

- [Lighthouse Performance Scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- [Lighthouse Scoring Calculator](https://googlechrome.github.io/lighthouse/scorecalc/)
- [Web Vitals](https://web.dev/vitals/)
- [PageSpeed API Docs](https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed)
- [HTTP Archive](https://httparchive.org/) — Nguồn dữ liệu để tính scoring curves
