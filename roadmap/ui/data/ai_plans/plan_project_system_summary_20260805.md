# Báo cáo Tổng hợp Hệ thống & Phân tích Tái sử dụng Chức năng

## Mục tiêu

Tổng hợp toàn bộ kiến trúc, các trang đã hoàn thành, các tính năng nghiệp vụ chính và thống kê chi tiết danh sách các thành phần UI, thư viện helper, thuật toán server/client được tái sử dụng trên nhiều trang trong hệ thống Quản lý cửa hàng Vân Lạnh (QLCH_VanLanh). Đồng thời chốt danh sách các tồn đọng kỹ thuật cần tiếp tục theo dõi.

---

## 1. Trạng thái Hoàn thành các Trang & Phân hệ

### Phân hệ Quản trị (Admin Panel)
- **POS Bán hàng (`/admin/pos`)**: Giao diện workspace POS bán hàng, dịch vụ sửa chữa và thu nợ cũ; hỗ trợ máy quét mã QR/Barcode; thanh toán đa kênh (Tiền mặt, VietQR Bank, Ghi nợ `DEBT`, MoMo); tự động khớp lô kho FIFO, tính hoa hồng, ca thu ngân và doanh thu thực thu.
- **Quản lý Sửa chữa (`/admin/repairs`)**: Board quản lý phiếu sửa chữa theo trạng thái động `system_config/repairs`; gán KTV; tạm giữ & tiêu hao linh kiện; cập nhật hình ảnh/video; in phiếu bảo hành tự động theo danh mục.
- **Sản phẩm & Linh kiện (`/admin/products`, `/admin/parts`)**: Phân tách danh mục sản phẩm bán lẻ và linh kiện sửa chữa; tìm kiếm N-gram (`searchKeywords`/`searchCategoryKeywords`);Cursor Pagination 50 mục/trang; xem và in tem QR/Barcode chuẩn kích thước giấy in thực tế.
- **Quản lý Nhập kho (`/admin/inventory`, `/admin/inventory/stock`)**: Nhập hàng theo nhà cung cấp (`import_receipts`); quản lý lô kho FIFO (`inventory_lots`); toggle thanh toán ngay hoặc ghi nợ NCC; xem thống kê tồn kho thực tế vs tạm giữ.
- **Khách hàng & CRM (`/admin/customers`)**: Quản lý hồ sơ khách hàng (`customers/{id}`); tra cứu lịch sử mua hàng/sửa chữa; theo dõi công nợ `totalDebt`; thu nợ theo cơ chế FIFO qua `CustomerDetailDrawer`.
- **Nhà cung cấp (`/admin/suppliers`)**: Danh sách NCC, theo dõi công nợ NCC, trả nợ NCC (`pay-debt`) cập nhật tức thì doanh thu và chi phí qua server transaction.
- **Doanh thu & Hoa hồng (`/admin/revenue`, `/admin/commissions`)**: Báo cáo doanh thu thực thu tách biệt tiền mặt / chuyển khoản / công nợ; bảng tính hoa hồng bán hàng & KTV theo khoảng giá.
- **Voucher & Giảm giá (`/admin/vouchers`)**: Quản lý mã giảm giá; Visual Builder cho quy tắc giảm giá phụ kiện; Stacking Engine (Voucher + Tier + Exclusive).
- **Khởi tạo dữ liệu Excel (`/admin/initial-data`)**: Import hàng loạt sản phẩm, linh kiện, dịch vụ, khách hàng, NCC từ file Excel với cơ chế băm SHA-256 chống trùng ảnh O(1) và xem trước ảnh lớn.
- **Bài viết & SEO (`/admin/articles`)**: Quản lý tin tức, kinh nghiệm; tải ảnh đại diện bài viết có băm SHA-256; quản lý trạng thái xuất bản (`publishedAt`).
- **Cấu hình hệ thống (`/admin/settings`, `/admin/appearance`)**: Quản lý cây danh mục (Taxonomy Tree); mẫu in hóa đơn & bảo hành; cấu hình trang chủ (bảng giá, Google Place ID).

### Phân hệ Khách hàng (Storefront)
- **Trang chủ (`/`)**: Hero banner, danh mục nổi bật, Flash Sale, bảng giá sửa chữa dạng swipe tab, đánh giá Google Reviews (Google Places API New), Floating Speed Dial Chat (Zalo, Messenger, AI).
- **Chi tiết Sản phẩm & Dịch vụ (`/product/[id]`, `/service/[id]`)**: Gallery ảnh thumbnail, thông số kỹ thuật, selector chọn biến thể dịch vụ cùng nhóm taxonomy.
- **Tra cứu Đơn hàng (`Tracking Modal`)**: Tra cứu nhanh tiến độ đơn hàng/phiếu sửa chữa bằng SĐT hoặc Mã phiếu dạng Bottom Sheet responsive.
- **Tin tức (`/tin-tuc`, `/tin-tuc/[slug]`)**: Server-Side Rendering (SSR), canonical URL theo document ID, sitemap tự động và crawler analytics guard.

---

## 2. Thống kê Chức năng / Component được Tái sử dụng (Shared Components & Utilities)

