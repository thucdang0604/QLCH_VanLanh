# Customer Web QA

## BUG-WEB-CHAT-001: Bot tre 30 giay va che giau loi Gemini 403
- **Status:** fixed
- **Severity:** high
- **Module:** CustomerWeb
- **Files:** `src/components/ChatWidget.tsx`, `src/lib/realtimedb.ts`, `src/app/api/ai/route.ts`, `src/lib/gemini.ts`

### Symptom
Kiem thu production local ngay 2026-06-13 cho thay tin nhan duoc gui thanh cong nhung khong co trang thai dang xu ly trong 30 giay. Sau do bot chi tra cau du phong, khong tu van duoc gia va thoi gian sua chua.

### Cause
`ChatWidget` chi bat typing indicator ben trong timeout 30 giay. Gemini API dang tra `403 Forbidden: Your project has been denied access`, nhung `chatWithGemini()` bat moi exception va tra chuoi du phong nhu mot ket qua thanh cong, nen API/UI khong phan biet duoc loi nha cung cap.

### Solution
Bo khoang cho hardcode hoac chuyen thanh cau hinh ngan; hien typing indicator ngay sau khi gui; de tang AI service tra ket qua co cau truc (`ok`, `providerStatus`, `retryable`, `message`); log correlation ID phia server; UI hien thong bao minh bach va chuyen sang nhan vien khi provider loi.

### Verification
2026-06-13: Da bo delay 30 giay, typing indicator bat ngay, API tra `503` kem `providerStatus=forbidden`, `retryable=false` va correlation ID khi Gemini bi chan. Tin nhan van duoc luu, UI hien fallback chuyen nhan vien. Quyen truy cap Gemini project van la cau hinh nha cung cap, khong con bi che giau thanh ket qua thanh cong.

## BUG-WEB-REVIEWS-001: Google Reviews bi chan va link danh gia dan den 404
- **Status:** in_progress
- **Severity:** high
- **Module:** CustomerWeb
- **Files:** `src/app/api/reviews/google/route.ts`, `src/components/home/GoogleReviewsSection.tsx`, `src/components/home/FloatingReviews.tsx`

### Symptom
Google Places API tra `403 PERMISSION_DENIED: Requests from referer <empty> are blocked`. Link `Xem tat ca danh gia` tro den `/reviews` nhung bi chuyen thanh `/info/reviews` va hien trang 404. Floating review hien du lieu test `teo` / `test` tren storefront.

### Solution
Tach API key server-side cho Places API, gioi han theo API thay vi HTTP referrer; sua routing `/reviews`; loai du lieu test khoi production va them empty/error state ro rang.

### Verification
2026-06-13: `/reviews` tra 200; bo redirect sai va them route tuong thich `/info/reviews` cho browser da cache redirect 308 cu. Review test duoc loc khoi storefront; API tra `503` kem `providerStatus=provider_error` thay vi gia thanh cong. Con blocker ngoai code: key hien tai van bi Google Places tu choi `403 Requests from referer <empty> are blocked`; can tao `GOOGLE_PLACES_API_KEY` server-side va gioi han theo Places API.

## BUG-WEB-NAV-001: Dieu huong customer co link 404 va taxonomy khong nhat quan
- **Status:** fixed
- **Severity:** high
- **Module:** CustomerWeb
- **Files:** `src/components/layout/MobileBottomNav.tsx`, `src/components/layout/Footer.tsx`, `src/components/home/SuggestedSection.tsx`, `src/app/(customer)/category/[...slug]/page.tsx`

### Symptom
- Mobile nav `Danh muc` va link `Xem tat ca` tro den `/category/all`, hien 404.
- Footer `Lien he` tro den `/lien-he`, hien 404.
- `/category/sua-iphone` co 3 san pham, nhung URL canonical tren card `/category/sua-chua-dien-thoai/sua-iphone` lai hien 0 dich vu.
- Cac alias `/category/sua-laptop`, `/category/thay-pin`, `/category/ep-kinh` deu hien cung 3 san pham khong lien quan.

### Solution
Chon mot route canonical cho moi taxonomy node, tao redirect tu alias cu, bo `/category/all` neu khong duoc resolver ho tro hoac them resolver ro rang, va them route/contact page thuc su cho `/lien-he`.

### Verification
2026-06-13: Browser production local pass `/category/all`, `/lien-he`; `/category/sua-iphone` chuyen ve `/category/sua-chua-dien-thoai/sua-iphone`. Resolver alias khong con tra cung mot tap du lieu cho cac danh muc khac nhau.

