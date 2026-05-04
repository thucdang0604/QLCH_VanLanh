# Sub-AI MCP Usage Report — QLCH_VanLanh Taxonomy Restoration

**Session:** 2026-05-02
**Project:** m:\QLCH_VanLanh
**Task:** Khôi phục quản lý danh mục 3 tầng

---

## Tổng quan
Ghi lại các vấn đề, hạn chế, và đề xuất cải thiện khi sử dụng Sub-AI MCP server trong quá trình code dự án QLCH_VanLanh.

---

## Log sử dụng

### 1. `get_file_impact` — Phân tích ảnh hưởng file
**Thời điểm:** 10:26 AM
**Input:**
- `fileId: src/app/(customer)/category/[slug]/page.tsx`
- `fileId: src/app/admin/settings/NavigationTab.tsx`

**Kết quả:**
- `category/[slug]/page.tsx` → 0 direct, 0 transitive — LOW RISK
- `NavigationTab.tsx` → 1 direct (settings/page.tsx), 0 transitive — LOW RISK

**Vấn đề:**
- ⚠️ `page.tsx` (category route) có **0 direct impact** — nhưng thực tế grep tìm ra **16 file** reference `/category/` URL pattern. `get_file_impact` chỉ phân tích **import/export dependency** (code graph), không phân tích **string reference** (URL patterns, hardcoded paths).
- **Đề xuất:** Thêm mode `string_reference_scan` hoặc tích hợp grep-based analysis vào `get_file_impact` để phát hiện runtime dependencies (URL strings, config keys, CSS class names).

### 2. `analyze_project` — (Chưa dùng session này)
- Đã có `AI_FILE_MAP.md` từ session trước.
- Không cần re-analyze vì không thêm file mới.

---

## Đề xuất cải thiện Sub-AI

| # | Vấn đề | Mức độ | Đề xuất |
|---|--------|--------|---------|
| 1 | `get_file_impact` bỏ lỡ string references | HIGH | Thêm scan URL/path patterns trong code body, không chỉ import graph |
| 2 | Không có tool "find all files mentioning X" (semantic) | MEDIUM | Tích hợp grep vào `semantic_search_code` với mode `literal` |
| 3 | Impact analysis thiếu route-level awareness | MEDIUM | Next.js route files nên được tag đặc biệt — thay đổi route ảnh hưởng tất cả internal links |

---

| 4 | Phân tích hiệu năng tĩnh | MEDIUM | Sub-AI chưa có công cụ chạy Lighthouse Audit tự động CLI để so sánh trước và sau khi tối ưu |

### 3. Tối ưu hiệu năng Mobile (Performance Optimization)
**Thời điểm:** 2026-05-03
**Task:** Sửa lỗi load ảnh qua wsrv.nl trên production và tối ưu Core Web Vitals (TBT, CLS).

**Kết quả:**
- **Bundle JS**: Khắc phục lỗi Legacy polyfills (9.8KiB) bằng cách thêm `browserslist` explicit vào `package.json`, target modern browsers.
- **Dynamic Imports**: Chuyển `MobileBottomNav` thành `dynamic` import (`ssr: false`) để giảm ~20KiB unused JS lúc initial load trên màn desktop và deferred trên mobile.
- **Image Proxying**: Đã whitelist `https://wsrv.nl` trong thẻ `Content-Security-Policy` tại `firebase.json` giúp ảnh tải mượt mà không bị Chrome chặn lỗi CSP.
- **Animation Layout Thrashing**: Chuyển các hiệu ứng CSS trigger repaint liên tục (width, background-position) sang GPU-accelerated (`transform: translateX()`, `transform: scale()`) tránh block main thread.

**Vấn đề / Đề xuất:**
- Quá trình tuning hiệu năng rất cần Lighthouse data realtime, hiện tại Sub-AI chưa tích hợp audit tool trực tiếp như Lighthouse CLI.
- **Đề xuất:** Bổ sung tool `run_lighthouse_audit` để đo lường tự động (TBT, LCP, CLS) trực tiếp sau khi AI sửa code và so sánh before/after.

### 4. Xử lý CSP chặt chẽ với Firebase Auth & Realtime Database
**Thời điểm:** 2026-05-03
**Task:** Đảm bảo `firebase.json` Content-Security-Policy không block các iframe và WebSocket connection của Firebase Services nội bộ, sau khi áp dụng CSP chặt chẽ.

**Kết quả:**
- Thêm `wss://*.firebasedatabase.app` và `https://*.firebasedatabase.app` vào `connect-src` để hỗ trợ Realtime DB region ngoài us-central1 (asia-southeast1).
- Thêm `https://*.firebaseapp.com` vào `frame-src` và `script-src` để Google Sign-in iframe hiển thị được và không bị Cross-Origin block.
- Thêm `https://www.gstatic.com` vào `script-src` để load các script phụ trợ của Google Auth.

**Vấn đề / Đề xuất:**
- Sub-AI hiện không có cách nào cảnh báo nếu user/AI thêm policy CSP quá chặt gây side-effect cho vendor third-party scripts.
- **Đề xuất:** Xây dựng skill/tool quét CSP headers và đối chiếu với danh sách whitelist chuẩn của các dịch vụ đang dùng (như Firebase Auth, Stripe, Google Analytics...) để cảnh báo sớm.

---

*File này sẽ được cập nhật thêm khi phát sinh vấn đề mới trong quá trình code.*
