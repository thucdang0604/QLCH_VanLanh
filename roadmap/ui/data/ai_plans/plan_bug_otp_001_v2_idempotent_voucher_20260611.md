# BUG-OTP-001 Follow-up Plan: reCAPTCHA v2, khách cũ và voucher idempotent

**ID:** `plan-bug-otp-001-v2-idempotent-voucher-20260611`
**Date:** 11.06.2026
**Status:** implemented-local
**Scope:** `src/components/MissionsWidget.tsx`, `src/app/api/bounty/*`, `src/app/api/vouchers/validate/route.ts`, `src/app/api/checkout/route.ts`, `customers/{phone}`, `vouchers`

## Tình trạng hiện tại

- UI đã chuyển sang reCAPTCHA v2 checkbox trong `MissionsWidget.tsx`, nhưng vẫn gọi `signInWithPhoneNumber` trực tiếp từ client.
- API `src/app/api/bounty/request-otp/route.ts` có progressive rate-limit theo IP/SĐT nhưng không được gọi trong UI, nên không bảo vệ luồng OTP thật.
- Sau khi OTP xác thực, `MissionsWidget` lưu `bounty_phone`, `bounty_name`, `bounty_token`, `bounty_code` vào `localStorage`. Điều này lệch guardrail bảo mật PII của dự án và làm trạng thái client dễ lệch với server.
- `POST /api/bounty/claim` xem `customers/{phone}.missions.bounty_claimed` là lỗi và ném exception. Catch cuối trả HTTP 500, khiến khách cũ/khách đã nhận voucher thấy lỗi hệ thống thay vì thông báo rõ ràng.
- `POST /api/bounty/claim` chỉ kiểm tra flag trên customer, chưa kiểm tra voucher hiện có theo `ownerId`, nên dữ liệu cũ có voucher nhưng thiếu flag vẫn có thể sinh mã lặp.
- `POST /api/vouchers/validate` đã kiểm tra voucher cá nhân theo SĐT, nhưng `POST /api/checkout` chưa kiểm tra `ownerId`, nên nếu biết mã cá nhân thì checkout server vẫn có thể áp dụng sai SĐT.
- Mã lỗi `-39` ở production là lỗi tầng Firebase/Identity Toolkit khi gửi SMS thật; cần phân loại riêng để không trộn với lỗi khách đã nhận voucher.

## Mục tiêu sửa

1. Khách đã có trong CRM nhưng chưa nhận bounty voucher vẫn được nhận OTP và nhận voucher bình thường.
2. SĐT đã từng nhận voucher phải nhận thông báo rõ: đã nhận voucher, kèm mã còn hiệu lực nếu còn chưa dùng; nếu đã dùng thì thông báo đã sử dụng.
3. Không trả HTTP 500 cho trạng thái nghiệp vụ đã biết như đã nhận, đã dùng, rate-limit, token hết hạn.
4. Không lưu token Firebase ID hoặc PII dài hạn trong `localStorage`.
5. Server checkout phải enforce voucher cá nhân theo SĐT giống API validate.
6. reCAPTCHA v2 có reset/expired callback và lỗi Firebase `-39` có thông báo vận hành rõ ràng.

## Thiết kế đề xuất

### 1. Chuẩn hóa phone một nguồn

- Tạo helper server/client dùng chung, ví dụ `src/lib/phone.ts`:
  - `normalizeVietnamPhone(raw): { local: string; e164: string } | null`
  - Chấp nhận `0912...`, `84912...`, `+84912...`.
  - Reject số không đúng 10-11 chữ số nội địa.
- Thay logic normalize rải rác trong `MissionsWidget`, `request-otp`, `claim`, `vouchers/validate`, `checkout`.

### 2. Thêm API trạng thái trước khi gửi OTP

- Mở rộng `POST /api/bounty/request-otp` hoặc tách `POST /api/bounty/status`.
- Input: `{ name, phone }`.
- Server đọc:
  - `customers/{normalizedPhone}`.
  - voucher bounty hiện có: ưu tiên doc deterministic `vouchers/bounty_${phone}`, fallback query `ownerId == phone`.
- Response đề xuất:
  - `eligible`: khách chưa claim, cho phép gửi OTP.
  - `already_claimed_unused`: trả `code` nếu voucher còn active và `usedCount < usageLimit`.
  - `already_claimed_used`: không gửi OTP, thông báo đã nhận và đã dùng.
  - `rate_limited`: HTTP 429 với thời gian chờ.
- `MissionsWidget` phải gọi API này trước `signInWithPhoneNumber`. Nếu đã nhận, chuyển thẳng sang step thông báo, không gọi Firebase OTP.

### 3. Claim API idempotent

- Không `throw new Error('Số điện thoại này đã nhận thưởng trước đó.')` cho luồng đã biết.
- Trong transaction, đọc trước tất cả dữ liệu cần đọc:
  - customer doc.
  - voucher doc deterministic `bounty_${phone}`.
  - `system_config/site_config`.
  - nếu cần backward compatibility, query voucher legacy theo `ownerId` trước transaction hoặc trong transaction nếu SDK hỗ trợ query get.
