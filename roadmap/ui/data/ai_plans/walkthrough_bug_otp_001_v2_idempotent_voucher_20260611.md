# Walkthrough: BUG-OTP-001 Follow-up - reCAPTCHA v2 & Voucher Idempotent

**Kế hoạch tương ứng:** `plan_bug_otp_001_v2_idempotent_voucher_20260611.md`  
**Ngày hoàn thành:** 13/06/2026  
**Trạng thái:** Hoàn tất thực thi  

---

## 1. Những cải tiến đã thực hiện

### A. Chuẩn hóa Số điện thoại (`phone.ts`)
*   **Thành quả:** Xây dựng module chuẩn hóa SĐT Việt Nam dùng chung [phone.ts](file:///m:/QLCH_VanLanh/src/lib/phone.ts). Hỗ trợ chuẩn hóa các định dạng đầu vào khác nhau (`09...`, `849...`, `+849...`) về dạng chuẩn `local` (ví dụ `0912345678`) và `e164` (ví dụ `+84912345678`).
*   **Tác động:** Đảm bảo toàn bộ hệ thống so khớp chính xác SĐT khách hàng, ngăn chặn lỗi trùng lặp do định dạng số khác nhau.

### B. Preflight Status & Rate-Limit trước khi gửi OTP
*   **Thành quả:** Nâng cấp API `/api/bounty/request-otp` thành endpoint preflight thực thụ. Trước khi client kích hoạt dịch vụ gửi SMS OTP của Firebase, UI [MissionsWidget.tsx](file:///m:/QLCH_VanLanh/src/components/MissionsWidget.tsx) sẽ gửi một yêu cầu preflight lên server để:
    1. Kiểm tra SĐT đã nhận voucher chưa (nếu đã nhận, trả trực tiếp mã voucher còn hạn, không gửi SMS OTP tốn chi phí).
    2. Áp dụng cơ chế progressive rate-limit ngăn chặn spam.

### C. Cơ chế Claim Voucher Idempotent
*   **Thành quả:** Sửa đổi API `/api/bounty/claim` thành idempotent. Nếu khách hàng claim lại hoặc gặp sự cố mất kết nối sau khi đã sinh mã, hệ thống trả về mã voucher cũ kèm trạng thái rõ ràng (`already_claimed_unused` hoặc `already_claimed_used`) thay vì ném lỗi HTTP 500 như trước.
*   **Mã định danh duy nhất:** Voucher cá nhân được lưu dưới dạng tài liệu Firestore có Document ID cố định theo dạng `vouchers/bounty_${phone}`, chặn tuyệt đối việc sinh lặp voucher cho cùng một số điện thoại.

### D. Ràng buộc Owner ID tại Checkout Server
*   **Thành quả:** Sửa đổi API `/api/checkout` để kiểm tra chặt chẽ thuộc tính `ownerId` của voucher. Server sẽ so khớp số điện thoại đặt hàng với số điện thoại nhận voucher. Nếu sai lệch, server chặn thanh toán và trả lỗi nghiệp vụ rõ ràng, ngăn chặn việc sử dụng mã voucher cá nhân của người khác.

### E. reCAPTCHA v2 và Xử lý lỗi SMS trên Production
*   **Thành quả:** Tích hợp visible reCAPTCHA v2 checkbox đầy đủ callbacks (`callback`, `expired-callback`). Bổ sung mapping chi tiết mã lỗi từ Firebase Auth (ví dụ lỗi `-39` do Identity Toolkit chặn SMS) sang thông điệp tiếng Việt dễ hiểu để hỗ trợ khách hàng liên hệ hotline kịp thời.

---

## 2. Kết quả kiểm chứng
*   **TypeScript & Lint:** Vượt qua `pnpm typecheck` và `pnpm lint` thành công.
*   **Thử nghiệm cục bộ:** Quy trình xác thực và kiểm trùng số điện thoại hoạt động chính xác. Chặn thanh toán thành công khi cố ý sử dụng voucher cá nhân của SĐT khác.
