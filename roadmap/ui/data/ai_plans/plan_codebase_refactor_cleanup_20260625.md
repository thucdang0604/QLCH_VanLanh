# Kế hoạch Khắc phục Lỗi Logic & Dọn dẹp Nợ Kỹ thuật (Codebase Refactor & Cleanup Plan)

Kế hoạch này tổng hợp toàn bộ các phát hiện về nợ kỹ thuật, tệp tin dư thừa, trùng lặp logic, và các bug ẩn tiềm ẩn lỗi hệ thống được đúc kết từ quá trình rà soát codebase chuyên sâu 279 tệp tin của dự án `QLCH_VanLanh`.

## 📌 Các Phát hiện & Vấn đề Cần giải quyết

### 1. Nhóm 1: Dọn dẹp Mã nguồn Dư thừa & Thư viện Thừa (Dead Code & Dependencies)
*   **5 file tiện ích/component mồ côi (0 direct importers):**
    - `src/lib/commissionUtils.ts` (189 dòng) - Đã có `commissionCalcServer.ts` thay thế.
    - `src/lib/warrantyUtils.ts` (59 dòng) - Đã có `repairWarrantyRules.ts` thay thế.
    - `src/lib/customerSync.ts` (61 dòng) - Đã có Server API `sync/route.ts` thay thế.
    - `src/lib/sms.ts` (39 dòng) - Cổng SpeedSMS cũ, hiện dùng Firebase Phone Auth.
    - `src/components/common/Container.tsx` (19 dòng) - Ít dùng, UI đã viết Tailwind trực tiếp.
*   **1 file API tạm thời:** `src/app/api/restore/route.ts` (9 dòng) - File rác phát sinh trong quá trình debug trước.
*   **1 file trung gian (Proxy/Wrapper):** `src/lib/permissions.ts` (11 dòng) - Chỉ re-export từ `adminModules.ts`. Cần cập nhật import ở 5 file liên quan trỏ trực tiếp đến `adminModules.ts` rồi xóa file này.
*   **1 thư viện không sử dụng:** `puppeteer-core` (v25.0.4) trong `devDependencies` của `package.json` - Hoàn toàn không được sử dụng ở bất kỳ đâu.
*   **2 Script rác không hoạt động trong `package.json`:**
    - `"graph": "node scripts/generate-graph.js"` - Tệp `scripts/generate-graph.js` không tồn tại trong dự án.
    - `"graph:serve": "node dev-tools/file-graph/serve.js"` - Thư mục `dev-tools/` không tồn tại trong dự án.
*   **1 component bị bỏ quên:** `src/components/admin/ExportImportReportButton.tsx` (95 dòng) - Viết hoàn chỉnh nhưng chưa được gán vào trang quản trị nào. Cần tích hợp vào trang `/admin/parts` để kế toán sử dụng.

### 2. Nhóm 2: Lỗi Logic & Bug ẩn Tiềm ẩn (Hidden Logic Bugs)
*   **Lỗi Trùng lặp Firebase App (`MissionsWidget.tsx`):**
    - *Vấn đề:* Khởi tạo Firebase App phụ `'bounty-otp'` trực tiếp mà không kiểm tra sự tồn tại trước đó, dễ gây lỗi `app/duplicate-app` khi người dùng F5 hoặc quay lại trang.
    - *Giải pháp:* Sửa thành check `getApps().find(app => app.name === 'bounty-otp')` trước khi khởi tạo.
*   **Xử lý So khớp Chuỗi Nghiệp vụ nhạy cảm chữ hoa/chữ thường (Case-Sensitivity):**
    - *Vấn đề:* Các logic so khớp loại phụ kiện tại POS hoặc rule hoa hồng có thể bị rớt về mặc định nếu lệch một khoảng trắng hoặc viết hoa/thường.
    - *Giải pháp:* Rà soát và áp dụng đồng bộ helper làm sạch `.trim().toLowerCase()` khi so khớp chuỗi nghiệp vụ với config.
*   **An toàn Giao dịch chống Race Condition Kho (Held Stock):**
    - *Vấn đề:* Rủi ro kiểm tra và tăng lượng tạm giữ (`held`) ngoài transaction dẫn đến Overselling.
    - *Giải pháp:* Đảm bảo 100% logic thay đổi trạng thái tồn kho tạm giữ của linh kiện sửa chữa và POS phải chạy bên trong Firestore Transaction (`runTransaction`) ở phía server.
*   **Bảo mật Render HTML Tin tức (XSS Prevention):**
    - *Vấn đề:* Sử dụng render raw HTML từ AI sinh ra hoặc bài viết qua `dangerouslySetInnerHTML`.
    - *Giải pháp:* Đảm bảo bọc qua helper `sanitizeHtml` ở tất cả các điểm hiển thị HTML động từ Firestore.
