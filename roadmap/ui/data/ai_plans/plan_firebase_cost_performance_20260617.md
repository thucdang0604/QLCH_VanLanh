# Plan: Firebase Cost & Performance Optimization

## Goal

Giam Firebase reads/writes va cai thien toc do cac man hinh chinh ma khong doi nghiep vu hien co.

## Priority Order

1. POS product lookup: khong tai toan bo `products` khi mo POS; search/scan doc theo nhu cau.
2. Admin realtime listeners: them `limit`, server pagination hoac chuyen sang `getDocs` cho cac bang khong can realtime toan collection.
3. Admin badges: thay nhieu listener collection bang count/aggregate doc.
4. Revenue analytics: doc aggregate ngay/thang thay vi query nhieu collection giao dich.
5. Public content counters: throttle/batch cac write tan suat cao nhu article views.

## Guardrails

- Giu checkout, voucher, repair handoff va scanner behavior hien co.
- Uu tien compatibility: thay query/cache truoc, khong doi schema neu chua can.
- Sau moi phase: focused ESLint, `pnpm typecheck`, `pnpm lint`, `git diff --check`.

