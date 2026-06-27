# Báo cáo Rà soát Codebase Chuyên sâu: Code Dư thừa và Trùng lặp Logic

Tài liệu này tổng hợp kết quả rà soát **chuyên sâu** toàn bộ cấu trúc mã nguồn nghiệp vụ của dự án **QLCH_VanLanh**. Trong đợt rà soát bổ sung này, chúng tôi đã mở rộng phạm vi kiểm tra sang cấu hình thư viện (`package.json`), các file trung gian (proxy files) và các endpoint tạm thời (temporary/debug endpoints) để tìm ra các điểm tối ưu sâu nhất.

---

## I. Thống kê Tổng quan (Cập nhật)

*   **Tổng số file nghiệp vụ trong dự án:** ~281 file.
*   **Số lượng file dư thừa / lỗi thời / tạm thời:** 8 file (tăng thêm 2 file).
*   **Thư viện bên ngoài không sử dụng:** 1 dependency.
*   **Tổng số dòng code dư thừa có thể loại bỏ ngay:** ~483 dòng.
*   **Mức độ rủi ro hệ thống:** **Thấp.** Hầu hết mã nguồn dư thừa đều ở dạng mồ côi hoặc không hoạt động trực tiếp. Tuy nhiên, việc dọn dẹp sẽ giúp cải thiện tốc độ cài đặt (install time), giảm tải cho quá trình build và loại bỏ các layer trung gian không cần thiết trong kiến trúc.

---

## II. Danh sách Code Không Sử Dụng (Cập nhật Chuyên sâu)

Dưới đây là danh sách chi tiết các file hoàn toàn không được sử dụng hoặc có thể loại bỏ ngay:

### 1. File Tiện ích & Component Nghiệp vụ (0 direct importers)

