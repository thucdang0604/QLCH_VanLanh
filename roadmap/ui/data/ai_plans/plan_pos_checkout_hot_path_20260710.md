# Tối ưu hot path POS checkout

- Ngày: 2026-07-10
- Trạng thái: completed
- Mục tiêu: giảm round-trip Firestore tuần tự và contention khi thanh toán tại `/admin/pos`, không làm yếu các invariant về tồn kho, voucher, công nợ, ca thu ngân và idempotency.

## Phạm vi

1. Ghi telemetry theo từng lần Firestore transaction callback để phân biệt callback time, retry, commit wait và từng FIFO product query.
2. Batch các document read độc lập (kể cả `operation_requests` idempotency), query FIFO song song và batch reserve ID tuần tự nhưng giữ nguyên format chứng từ; chồng FIFO read với ID reservation, phân loại legacy/FIFO để bỏ query lot rỗng sau lần checkout an toàn đầu tiên.
3. Tái dùng product/rule commission đã tải, gộp revenue delta mỗi checkout thành một update aggregate.
4. Chuyển ca thu ngân mới sang immutable movement theo idempotency key và 16 tally shard; ca cũ giữ tương thích cho tới khi đóng ca.
5. Avoid the post-checkout cashier refresh when checkout did not alter a cashier shift; load closed-shift history lazily for the Cashier tab.

## Không thay đổi

- Không đổi ID tuần tự của order, inventory log, ledger và transaction.
- Không tách stock, voucher, repair payment, debt distribution hoặc operation_requests ra khỏi transaction checkout.
- Không triển khai revenue outbox vì báo cáo hiện yêu cầu aggregate đồng bộ ngay sau thanh toán.

## Kiểm tra

- Unit test reservation batch và cashier tally idempotent.
- ESLint, TypeScript, build, Firestore indexes dry-run.
- Đo lại checkout trên một ca mới để so sánh `transactionAttemptCount`, `fifoSkippedLegacyProductIds`, `reserveIdsWait`, các phase và transaction total.
