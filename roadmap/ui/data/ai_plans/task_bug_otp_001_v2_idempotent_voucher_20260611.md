# Task Checklist: BUG-OTP-001 reCAPTCHA v2 và voucher idempotent

**Plan:** `plan_bug_otp_001_v2_idempotent_voucher_20260611.md`
**Status:** implemented-local

## P0 - Sửa lỗi khách cũ/đã nhận voucher

- [x] Tạo helper chuẩn hóa SĐT Việt Nam dùng chung server/client.
- [x] Sửa `POST /api/bounty/request-otp` thành preflight thật sự: rate-limit + kiểm tra customer/voucher status.
- [x] Cập nhật `MissionsWidget` gọi preflight trước khi gọi Firebase `signInWithPhoneNumber`.
- [x] Thêm trạng thái UI cho `already_claimed_unused`: hiển thị “SĐT này đã nhận voucher” và mã còn hiệu lực.
- [x] Thêm trạng thái UI cho `already_claimed_used`: hiển thị “SĐT này đã nhận và đã sử dụng voucher”.
- [x] Sửa `POST /api/bounty/claim` trả response typed/idempotent, không trả 500 cho trạng thái đã claim.
- [x] Dùng voucher doc id deterministic hoặc cơ chế unique tương đương để chống tạo nhiều mã cho cùng SĐT.
- [x] Update customer bằng field paths và `FieldValue.arrayUnion`, không overwrite toàn bộ `missions`.

## P0 - Đóng lỗ hổng voucher cá nhân

- [x] Sửa `POST /api/checkout` để enforce `voucherData.ownerId === normalizedPhone`.
- [x] Khi dùng personal voucher thành công, ghi `missions.bounty_redeemed`, `redeemedAt`, `redeemedOrderId`.
- [x] Đảm bảo validate API và checkout API trả cùng thông điệp khi sai SĐT.

## P1 - reCAPTCHA v2 và lỗi production `-39`

- [x] Thêm callback solved/expired/reset cho visible reCAPTCHA v2.
- [x] Map lỗi Firebase OTP sang thông báo tiếng Việt rõ ràng.
- [x] Log raw error code/message ở client và server breadcrumbs đủ để debug.
- [ ] Kiểm tra Firebase Console: Authorized domains, SMS region policy, API key Identity Toolkit/referrer, reCAPTCHA allowed domains, Toll Fraud/App Check.

## P1 - Bảo mật trạng thái client

- [x] Không lưu Firebase ID token vào `localStorage`.
- [x] Không lưu PII dài hạn trong `localStorage`; nếu cần resume, dùng session ngắn hạn hoặc server session httpOnly.
- [ ] Upsert CRM sau OTP confirm bằng server API xác thực token, chưa đánh dấu đã claim cho đến khi tạo/nhận voucher thành công.

## Verification

- [x] Test helper phone normalize.
- [x] Test `/api/bounty/request-otp` local preflight returns typed `eligible` response for valid phone.
- [ ] Test API claim mới/claim lại/voucher đã dùng/khách CRM cũ.
- [ ] Test checkout sai SĐT với personal voucher bị chặn.
- [x] Chạy `pnpm lint`.
- [x] Chạy `pnpm typecheck`.
- [x] Chạy `pnpm build`.
- [x] Browser smoke: widget and reCAPTCHA v2 render on local; direct Browser text entry blocked by missing virtual clipboard in Browser runtime, so final submit was verified through local API request/log instead.
- [ ] Smoke trên production với số test và một số thật sau khi cấu hình Console đúng.
