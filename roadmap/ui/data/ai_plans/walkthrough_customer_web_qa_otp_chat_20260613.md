# Walkthrough: Customer Web QA - 2026-06-13

## Moi truong
- Next.js production build 15.5.18, chay local port 3000.
- Browser mobile viewport 390 x 844.
- Build pass; con 2 lint warnings khong lien quan trong `src/app/admin/repairs/page.tsx`.

## Ket qua chinh
1. Chat room tao thanh cong cho `Khach Test Bot` / `+84 366 666 667`.
2. Tin nhan duoc luu, nhung UI im lang 30 giay roi tra fallback.
3. Server log xac nhan Gemini `403 Forbidden - project denied access`.
4. Google Reviews API `403 PERMISSION_DENIED` vi request server khong co referer trong khi key bi gioi han theo website.
5. Ba diem dieu huong customer tra 404: `/reviews` (bi redirect sai), `/lien-he`, `/category/all`.
6. Taxonomy alias/canonical tra ket qua mau thuan; Flash Sale homepage va listing khong dong bo.
7. `/service/thay-main` tran ngang 40 px tai mobile do badge tiet kiem.
8. So `+1 0366666666` khong dung cu phap de test SMS region.

## Du lieu test da tao
- Mot anonymous chat identity tren origin `http://localhost:3000`.
- Ten: `Khach Test Bot`.
- So dien thoai: `+84 366 666 667`.
- Tin nhan: `Shop co thay pin iPhone 15 Pro Max khong, gia va thoi gian sua bao lau?`.

## Phan con cho
Voucher modal da dien `Khach Test Voucher` / `+84 366 666 667`. Can nguoi dung tich reCAPTCHA v2, sau do tiep tuc OTP `123456` de xac minh claim va claim lai.