*   **Lỗi 403 Google Reviews API (HTTP Referrer Restrictions):**
    - *Vấn đề:* API Key của Google Places bị giới hạn HTTP Referrer ở production. Gọi API từ server-side Next.js mặc định thiếu referrer (<empty>), gây lỗi 403 PERMISSION_DENIED và trả về 503 cho client.
    - *Giải pháp:* Nhận request từ client, trích xuất tiêu đề `Referer` (hoặc fallback từ `Host`) và chuyển tiếp nó trong headers của `fetch` gọi tới Google API.
*   **Lỗi Firestore Document 1MB Limit khi lưu bài viết (Base64 Image Overload):**
    - *Vấn đề:* Nhân viên viết bài chuẩn SEO dán hoặc kéo thả ảnh làm phát sinh dữ liệu ảnh thô dạng Base64 nhúng thẳng vào HTML. Dung lượng bài viết nhanh chóng vượt quá giới hạn 1MB của Firestore, gây lỗi `FirebaseError: The value of property "content" is longer than 1048487 bytes` khiến không thể lưu bài.
    - *Giải pháp:* Tích hợp cơ chế tự động tiền xử lý HTML nội dung bài viết trước khi lưu. Tự động phát hiện các ảnh Base64, convert sang Blob, nén/tối ưu sang `.webp` bằng `optimizeImage`, upload lên Firebase Storage, đăng ký vào `media_library` và tự động thay thế mã Base64 bằng link URL Storage tương ứng.

### 3. Nhóm 3: Đề xuất Nâng cấp & Tối ưu (Enhancements)
*   **Admin Image Loader:** Áp dụng component `LazyImage` hoặc cấu hình custom loader nén WebP cho trang Admin để tăng tốc tải danh sách sản phẩm nặng.
*   **Google Reviews Cache:** Thiết lập cache phía server-side (ví dụ: cache header 24h hoặc lưu cache vào Firestore) cho API `/api/reviews/google` để tránh vượt hạn mức API Key của Google Places.

---

## 🛠️ Kế hoạch Triển khai Chi tiết

### Pha 1: Refactor Import & Dọn dẹp Dead Code (Surgical Clean)
1. Cập nhật import từ `@/lib/permissions` sang `@/lib/adminModules` tại 5 file:
   - `src/app/admin/layout.tsx`
   - `src/app/admin/page.tsx`
   - `src/app/admin/staff/page.tsx`
   - `src/lib/apiAuth.ts`
   - `src/middleware.ts`
2. Tiến hành xóa an toàn **8 file** dư thừa:
   - `src/lib/commissionUtils.ts`
   - `src/lib/warrantyUtils.ts`
   - `src/lib/customerSync.ts`
   - `src/lib/sms.ts`
   - `src/lib/permissions.ts`
   - `src/components/common/Container.tsx`
   - `src/app/api/restore/route.ts`
3. Gỡ bỏ hai script rác `"graph"` và `"graph:serve"` khỏi `package.json`.
4. Gỡ bỏ dependency thừa bằng lệnh: `pnpm remove puppeteer-core`.

### Pha 2: Khắc phục Lỗi Logic & Tích hợp Tính năng Bị bỏ quên
1. Sửa lỗi trùng lặp Firebase App trong `src/components/MissionsWidget.tsx`.
2. Tích hợp nút `ExportImportReportButton.tsx` vào trang quản lý linh kiện `/admin/parts`.
3. Rà soát kiểm tra tính toàn vẹn của logic Transaction trong các API cập nhật kho.

### Pha 3: Tối ưu hóa & Nâng cấp Hiệu năng
1. Thiết lập cơ chế cache 24 giờ cho API `/api/reviews/google`.
2. Áp dụng nén/lazy loading hình ảnh cho trang quản trị sản phẩm Admin.

### Pha 5 (Bổ sung): Khắc phục lỗi vận hành phát sinh trên Production
1. **Sửa lỗi 403 Google Reviews API**: Chuyển tiếp tiêu đề `Referer` từ client sang Google Places API trong [route.ts](file:///m:/QLCH_VanLanh/src/app/api/reviews/google/route.ts). Trả về `errorDetails` cụ thể khi có lỗi 503 để dễ kiểm tra.
2. **Tích hợp Tự động upload & tối ưu ảnh Base64 trong bài viết**: Cập nhật hàm `handleSave` trong [ArticleEditorModal.tsx](file:///m:/QLCH_VanLanh/src/features/articles/ArticleEditorModal.tsx). Quét nội dung HTML, trích xuất tất cả ảnh Base64, tự động tối ưu hóa nén ảnh sang `.webp` bằng `optimizeImage`, tải lên Firebase Storage dưới đường dẫn `media/articles/`, đăng ký vào thư viện ảnh `media_library`, và cập nhật link ảnh trước khi ghi vào Firestore.

---

## 🏁 Kế hoạch Xác minh (Verification)
- Chạy `pnpm lint` và `pnpm typecheck` sau mỗi pha để đảm bảo không làm gãy import hoặc phát sinh lỗi TypeScript.
- Kiểm thử chạy thử storefront và admin local để đảm bảo hệ thống hoạt động trơn tru.
- Chạy `pnpm build` để xác nhận bundle production thành công 100%.
