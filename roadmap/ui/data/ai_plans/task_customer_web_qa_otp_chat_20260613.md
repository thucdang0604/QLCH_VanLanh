# Tasks: Customer Web QA, OTP Voucher va AI Chat - 2026-06-13

## Chat va provider
- [ ] Kiem tra billing/access cua Gemini project va API key server.
- [x] Doi `chatWithGemini` sang ket qua co cau truc; route tra HTTP status dung.
- [x] Bat typing indicator ngay, bo delay 30 giay.
- [x] Them fallback chuyen nhan vien va telemetry khong chua PII.

## Navigation va taxonomy
- [x] Sua `/category/all` hoac thay tat ca link bang route supported.
- [x] Tao/sua route `/lien-he`.
- [x] Sua redirect `/reviews` -> `/info/reviews`; them legacy page cho browser da cache 308.
- [x] Chuan hoa category canonical/alias va loai entity product/service.
- [ ] Them route smoke test cho link noi bo.

## Catalog va mobile UI
- [x] Dong bo Flash Sale datasource.
- [x] Sua count label bi lap.
- [x] Sua badge gia tran ngang trang service.
- [x] Kiem tra mobile o breakpoint san pham 375 px; khong con horizontal overflow.
- [x] Khai bao Next Image qualities va render widget navigation/contact trong shell.

## Reviews va OTP
- [ ] Tao Google Places key server-side phu hop; gioi han theo API.
- [x] Loai review test khoi production.
- [ ] Thay fixture `+1 0366666666` bang so +1 dung cu phap.
- [ ] Hoan tat voucher test voi `+84 366 666 667`, OTP `123456` sau reCAPTCHA.
- [ ] Kiem tra claim lan hai tra `already_claimed`/voucher con hieu luc.

## Verification
- [x] Production build pass ngay 2026-06-13.
- [x] Browser QA route matrix tai viewport 390 x 844.
- [x] Tao chat bang `+84 366 666 667` va gui tin nhan.
- [x] Xac dinh Gemini 403 va Google Places 403 tu server log.
- [x] Unit test selector Flash Sale, review visibility, Gemini error classification va RBAC registry: 13/13 pass.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm build` pass (lint con warning, 0 error).
- [ ] Hoan tat reCAPTCHA/OTP/voucher end-to-end.
