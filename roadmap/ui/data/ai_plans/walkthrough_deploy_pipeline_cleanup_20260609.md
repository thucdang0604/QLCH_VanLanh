# Walkthrough: Firebase Deploy Pipeline Cleanup

**Kế hoạch tương ứng:** `plan_deploy_pipeline_cleanup_20260609.md`  
**Ngày hoàn thành:** 09/06/2026  
**Trạng thái:** Hoàn tất thực thi  

---

## 1. Những cải tiến đã thực hiện

### A. Chuẩn hóa Package Manager cho Cloud Build
*   **Thành quả:** Khai báo cấu hình tường minh `packageManager: pnpm@10.30.3` và `engines.node: 22` trong root `package.json`. Điều này buộc Firebase CLI và môi trường build của Cloud Functions (Cloud Build) nhận diện và cài đặt dependency bằng pnpm thay vì tự động chạy `npm ci`.
*   **Tác động:** Loại bỏ các lỗi do lệch Lockfile (`pnpm-lock.yaml` vs `package-lock.json`) và tiết kiệm thời gian cài đặt thư viện khi deploy Cloud Functions.

### B. Pin Thư viện Sharp và Khắc phục lỗi SSR
*   **Thành quả:** Đóng băng phiên bản `sharp@0.33.5` tại root `package.json` để đáp ứng ràng buộc peer dependency của `firebase-frameworks`. Dọn dẹp sạch các thư mục tạm generated của `.firebase/` và `.next/` trước khi đóng gói.
*   **Tác động:** Đảm bảo quá trình bundle SSR cho Next.js App Router chạy trên Cloud Functions diễn ra suôn sẻ, không còn bị xung đột thư viện xử lý ảnh.

### C. Giải quyết cảnh báo Esbuild & Toolchain
*   **Thành quả:** Đưa `esbuild` trực tiếp vào `devDependencies` của dự án để đảm bảo môi trường build local (đặc biệt là trên Windows) luôn có sẵn công cụ biên dịch mà không cần thông qua tiến trình cài đặt tạm thời `npx esbuild` (vốn hay bị lỗi quyền ACL trên Windows).
*   **Tác động:** Loại bỏ hoàn toàn cảnh báo `'node-which' is not recognized` và `Unable to bundle next.config.mjs` trong log deploy.

---

## 2. Kết quả kiểm chứng
*   **Deploy thành công:** Lệnh `pnpm exec firebase deploy --only hosting` hoàn tất với exit code 0.
*   **Kiểm thử Production:** Ứng dụng Next.js SSR hoạt động bình thường trên production domain, các cấu hình bảo mật header và middleware phân quyền hoạt động chính xác.
