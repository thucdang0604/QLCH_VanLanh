# Plan: Customer Web QA, OTP Voucher va AI Chat - 2026-06-13

## Muc tieu
Khac phuc theo thu tu anh huong den khach hang: chat AI khong hoat dong, link 404, taxonomy sai du lieu, voucher/OTP test, sau do moi xu ly polish mobile va performance.

## P0 - Khoi phuc chuc nang
1. Sua Gemini project/API access; khong nuot 403 thanh response thanh cong.
2. Sua `/reviews`, `/lien-he`, `/category/all` va them automated route smoke test.
3. Chuan hoa taxonomy canonical/alias de category khong tra nham entity hoac 0 ket qua.

## P1 - Nhat quan du lieu va UX
1. Dung chung datasource Flash Sale giua homepage va trang danh sach.
2. Hien typing indicator ngay; fallback co trang thai ro rang va nut chuyen nhan vien/hotline.
3. Sua Google Places server key va loc du lieu review test.
4. Sua overflow trang service va label danh muc bi lap.

## P2 - Do tin cay va observability
1. Them structured logging cho AI/Google/OTP theo correlation ID, khong log PII/OTP.
2. Them Playwright mobile smoke matrix cho route customer chinh.
3. Chuan hoa Next Image va shell loading cho widget.
4. Thay so test +1 bang fixture dung dinh dang.

## Tieu chi hoan thanh
- Tat ca link noi bo customer trong header/footer/mobile nav tra trang hop le.
- Bot tra loi that hoac hien trang thai provider loi trong duoi 5 giay; khong im lang 30 giay.
- Homepage va trang listing cung datasource cho Flash Sale/category.
- Voucher valid hoan tat bang test phone; claim lai tra thong bao da nhan voucher, khong 500/-39.
- Khong co horizontal overflow tai 320-430 px.