| Thành phần / Utility | Đường dẫn File chính | Các trang / module sử dụng | Lợi ích & Chức năng |
| :--- | :--- | :--- | :--- |
| `MediaManager` | `src/components/admin/MediaManager.tsx` | `/admin/products`, `/admin/parts`, `/admin/articles`, `/admin/repairs`, `/admin/appearance`, `/admin/initial-data` | Quản lý thư viện ảnh tập trung, băm SHA-256 chống trùng ảnh O(1), tự động convert WebP. |
| `CustomerDetailDrawer` | `src/components/admin/customers/CustomerDetailDrawer.tsx` | `/admin/customers`, `/admin/pos`, `/admin/orders`, `/admin/repairs` | Xem nhanh hồ sơ khách hàng, lịch sử mua/sửa và thu nợ FIFO trực tiếp tại chỗ. |
| `UniversalProductModal` | `src/components/admin/UniversalProductModal.tsx` | `/admin/products`, `/admin/parts` | Modal tạo/sửa sản phẩm & linh kiện dùng chung, nhập nhiều ảnh, giá vốn, bảo hành, taxonomy. |
| `ProductQrLabelModal` | `src/components/admin/ProductQrLabelModal.tsx` | `/admin/products`, `/admin/parts`, `/admin/pos` | Xem trước và in tem QR/Barcode CODE128 chuẩn khổ giấy in (30x20mm, 40x20mm, 2 tem/dòng). |
| `PrintableWarranty` | `src/components/admin/PrintableWarranty.tsx` | `/admin/repairs`, `/admin/orders` | In phiếu bảo hành tự động chọn mẫu (Thiết bị, Sửa chữa, Phụ kiện) theo cây taxonomy. |
| `ExcelImportModal` | `src/components/admin/ExcelImportModal.tsx` | `/admin/initial-data`, `/admin/products`, `/admin/parts`, `/admin/customers`, `/admin/suppliers` | Modal import Excel dùng chung cho tất cả các đối tượng dữ liệu trong hệ thống. |
| `imageLoader` / `LazyImage` | `src/lib/imageLoader.ts` | Storefront & Admin thumbnails | Resize ảnh linh hoạt, chuyển đổi WebP qua CDN proxy `wsrv.nl` tối ưu tốc độ và dung lượng. |
| `CurrencyInput` | `src/components/ui/CurrencyInput.tsx` | `/admin/pos`, `/admin/inventory`, `/admin/revenue`, `/admin/suppliers`, Modals tài chính | Input định dạng tiền tệ tự động (VNĐ) chống nhầm lẫn chữ số. |
| `withApi` / `apiAuth` | `src/lib/api/handler.ts`, `src/lib/apiAuth.ts` | 62+ API Routes tại `src/app/api/*` | Bọc API thống nhất: phân quyền RBAC, đo Server-Timing, log chuẩn hóa và bắt lỗi 500 an toàn. |
| `inventoryFifo` | `src/lib/inventoryFifo.ts` | `/api/pos/checkout`, `/api/orders/transition`, `/api/inventory/import` | Thuật toán xuất kho FIFO đảm bảo chính xác giá vốn và tồn kho từng lô hàng. |
| `revenueAggregateServer` | `src/lib/revenueAggregateServer.ts` | POS checkout, thu nợ KH, trả nợ NCC, API Doanh thu | Cập nhật tổng hợp doanh thu theo kênh (Tiền mặt/Ngân hàng/Công nợ) không cần scan toàn bộ DB. |
| `serverDocumentIds` | `src/lib/serverDocumentIds.ts` | POS checkout, tạo phiếu sửa chữa, phiếu nhập kho | Phát hành mã chứng từ đọc được tuần tự (VD: `DH-...`, `SC-...`) chống va chạm đa thu ngân. |
| `idempotencyKey` | `src/lib/operationRequests.ts` | POS checkout, nhập kho, thao tác sửa chữa, thu nợ | Chống gửi trùng lặp giao dịch (Duplicate Submission Guard) khi bấm nút nhiều lần hoặc mất mạng. |
| `searchKeywords` / N-grams | `src/lib/utils.ts`, `src/lib/partCatalogQuery.ts` | `/admin/products`, `/admin/parts`, `/admin/services`, `/api/search` | Sinh mã N-gram/Bigram/Trigram phục vụ tìm kiếm server-side tốc độ cao trên Firestore. |

---

## 3. Các vấn đề Kỹ thuật / Vận hành cần tiếp tục theo dõi

1. **Deploy Pipeline CLI Warnings (`BUG-DEPLOY-007`)**: Theo dõi warning Firebase CLI Windows `node-which`/`esbuild` khi bundle `next.config.mjs` và warning Node engine của `@zxing/library`.
2. **Firestore Composite Indexes & Backfill (`plan-parts-taxonomy-search-20260729`)**: Đợi Firebase hoàn tất build composite indexes trên production và chạy script backfill N-grams (`scripts/backfill-catalog-search-index.mjs`).
3. **Article SEO Indexing Release**: Deploy bản build chính thức bài viết SEO và gửi sitemap lên Google Search Console.
4. **Live Chat Omnichannel Production Validation**: Bật Firebase Anonymous Auth trên Production Console, deploy Firestore/RTDB Rules và test tin nhắn thật trên `fixphone.vn`.