| # | Đường dẫn file | Thể loại | Số dòng | Chức năng ban đầu & Lý do dư thừa |
|---|---|---|---|---|
| 1 | [commissionUtils.ts](file:///m:/QLCH_VanLanh/src/lib/commissionUtils.ts) | Tiện ích (lib) | 189 | **Tính hoa hồng phía Client:** Chứa logic tính hoa hồng. Đã bị thay thế hoàn toàn bởi phiên bản server-side chạy transaction tại [commissionCalcServer.ts](file:///m:/QLCH_VanLanh/src/lib/commissionCalcServer.ts). |
| 2 | [warrantyUtils.ts](file:///m:/QLCH_VanLanh/src/lib/warrantyUtils.ts) | Tiện ích (lib) | 59 | **Dán tem bảo hành phía Client:** Tính hạn bảo hành linh kiện. Đã bị thay thế hoàn toàn bởi phiên bản server-side tối ưu tại [repairWarrantyRules.ts](file:///m:/QLCH_VanLanh/src/lib/repairWarrantyRules.ts). |
| 3 | [customerSync.ts](file:///m:/QLCH_VanLanh/src/lib/customerSync.ts) | Tiện ích (lib) | 61 | **Đồng bộ khách hàng phía Client:** Đã được quy hoạch tập trung về Server API [sync/route.ts](file:///m:/QLCH_VanLanh/src/app/api/customers/sync/route.ts). |
| 4 | [sms.ts](file:///m:/QLCH_VanLanh/src/lib/sms.ts) | Tiện ích (lib) | 39 | **Tích hợp SpeedSMS:** Chức năng gửi OTP qua SpeedSMS. Hiện hệ thống sử dụng trực tiếp Firebase Phone Auth hoặc bảo vệ bằng JWT phân quyền cho admin, không cần dùng SpeedSMS. |
| 5 | [Container.tsx](file:///m:/QLCH_VanLanh/src/components/common/Container.tsx) | Component | 19 | **Component bao ngoài:** Căn giữa màn hình. Các trang UI đều viết trực tiếp class Tailwind vào thẻ `div` để tối giản DOM, không sử dụng component này. |
| 6 | [ExportImportReportButton.tsx](file:///m:/QLCH_VanLanh/src/components/admin/ExportImportReportButton.tsx) | Component | 95 | **Nút xuất Excel báo cáo:** Nút bấm xuất lịch sử nhập kho ra Excel sử dụng thư viện `xlsx`. Được viết hoàn chỉnh nhưng chưa từng được import hay hiển thị ở bất kỳ trang quản trị nào. |

### 2. Điểm Dư thừa về mặt Kiến trúc & File Tạm thời (Phát hiện mới)

| # | Đường dẫn file | Thể loại | Số dòng | Hiện trạng & Đánh giá chuyên sâu |
|---|---|---|---|---|
| 7 | [permissions.ts](file:///m:/QLCH_VanLanh/src/lib/permissions.ts) | Tiện ích (lib) | 11 | **File trung gian (Proxy/Wrapper):** File này thực chất chỉ chứa các lệnh `export { ... } from '@/lib/adminModules'`. Nó được giữ lại làm cầu nối trung gian tạm thời khi hệ thống chuyển dịch quyền hạn sang `adminModules.ts` nhằm tránh làm gãy import ở 5 file khác (`admin/layout`, `admin/page`, `admin/staff/page`, `lib/apiAuth`, `middleware.ts`). Ta có thể sửa import của 5 file này trỏ trực tiếp đến `adminModules.ts` và xóa bỏ file này để tối giản cấu trúc. |
| 8 | [restore/route.ts](file:///m:/QLCH_VanLanh/src/app/api/restore/route.ts) | API Route | 9 | **Endpoint tạm thời (Leftover Temp):** Chỉ trả về `{ ok: true, message: 'System is healthy' }`. Lịch sử task gần đây (`task_pos_debt_crm_fix_20260624.md`) xác nhận đây là file tạm thời được tạo ra để thử nghiệm/revert và sau đó tối ưu hóa để vượt qua linter. File này không có giá trị vận hành thực tế và nên được xóa bỏ. |

### 3. Thư viện Không Sử Dụng (package.json)

*   **`puppeteer-core` (v25.0.4):** Được khai báo trong `devDependencies` (dòng 62). Kết quả tìm kiếm toàn bộ mã nguồn xác nhận thư viện này không được import hay sử dụng ở bất kỳ file source hoặc script nào. Hoàn toàn có thể gỡ bỏ để tối ưu hóa dung lượng `pnpm-lock.yaml`.

---

## III. Phân tích Trùng lặp Logic (Duplicated Logic)

Hệ thống đang tồn tại 3 vùng trùng lặp logic nghiệp vụ lớn giữa các module Client (cũ, không dùng) và Server (mới, đang hoạt động):

### 1. Trùng lặp logic tính toán hoa hồng (Commissions)
*   **Vùng trùng lặp:** [commissionUtils.ts](file:///m:/QLCH_VanLanh/src/lib/commissionUtils.ts) và [commissionCalcServer.ts](file:///m:/QLCH_VanLanh/src/lib/commissionCalcServer.ts).
*   **Mô tả trùng lặp:** Hàm `getSafePercentage` và `safeNumber` giống nhau 100%. Thuật toán tìm kiếm quy tắc hoa hồng phù hợp nhất theo cấp bậc ưu tiên: *Sản phẩm cụ thể (Cấp 3) -> Danh mục (Cấp 2) -> Chung (Cấp 1)* (`findBestRule`) giống nhau hoàn toàn về mặt logic xử lý mảng.
*   **Đánh giá:** Bản server-side sử dụng Admin SDK chạy trong transaction của API route là phiên bản chính xác và an toàn. Bản client-side là dư thừa.

### 2. Trùng lặp logic dán tem bảo hành linh kiện (Repair Warranty)
*   **Vùng trùng lặp:** [warrantyUtils.ts](file:///m:/QLCH_VanLanh/src/lib/warrantyUtils.ts) và [repairWarrantyRules.ts](file:///m:/QLCH_VanLanh/src/lib/repairWarrantyRules.ts).
*   **Mô tả trùng lặp:** Cả hai đều thực hiện duyệt qua mảng linh kiện sửa chữa, tính toán ngày hết hạn dựa trên số tháng bảo hành (`expiresAt.setMonth(expiresAt.getMonth() + months)`) và trả về mảng linh kiện đã được cập nhật.
*   **Đánh giá:** Bản `repairWarrantyRules.ts` chứa thuật toán chuẩn hóa chuỗi tiếng Việt (`normalizeWarrantyRuleKey`) và khả năng tìm kiếm khớp tương đối tốt hơn nhiều so với bản so khớp chính xác thô sơ ở client-side. Bản client-side là dư thừa.

### 3. Trùng lặp logic đồng bộ hồ sơ khách hàng (Customer CRM Sync)
*   **Vùng trùng lặp:** [customerSync.ts](file:///m:/QLCH_VanLanh/src/lib/customerSync.ts) và [sync/route.ts](file:///m:/QLCH_VanLanh/src/app/api/customers/sync/route.ts).
*   **Mô tả trùng lặp:** Cả hai đều kiểm tra xem số điện thoại đã tồn tại trong collection `customers` chưa. Nếu chưa, tạo tài liệu mới với thông tin mặc định (tổng chi tiêu = 0, tên là "Khách lẻ"). Nếu đã tồn tại, kiểm tra xem tên mới có hợp lệ và khác "Khách lẻ" không để cập nhật.
*   **Đánh giá:** Phiên bản API route chạy transaction phía server-side là phiên bản duy nhất đang hoạt động và đảm bảo tính toàn vẹn của dữ liệu CRM. Bản client-side là dư thừa.

---

## IV. Hướng xử lý Đề xuất Nâng cao

1.  **Dọn dẹp mã nguồn triệt để (Surgical Clean):**
    *   Xóa 5 file tiện ích/component mồ côi: `commissionUtils.ts`, `warrantyUtils.ts`, `customerSync.ts`, `sms.ts`, `Container.tsx`.
    *   Xóa file API tạm thời: `src/app/api/restore/route.ts`.
2.  **Refactor loại bỏ file trung gian (`permissions.ts`):**
    *   Cập nhật import ở 5 file:
        *   `src/app/admin/layout.tsx`
        *   `src/app/admin/page.tsx`
        *   `src/app/admin/staff/page.tsx`
        *   `src/lib/apiAuth.ts`
        *   `src/middleware.ts`
    *   Thay thế import từ `@/lib/permissions` thành `@/lib/adminModules`.
    *   Xóa bỏ file `src/lib/permissions.ts`.
3.  **Gỡ bỏ dependency thừa:** Chạy lệnh `pnpm remove puppeteer-core` tại root dự án.
4.  **Tích hợp nút báo cáo:** Đưa component `ExportImportReportButton.tsx` vào trang quản lý linh kiện tại [parts/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/parts/page.tsx) để tăng giá trị nghiệp vụ, hoặc xóa bỏ nếu thực sự không dùng đến.