## BUG-WEB-CATALOG-001: Du lieu homepage va trang danh sach mau thuan
- **Status:** fixed
- **Severity:** medium
- **Module:** CustomerWeb
- **Files:** `src/components/home/FlashSaleSection.tsx`, `src/app/(customer)/flash-sale/page.tsx`, `src/components/home/CategorySection.tsx`

### Symptom
Homepage hien 2 san pham Flash Sale nhung `/flash-sale` bao chua co san pham. Nhan danh muc bi lap hau to nhu `200+ dich vu dich vu` va `300+ san pham dich vu`.

### Solution
Dung chung mot query/selector cho homepage va trang Flash Sale; chuan hoa count label theo loai entity de khong noi chuoi `dich vu` hai lan.

### Verification
2026-06-13: Homepage va `/flash-sale` dung chung `filterFlashSaleProducts`; test selector pass. Count label khong con tu dong noi them `dich vu` vao chuoi da cau hinh.

## BUG-WEB-MOBILE-001: Trang chi tiet dich vu bi tran ngang mobile
- **Status:** fixed
- **Severity:** medium
- **Module:** CustomerWeb
- **Files:** `src/app/(customer)/service/[id]/ServiceDetailClient.tsx`

### Symptom
Tai viewport 390 px, `/service/thay-main` co `scrollWidth=430`. Badge `Tiet kiem 500.000d` nam tu x=347 den x=431 va tao cuon ngang.

### Solution
Cho cum gia/badge wrap, gioi han max-width, va kiem thu lai o 320/375/390/430 px.

### Verification
2026-06-13: Browser mobile `/service/thay-main` co `scrollWidth=375`, `clientWidth=375`; cum gia va badge wrap, khong con cuon ngang.

## BUG-WEB-OTP-TEST-001: So test +1 khong hop le truoc khi den buoc SMS region
- **Status:** fixed
- **Severity:** low
- **Module:** CustomerWeb
- **Files:** Firebase Authentication test phone configuration, `src/lib/phone.ts`, `src/components/MissionsWidget.tsx`

### Symptom
So `+1 0366666666` bi UI tu choi `So dien thoai khong hop le` truoc khi goi Firebase, do national number sau ma +1 bat dau bang 0. So nay khong the dung de kiem thu SMS region policy.

### Solution
Thay bang so test +1 dung cu phap NANP va giu OTP test co dinh. Them danh sach test case cho valid/invalid/region-blocked/idempotent voucher.

## BUG-WEB-OBS-001: Canh bao image va khoi dong widget cham
- **Status:** open
- **Severity:** low
- **Module:** CustomerWeb
- **Files:** customer image components, `src/components/ChatWidget.tsx`, `src/components/layout/MobileBottomNav.tsx`

### Symptom
Console canh bao Next Image quality 80 chua khai bao, logo thay doi mot chieu khong giu `auto`, anh LCP thieu `priority`. Chat va mobile bottom navigation xuat hien muon khoang 2-3 giay, de nguoi dung tuong tinh nang lien he khong ton tai.

### Solution
Chuan hoa image config/dimensions/LCP priority; render shell/skeleton cho contact widgets ngay lap tuc va lazy-load chi phan nang.

### Verification
2026-06-13: `images.qualities` da khai bao 60/75/80; Footer, ChatWidget va MobileBottomNav duoc render trong customer shell thay vi cho dynamic mount. Browser snapshot mobile co navigation va nut lien he ngay trong DOM ban dau; production build pass.

## QA-20260613: Trang va luong da kiem tra
- Viewport mobile: 390 x 844.
- Pass render, khong tran ngang: `/`, `/cart`, `/checkout`, `/dao-tao-hoc-vien`, cac trang `/info/*`, `/rate`, `/search`, `/tin-tuc`, bai viet chi tiet, `/tracking`, product detail.
- Da sua va Browser QA pass: `/reviews`, `/info/reviews` legacy, `/lien-he`, `/category/all`, category canonical/alias, `/flash-sale`, `/service/thay-main`, AI chat error handling.
- Con blocker ngoai code: Gemini project bi deny access; Google Places key bi chan do referrer restriction; fixture OTP +1 sai cu phap va voucher E2E can nguoi dung hoan thanh reCAPTCHA.
- Chat test da tao voi ten `Khach Test Bot`, so `+84 366 666 667`; tin nhan da gui va nhan fallback sau 30 giay.
- Voucher valid da dien san nhung con cho nguoi dung hoan thanh reCAPTCHA v2 truoc khi gui OTP `123456`.