- Nếu đã có voucher chưa dùng: trả `200 { status: 'already_claimed_unused', code }`.
- Nếu voucher đã dùng hoặc flag customer đã redeemed: trả `409 { status: 'already_claimed_used', message }`.
- Nếu chưa có: tạo voucher bằng doc id deterministic `bounty_${phone}` hoặc lưu `missions.bountyVoucherId`, `missions.bountyVoucherCode`.
- Update customer bằng field paths:
  - `missions.bounty_claimed: true`
  - `missions.bountyVoucherCode`
  - `missions.bountyVoucherId`
  - `missions.claimedAt`
  - `tags: FieldValue.arrayUnion('bounty_otp')`
- Không overwrite toàn bộ `missions` map để tránh mất dữ liệu nhiệm vụ khác.

### 4. Lưu khách ngay sau OTP

- Sau `confirmationResult.confirm(otp)`, gọi API server đã xác thực token để upsert CRM:
  - tối thiểu lưu `phone`, `name`, `lastVisit`, `tags`.
  - chưa set `bounty_claimed` cho đến khi claim thành công.
- Tránh lưu `bounty_token` vào `localStorage`. Giữ ID token trong state ngắn hạn hoặc dùng API session httpOnly nếu cần resume.

### 5. Checkout enforce ownerId

- Trong `src/app/api/checkout/route.ts`, sau khi đọc voucher và normalize phone:
  - Nếu `voucherData.ownerId` tồn tại, bắt buộc `normalizedPhone === normalizedOwnerId`.
  - Nếu sai, throw lỗi nghiệp vụ rõ: `Voucher này là phần thưởng cá nhân. Vui lòng nhập đúng SĐT đã nhận voucher.`
- Khi voucher cá nhân được dùng thành công, cập nhật customer:
  - `missions.bounty_redeemed: true`
  - `missions.redeemedAt`
  - `missions.redeemedOrderId`

### 6. reCAPTCHA v2 và lỗi `-39`

- Giữ visible reCAPTCHA v2 checkbox.
- Thêm callback:
  - `callback`: đánh dấu captcha solved.
  - `expired-callback`: reset verifier và yêu cầu tích lại.
  - error callback nếu SDK hỗ trợ.
- Khi `signInWithPhoneNumber` lỗi:
  - `auth/captcha-check-failed`: yêu cầu tích lại reCAPTCHA.
  - `auth/too-many-requests`: báo tạm khóa do quá nhiều lần.
  - `auth/invalid-app-credential` hoặc message chứa `Error code: 39`: báo lỗi cấu hình/OTP provider đang chặn SMS thật, hướng dẫn khách thử lại sau hoặc liên hệ hotline; log chi tiết cho admin.
- Console production cần kiểm tra song song:
  - Firebase Auth Authorized domains có `fixphone.vn`.
  - SMS region policy cho phép Việt Nam.
  - API key restriction cho phép Identity Toolkit API và HTTP referrer `https://fixphone.vn/*`, `https://*.fixphone.vn/*`.
  - reCAPTCHA Enterprise allowed domains có `fixphone.vn`.
  - Toll Fraud Protection/App Check Identity Toolkit ở Audit/Unenforced khi đang test.

## Verification

- Unit/helper tests:
  - normalize `0912345678`, `84912345678`, `+84912345678` về cùng local/e164.
  - claim mới tạo voucher đúng owner.
  - claim lại trả `already_claimed_unused`, không tạo voucher mới.
  - voucher đã dùng trả `already_claimed_used`.
  - khách CRM cũ chưa claim vẫn eligible.
- API tests:
  - `/api/bounty/request-otp` trả đúng status và rate-limit.
  - `/api/bounty/claim` không trả 500 cho trạng thái đã nhận.
  - `/api/vouchers/validate` và `/api/checkout` cùng chặn sai SĐT cho personal voucher.
- Local verification:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Production smoke:
  - Test số Firebase fictional để xác nhận flow UI không regress.
  - Test một số thật trên `fixphone.vn` sau khi kiểm tra Console, ghi lại lỗi Firebase raw nếu còn `-39`.

## Implementation Notes - 11.06.2026

- Added `src/lib/phone.ts` to normalize Vietnamese phone numbers consistently (`0912...`, `84912...`, `+84912...`).
- Updated `MissionsWidget.tsx` so `/api/bounty/request-otp` preflight runs before Firebase `signInWithPhoneNumber`; previously the browser went straight to Firebase and bypassed server rate-limit/status checks.
- Removed long-lived `bounty_token`, `bounty_phone`, and `bounty_name` localStorage usage; old keys are cleared on widget mount.
- Updated `/api/bounty/request-otp` to return typed business statuses: `eligible`, `already_claimed_unused`, `already_claimed_used`.
- Updated `/api/bounty/claim` to be idempotent and to create new bounty vouchers using deterministic doc id `vouchers/bounty_{phone}` while still reading legacy `ownerId` vouchers.
- Updated checkout server to enforce personal voucher `ownerId` against the submitted phone number and mark `missions.bounty_redeemed` after successful use.
- Verification passed: `pnpm typecheck`, `pnpm lint`, `pnpm build`, phone normalize helper smoke, local `/api/bounty/request-otp` preflight response, and Browser render smoke for widget/reCAPTCHA v2.
