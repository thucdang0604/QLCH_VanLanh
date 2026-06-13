# Tasks: Customer Web QA, OTP Voucher va AI Chat - 2026-06-13

## Chat va provider
- [ ] Kiem tra billing/access cua Gemini project va API key server.
- [ ] Doi `chatWithGemini` sang ket qua co cau truc; route tra HTTP status dung.
- [ ] Bat typing indicator ngay, bo delay 30 giay.
- [ ] Them fallback chuyen nhan vien va telemetry khong chua PII.

## Navigation va taxonomy
- [ ] Sua `/category/all` hoac thay tat ca link bang route supported.
- [ ] Tao/sua route `/lien-he`.
- [ ] Sua redirect `/reviews` -> `/info/reviews`.
- [ ] Chuan hoa category canonical/alias va loai entity product/service.
- [ ] Them route smoke test cho link noi bo.

## Catalog va mobile UI
- [ ] Dong bo Flash Sale datasource.
- [ ] Sua count label bi lap.
- [ ] Sua badge gia tran ngang trang service.
- [ ] Kiem tra mobile 320/375/390/430 px.
- [ ] Sua Next Image warnings va widget loading shell.

## Reviews va OTP
- [ ] Tao Google Places key server-side phu hop; gioi han theo API.
- [ ] Loai review test khoi production.
- [ ] Thay fixture `+1 0366666666` bang so +1 dung cu phap.
- [ ] Hoan tat voucher test voi `+84 366 666 667`, OTP `123456` sau reCAPTCHA.
- [ ] Kiem tra claim lan hai tra `already_claimed`/voucher con hieu luc.

## Verification
- [x] Production build pass ngay 2026-06-13.
- [x] Browser QA route matrix tai viewport 390 x 844.
- [x] Tao chat bang `+84 366 666 667` va gui tin nhan.
- [x] Xac dinh Gemini 403 va Google Places 403 tu server log.
- [ ] Hoan tat reCAPTCHA/OTP/voucher end-to-end.
