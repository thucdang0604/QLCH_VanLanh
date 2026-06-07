# 📊 Dashboard

## Core Principles

### Inventory
<b>Double-Entry:</b> <code>stock</code> và <code>held</code> phải luôn cân bằng. Chỉ dùng <code>writeBatch</code> hoặc <code>transaction</code>.

### Images
Dùng <code>next/image</code> + <b>Custom Loader</b> (<code>imageLoader.ts</code> → proxy <code>wsrv.nl</code>). Auto WebP + resize. <code>LazyImage</code> component có sẵn nhưng chưa adopt cho storefront (chấp nhận). Admin dùng <code>&lt;img&gt;</code> thô cho dynamic uploads.

### Data Fetching
Admin: <code>useFirestore</code> (Realtime). Customer: RSC + <code>server-queries.ts</code> (SEO).

### Pagination
Admin: <code>useClientPagination</code> + <code>limit(50)</code>. KHÔNG dùng <code>onSnapshot</code> vô hạn.

### Security
Logic Checkout/Review chỉ chạy ở API Routes. API privileged phải kiểm tra permission server-side; CRM không mở cho mọi staff; PII không đưa vào URL/localStorage.

### Live Chat Integrations
Webhook phải được kiểm tra đến bước ghi/đọc <code>RTDB chats</code>; web chat dùng Firebase Anonymous Auth; CRM từ chat đi qua API <code>chat_support</code> thay vì client ghi tách rời Firestore/RTDB; secret lưu tại <code>private_config/chat_integrations</code>; token outbound dùng header; giao dịch đi qua POS/Repair hiện có.

### Package Manager
Chỉ dùng <code>pnpm</code> (v10.30.3). <b>KHÔNG</b> dùng npm/yarn/bun. Lockfile: <code>pnpm-lock.yaml</code>. Cài package: <code>pnpm add</code>, dev: <code>pnpm dev</code>, build: <code>pnpm build</code>.
Deploy Firebase Frameworks phải đọc từ root <code>packageManager: pnpm@10.30.3</code>. Nếu Cloud Build chạy <code>npm ci</code> hoặc báo lệch <code>package-lock.json</code>, kiểm tra artifact <code>.firebase/**/functions</code>, clean <code>.firebase/</code>, và giữ root <code>sharp@0.33.5</code> để thỏa peer của <code>firebase-frameworks</code>; Next vẫn dùng nested <code>sharp@0.34.x</code>. Không tạo/commit npm lockfile trong repo này.

### Firestore Transactions
<b>Read-Before-Write Strict Rule:</b> Trong mọi Transaction của Firestore (Admin SDK lẫn Client SDK), BẮT BUỘC phải thực thi toàn bộ các lệnh đọc (`tx.get`) lên đầu tiên. Tuyệt đối không gọi `tx.get` sau khi đã gọi `tx.set`, `tx.update` hoặc `tx.delete`. Việc vi phạm sẽ khiến Firestore ném lỗi chặn ngay lập tức.
<b>Timestamp in Arrays:</b> Không được dùng <code>FieldValue.serverTimestamp()</code> bên trong mảng (<code>FieldValue.arrayUnion()</code>). Thay vào đó phải dùng <code>new Date()</code> (JS native) để tránh lỗi Firestore Array Element.

### Data Matching
<b>Config Matching:</b> Khi so khớp dữ liệu từ client/database (như loại linh kiện, tên danh mục) với cấu hình hệ thống (<code>system_config</code>), luôn phải làm sạch chuỗi: <code>.trim().toLowerCase()</code> ở cả 2 phía để tránh lỗi rác khoảng trắng và sai khác chữ hoa/thường.

## Scaling Roadmap

### Customer UX Optimization
- **Status:** DONE
- **Color:** success
Tối ưu hóa giao diện khách hàng (Mobile-first), tăng trải nghiệm và độ tin cậy.

- [ ] <b>Tracking Modal:</b> Đã code popup tra cứu đơn hàng dạng Bottom Sheet trên Mobile / Desktop
- [ ] <b>Speed Dial Chat:</b> Đã code gộp Zalo, Messenger, AI Chatbot thành 1 nút FAB duy nhất gọn gàng
- [ ] <b>Pricing Table:</b> Đã code bảng giá sửa chữa thiết bị có Tab vuốt ngang mượt mà tại trang chủ
- [ ] <b>Google Reviews:</b> Đã code API lấy đánh giá tự động từ Google Maps và hiển thị kiểu Slider
- [ ] <b>Mobile Header:</b> Đã chuyển thanh tìm kiếm ra ngoài giao diện chính giúp dễ sử dụng hơn

### Live Chat Omnichannel
- **Status:** DONE
- **Color:** success
Hộp thư Web/Facebook/Zalo có profile, media, CRM và điều hướng tạo đơn nghiệp vụ.

- [ ] <b>Đã code:</b> Facebook Graph profile refresh và hiển thị avatar/tên thật
- [ ] <b>Đã code:</b> Sticker/ảnh/audio/video/file với RTDB schema và CSP Facebook CDN
- [ ] <b>Đã code:</b> Modal CRM và handoff Repair/POS không đưa tên/SDT vào URL
- [ ] <b>Đã harden:</b> Anonymous Auth cho web chat, chat_support API, CRM rules và token header
- [ ] <b>Đã sửa 26.05:</b> Lưu CRM/liên kết room qua API server; lỗi RTDB tạm thời được báo riêng sau khi lưu hồ sơ
- [ ] <b>Đã code 26.05:</b> Panel tác vụ realtime theo SDT và deep-link modal Order/Repair, có gate theo quyền module
- [ ] <b>Đã code 27.05:</b> Anh Facebook cache private + Storage deny rules + media API, nut Meta Inbox fallback va tra loi mau /shortcut
- [ ] <b>Chờ deploy:</b> Bật Anonymous Auth rồi deploy code + Firestore/RTDB Rules cùng bản
- [ ] <b>Chờ xác minh:</b> Test tin thật Facebook/Zalo và chat web ẩn danh trên <code>fixphone.vn</code>
- [ ] <b>Guardrail:</b> Không mở RTDB public, không dùng PSID làm URL profile, không ghi tắt giao dịch từ chat

### Customer CRM
- **Status:** DONE
- **Color:** success
Hệ thống quản lý khách hàng tập trung, thay thế dữ liệu phân tán trong orders/repairs/pos.

- [ ] <b>Schema:</b> Tạo collection <code>customers/{phone}</code> với profile + sub-collections
- [ ] <b>Sync Logic:</b> Server-side write vào <code>customers/</code> khi tạo order/repair/appointment
- [ ] <b>Security stage 1 đã code:</b> Không còn mở <code>customers</code> cho mọi staff; yêu cầu quyền nghiệp vụ CRM/chat
- [ ] <b>Security stage 2 pending:</b> CRM v6 field-level write với <code>manage_customers</code> và aggregate increment-only
- [ ] <b>Đã code slice:</b> Drawer tra cứu lịch sử mua hàng/sửa chữa theo SĐT, có RBAC từng module
- [ ] <b>Đã code slice:</b> Deep-link từ CRM/chat vào modal chi tiết order/repair sẵn có
- [ ] <b>Admin UI v11 pending:</b> appointments, tags, tier và migration/ledger đầy đủ

### k6 Load Testing
- **Status:** PENDING
- **Color:** #0ea5e9
Stress test <code>fixphone.vn</code> trước chiến dịch marketing.

- [ ] <b>Script:</b> Viết k6 test cho 4 endpoints chính: <code>/</code>, <code>/category/*</code>, <code>/product/*</code>, <code>/api/checkout</code>
- [ ] <b>Scenarios:</b> Normal (500 VUs), Stress (1000 VUs), Spike (2000 VUs burst)
- [ ] <b>Thresholds:</b> p95 < 2s, error rate < 1%, availability> 99.9%

### Technical Debt Cleanup
- **Status:** PENDING
- **Color:** var(--text-muted)
Dọn dẹp kỹ thuật dư thừa phát hiện trong audit.

- [ ] <b>Firestore Rules:</b> Xóa rule <code>services</code> trùng lặp (line 37 vs line 62)
- [ ] <b>LazyImage:</b> Quyết định: xóa component orphan hoặc document lý do giữ
- [ ] <b>SEO Meta:</b> Kiểm tra <code>&lt;title&gt;</code> và <code>meta description</code> trên production domain

## Changelog

### 2026-06-07 - QR/BARCODE LABEL PRINT FIT
- **Color:** accent-color
- **Summary:** Tạo nhánh tối ưu riêng cho in tem QR/barcode để tem vừa khổ giấy thực tế đang dùng.

- <b>Branch:</b> Tạo branch <code>codex/optimize-qr-barcode-label-printing</code>.
- <b>Small presets:</b> Bổ sung khổ <code>30x20 mm</code>, <code>40x20 mm</code>, <code>40x25 mm</code> và giữ các khổ cũ.
- <b>Custom size:</b> Cho phép nhập rộng/cao tem theo mm khi giấy thực tế không khớp preset.
- <b>Two-up stock:</b> Thêm bố cục <code>2 tem/dòng</code> và chỉnh <code>Khe giữa tem</code> cho giấy có hai tem nằm ngang như ảnh thực tế; khi chọn 2 tem/dòng, số nhập là số hàng nên <code>1</code> sẽ in đủ 2 tem.
- <b>Compact barcode:</b> Barcode <code>CODE128</code> mặc định dùng alias ngắn (ví dụ <code>SP-1KGMMMI0</code> → <code>1KGMMMI0</code>) để dễ scan trên tem nhỏ; POS nhận cả mã chính và alias ngắn.
- <b>Branding:</b> Mỗi tem in thêm dòng tên cửa hàng ở trên cùng, lấy từ cấu hình <code>siteName</code>, để nhận diện thương hiệu.
- <b>Content density:</b> Thêm chế độ <code>Tên ngắn</code>, <code>Chỉ mã</code>, <code>Tên + giá</code> để tem nhỏ không bị ép quá nhiều chữ.
- <b>Print fit:</b> Thêm <code>Co nội dung</code> và <code>Lề an toàn</code> để bù sai số driver/máy in khi bị cắt mép.
- <b>Guardrail:</b> QR và <code>CODE128</code> vẫn dùng chung một mã sản phẩm; không đổi schema, registry hoặc POS checkout.
- <b>Verification:</b> Focused ESLint cho <code>ProductQrLabelModal.tsx</code> pass; còn cần in thử trên đúng giấy/máy quét thực tế.

### 2026-06-05 - INITIAL EXCEL BOOTSTRAP
- **Color:** accent-color
- **Summary:** Tách công cụ khởi tạo dữ liệu ban đầu bằng Excel vào một nơi riêng cho admin.

- <b>Route riêng:</b> Thêm <code>/admin/initial-data</code> để import sản phẩm, phụ kiện, linh kiện và dịch vụ; không thêm vào sidebar admin vì chỉ dùng giai đoạn setup.
- <b>Excel template:</b> Mỗi nhóm có template riêng với danh mục taxonomy, mã hàng, giá, giá vốn, tồn kho, ảnh URL hoặc đường dẫn local, specs/bảo hành và SEO/tags dịch vụ.
- <b>Image preview:</b> Trang bootstrap có ô paste URL hoặc chọn file local để xem trước ảnh; upload qua MediaManager vẫn resize và convert WebP trước khi lưu Storage.
- <b>Local image import:</b> Nếu Excel chứa đường dẫn <code>M:\...</code>, preview bắt admin chọn file/thư mục ảnh để khớp theo tên file, upload WebP lên Storage rồi thay bằng URL Firebase trước khi mở khóa import.
- <b>Reusable gallery:</b> Sản phẩm bán lẻ, phụ kiện, linh kiện và dịch vụ dùng chung chuẩn <code>images[] + imageUrl</code>; admin chỉnh nhiều ảnh qua field dùng lại MediaManager, customer service detail hiển thị thumbnail gallery như sản phẩm.
- <b>Storage folders:</b> MediaManager mở từ gallery tự chọn thư mục upload mặc định theo ngữ cảnh: <code>products</code>, <code>parts</code>, hoặc <code>services</code>; admin vẫn có thể đổi thủ công nếu cần.
- <b>Preview gate:</b> Sau khi chọn Excel, admin phải xem bảng kiểm duyệt từng trường; import bị khóa nếu còn dòng lỗi, warning chỉ nhắc rà soát.
- <b>Duplicate guard:</b> Preview kiểm trùng tên, ID chuẩn hóa và mã QR/barcode trong file lẫn dữ liệu Firestore hiện có trước khi cho import.
- <b>Inventory integrity:</b> Sản phẩm/phụ kiện/linh kiện ghi <code>products</code>, <code>product_code_registry</code> và <code>inventory_logs</code> trong cùng transaction; dịch vụ check tồn tại trước khi tạo, không overwrite doc cũ.
- <b>Taxonomy consistency:</b> Các luồng tạo/nhập mới không còn ghi <code>categoryIds</code> giả như <code>san-pham</code> hoặc <code>component</code>; mặt hàng active phải chọn taxonomy thật.
- <b>Single entry point:</b> Gỡ nút import Excel khỏi trang sản phẩm để bootstrap chỉ nằm ở <code>/admin/initial-data</code>.
- <b>Guardrail:</b> Ảnh trong Excel dùng URL public/URL media hoặc đường dẫn local cần resolve bằng file picker; không trích ảnh nhúng binary từ workbook và không lưu đường dẫn ổ đĩa vào dữ liệu sản phẩm.

### 2026-06-07 - INITIAL EXCEL BOOTSTRAP FINALIZATION
- **Color:** success
- **Summary:** Cap nhat day du phan template Excel, tai su dung anh MediaManager va trang thai GitHub cua nhanh bootstrap.

- <b>Template workbook:</b> Mau Excel da co them cac sheet <code>Huong_dan</code>, <code>Quy_uoc_cot</code>, <code>Gia_tri_hop_le</code>, <code>Anh_va_Media</code>, <code>Taxonomy_mau</code> va <code>Vi_du_day_du</code>; sheet du lieu import van nam dau tien de importer doc dung.
- <b>Media reuse:</b> Khi admin chon file local trung base name voi anh da co trong MediaManager, vi du <code>ten-anh.png</code> voi <code>ten-anh.webp</code>, he thong dung lai URL da upload thay vi upload trung.
- <b>GitHub:</b> Branch <code>codex/initial-excel-bootstrap</code> da push len GitHub tai commit <code>ef4d4ee6</code>.

### 2026-06-05 - BUILD/LINT RECOVERY
- **Color:** success
- **Summary:** Khôi phục gate kiểm lỗi sau khi JSX bị cắt và lint quét nhầm runtime artifacts.

- <b>Deploy Package Manager:</b> Sửa nguyên nhân Firebase SSR deploy chạy `npm ci` trên generated functions bundle dù dự án dùng pnpm; root `package.json` đã khai báo `packageManager: pnpm@10.30.3`, `engines.node: 22`, `verify` chạy bằng pnpm, pin `sharp@0.33.5` cho peer của `firebase-frameworks`, artifact `.firebase/` cũ đã được clean, và `firebase deploy --only hosting` đã pass.
- <b>JSX Repair:</b> Nối lại các đoạn bị cắt trong `products/page.tsx`, `repairs/page.tsx`, và khôi phục `NavigationTab.tsx` về cấu trúc hợp lệ.
- <b>Lint Dependency:</b> Thêm `eslint-plugin-react-hooks` đúng devDependency và loại `scratch/**` khỏi phạm vi ESLint vì đây là profile Chrome runtime.
- <b>Type Hygiene:</b> Bỏ các `no-explicit-any` suppression liên quan, type rõ Product/Service detail, ProductSeries errors, Admin Reviews, POS taxonomy và warranty date shape.
- <b>Debug Guard:</b> `/api/debug/users` chuyển sang `getAdminDb()` và yêu cầu quyền `manage_staff`.
- <b>Accessibility:</b> Sửa 2 lỗi Edge Tools `axe/forms` trong `CategoriesTab.tsx`; mọi `<select>` mới phải có accessible name qua `label htmlFor/id`, `aria-label` hoặc `title` dù build vẫn pass.
- <b>Verification:</b> `pnpm lint`, `pnpm typecheck`, `pnpm build` đều pass; lint còn warnings ở utility scripts/roadmap nhưng không còn error.

### 2026-06-04 - REPAIR WARRANTY & HELD STOCK UI
- **Color:** success
- **Summary:** Sửa lỗi không sinh hạn bảo hành khi hoàn tất phiếu sửa chữa và cải thiện UI hiển thị tồn kho khả dụng cho KTV.

- <b>Warranty Stamping:</b> Đưa logic tính toán bảo hành từ config vào trực tiếp API `handover/route.ts`.
- <b>Case-Insensitive Matching:</b> Thêm logic `.trim().toLowerCase()` khi so khớp `partType` với `warrantyRules` để chống lỗi sai khác do người dùng nhập dư khoảng trắng hoặc viết thường/hoa lẫn lộn. Rớt xuống nhánh `Khác` nếu không khớp.
- <b>Transaction Rule:</b> Tuân thủ tuyệt đối quy tắc của Firestore: Gom toàn bộ lệnh ĐỌC (get) lên đầu Transaction, trước khi bắt đầu thực hiện các lệnh GHI (set/update).
- <b>Held Stock UI:</b> Thêm cột `(giữ: X)` vào bảng Quản lý linh kiện (`/admin/parts`) tương tự như bên danh sách Sản phẩm.
- <b>Available Stock Guard:</b> Sửa UI tìm kiếm linh kiện của KTV (`/admin/technician/page.tsx`), hiển thị Tồn kho khả dụng (đã trừ tạm giữ) và khóa (disable) nút Thêm ngay từ Frontend nếu số lượng khả dụng <= 0, ngăn lỗi vặt.


### 2026-06-03 - CATEGORY WARRANTY PRINTING
- **Color:** success
- **Summary:** Tích hợp cấu hình in phiếu bảo hành (Warranty Receipt) động theo cây danh mục (Category Taxonomy).

- <b>Taxonomy Schema:</b> Bổ sung <code>warrantyType</code> (<code>'none' | 'warrantyDevice' | 'warrantyRepair' | 'warrantyAccessory'</code>) vào <code>TaxonomyNode</code>.
- <b>Admin Settings:</b> Cập nhật <code>CategoryModal</code> trong Taxonomy settings để quản trị viên có thể map từng nhánh category với 1 loại phiếu bảo hành mặc định.
- <b>Print Engine:</b> Đã tạo Component <code>PrintableWarranty.tsx</code>.
- <b>Repair/Order Integration:</b> Đã hiển thị nút "In BH" tự động detect mẫu phiếu phù hợp dựa vào <code>categoryPath</code> của phiếu sửa chữa và data <code>taxonomyTree</code>.

### 2026-06-03 - GLOBAL SEARCH QR BUILD FIX
- **Color:** success
- **Summary:** Vá lỗi typecheck chặn production build trên branch <code>feature/global-search-qr</code>.

- <b>Search API:</b> Chuẩn hóa serialize Firestore snapshot để chấp nhận <code>data()</code> có thể rỗng trước khi trả kết quả order/repair QR.
- <b>Product detail:</b> Gỡ <code>no-explicit-any</code> suppression, type rõ dữ liệu product/review và bỏ tham số related không dùng.
- <b>Receipt preview:</b> Đổi ảnh QR demo sang <code>next/image</code> và khai báo host <code>api.qrserver.com</code>.
- <b>Verification:</b> <code>next build</code> pass; còn warning dependency <code>protobufjs</code> từ Firebase import trace, không phải lỗi source app.

### 2026-06-01 - HOMEPAGE CONTENT APPEARANCE CONFIG
- **Color:** accent-color
- **Summary:** Cho phép Admin tự chỉnh bảng giá sửa chữa và đánh giá khách hàng ngoài trang chủ.

- <b>Firestore config:</b> Lưu metadata hiển thị, bộ lọc bảng giá và Google Place ID trong <code>system_config/layout_settings</code>.
- <b>Admin Appearance:</b> Quản lý nhóm bảng giá, từ khóa lọc, giới hạn item và Place ID; không nhập tay giá hoặc review.
- <b>Storefront:</b> Bảng giá lấy dịch vụ active từ collection <code>services</code>; review lấy từ Google Places API và không fallback dữ liệu giả.
- <b>Guardrail:</b> Google API key giữ server-side; storefront tiếp tục nhận config server-side.

### 2026-05-30 - POS QR SCANNER & PRODUCT CODES
- **Color:** accent-color
- **Summary:** Nâng cấp POS để bán hàng bằng tem QR/mã sản phẩm.

- <b>Mã hàng:</b> Sản phẩm, phụ kiện và linh kiện có <code>sku</code>/<code>barcode</code>/<code>productCode</code> dùng chung cho QR.
- <b>Tem QR:</b> Admin Products/Parts có nút xem và in tem QR cho từng hàng.
- <b>Quét POS:</b> POS hỗ trợ máy quét dạng bàn phím, camera điện thoại qua <code>BarcodeDetector</code>, và nhập mã tay fallback.
- <b>Guardrail:</b> Scanner chỉ thêm item vào giỏ; thanh toán vẫn qua <code>/api/pos/checkout</code> để server kiểm tra tồn kho.

### 2026-05-29 - CUSTOMER UX OPTIMIZATION
- **Color:** success
- **Summary:** Tối ưu hóa trải nghiệm người dùng Front-end (Mobile-first).

- <b>Tracking Modal:</b> Thay trang tra cứu cũ bằng Modal/Bottom-sheet tiện dụng.
- <b>Speed Dial Chat:</b> Gộp 3 nút liên hệ thành 1 Floating Action Button (FAB).
- <b>Pricing Table:</b> Thêm section bảng giá sửa chữa có swipe tab trên trang chủ.
- <b>Google Reviews:</b> Bổ sung reviews từ Google Maps API vào Homepage.
- <b>Mobile Search:</b> Đưa thanh tìm kiếm ra ngoài Header trên mobile.

### 2026-05-27 - CHAT MEDIA & QUICK REPLIES
- **Color:** accent-color
- **Summary:** Tang do tin cay cua anh Facebook va thao tac ho tro nhan vien tren Live Chat.

- <b>Facebook image:</b> Tin nhan ghi RTDB truoc, anh moi cache vao Storage private va tai qua API co quyen chat.
- <b>Provider fallback:</b> Nut mo Meta Business Suite Inbox cho room Facebook, khong coi PSID la profile URL.
- <b>Productivity:</b> Cau hinh tra loi mau server-side va chen noi dung bang <code>/shortcut</code>.

### 2026-05-26 - CHAT DATA HARDENING & ROADMAP VISIBILITY
- **Color:** success
- **Summary:** Khóa các đường lộ dữ liệu trong Live Chat và đưa artifact scan lên giao diện roadmap_v2.

- <b>[P1]</b> Giới hạn <code>customers/{phone}</code> theo quyền nghiệp vụ trong Firestore Rules.
- <b>[P2]</b> Thay room <code>guest_</code> public bằng Firebase Anonymous Auth và UID-authenticated room.
- <b>[P2]</b> Bắt buộc <code>chat_support</code> cho API chat privileged; token Facebook gửi qua Authorization header.
- <b>[P2]</b> Chuyển handoff POS/Repair sang <code>sessionStorage</code> một lần, không đưa PII vào URL.
- <b>[P3]</b> Dừng lưu raw webhook event mới; hiển thị scan artifact tập trung tại mục Security Scans.
- <b>[Release gate]</b> Bật Firebase Anonymous Auth trước khi deploy RTDB rules mới.

### 2026-05-25 - LIVE CHAT OMNICHANNEL
- **Color:** accent-color
- **Summary:** Ghi nhận inbox Web/Facebook/Zalo, xử lý lỗi RTDB runtime IAM và nâng cấp profile/media/CRM/chuyển sang POS-Repair.

- Checkpoint <code>4d3c6fbd</code>: cấu hình tích hợp trên web, Facebook/Zalo webhook, outbound reply, nhãn nguồn.
- Sự cố đã xử lý: webhook nhận payload nhưng ghi RTDB timeout do runtime identity thiếu quyền; không giải quyết bằng rules public.
- Nâng cấp nhánh hiện tại: Graph profile refresh, media attachments, CSP Facebook CDN.
- Nâng cấp nhánh hiện tại: modal CRM, liên kết khách theo số điện thoại, chuyển sang Repair/POS đã prefill.
- Local verification: <code>npm.cmd run typecheck</code> và <code>npm.cmd run build</code> pass; chờ deploy production.

### 2026-05-23 - ROADMAP_V2 RESTORE
- **Color:** warning
- **Summary:** Recovered latest roadmap_v2 data after cleanup removed/staled the v2 roadmap artifacts.

- Preserved existing SPA shell files: index.html, app.js, styles.css.
- Updated manifest/dashboard/bug-details from current source verification.
- Detected open regression: scripts/migrate-active-orders.ts missing while package.json still exposes migrate:inventory.

### 2026-05-19 - PNPM MIGRATION & DEPENDENCY AUDIT
- **Color:** accent-color
- **Summary:** Chuyển đổi toàn bộ package manager từ <b>npm</b> sang <b>pnpm</b>. Thêm theo dõi dependencies vào Roadmap Dashboard.

- Xóa <code>node_modules/</code>, <code>package-lock.json</code>, <code>yarn.lock</code>
- Cài lại toàn bộ dependencies bằng <code>pnpm install</code> (34s, tiết kiệm ~60% dung lượng)
- Approve build scripts: sharp, @firebase/util, protobufjs, unrs-resolver
- Cập nhật <code>README.md</code> — chỉ còn <code>pnpm dev</code>, xóa npm/yarn/bun
- Fix ESLint: <code>articles/page.tsx</code> (no-explicit-any), <code>login/page.tsx</code> (err: unknown)
- Fix import: <code>seed-config/route.ts</code> — requireAdmin → requireAdminOrStaff
- Build thành công: <code>pnpm build</code> exit code 0
- Thêm section <b>📦 Dependencies</b> vào Dashboard (prod/dev/upgrade recommendations)

### 2026-05-18 - COMPREHENSIVE AUDIT + SCALING ROADMAP
- **Color:** primary
- **Summary:** Kiểm định toàn diện hệ thống cho 5,000 users/tháng: <b>Performance</b> (Image Loader, LCP, code-split) ✅, <b>Security</b> (RBAC, Firestore Rules, XSS, runTransaction) ✅, <b>Cost</b> (~$2.60/tháng) ✅. Thiết kế Customer CRM schema (sub-collections). Chuẩn bị k6 load test cho <code>fixphone.vn</code>. Cập nhật constraint Images → phản ánh kiến trúc Custom Loader thực tế.


### 2026-05-17 - DASHBOARD SYNC + BUG-INV-003: Hoàn thành 100%
- **Color:** purple
- **Summary:** Đối chiếu mã nguồn xác nhận tất cả bugs đã được vá. <b>BUG-INV-003</b>: Chuyển tìm kiếm linh kiện KTV từ client-side (tải toàn bộ products) sang Firestore server-side (<code>searchKeywords</code> + <code>array-contains</code>). Dashboard: 87% → 100%. <b>0 open bugs</b>.


### 2026-05-17 - BATCH 4: QUICK-WIN BUGS (8 bugs)
- **Color:** success
- **Summary:** Vá 8 lỗi: <b>BUG-INV-010</b> (KTV held check), <b>BUG-POS-007</b> (Cost price warning), <b>BUG-REP-004+008</b> (runTransaction timeline), <b>BUG-ORD-003</b> (Checkout aggregation), <b>BUG-COM-004</b> (Pro-rata discount), <b>BUG-REV-001</b> (Query window 6 tháng), <b>BUG-INV-008</b> (Confirmed resolved).

- <b>[BUG-INV-010]</b> Sửa <code>src/app/admin/technician/page.tsx</code> — Stock check trừ held: <code>available = stock - held</code>.
- <b>[BUG-POS-007]</b> Sửa <code>src/app/admin/pos/page.tsx</code> — Thêm confirm() cảnh báo khi bán dưới giá vốn.
- <b>[BUG-REP-004 + BUG-REP-008]</b> Sửa <code>src/app/admin/repairs/page.tsx</code> — handleQuickStatus chuyển sang runTransaction, đọc timeline từ Firestore.
- <b>[BUG-ORD-003]</b> Sửa <code>src/app/api/checkout/route.ts</code> — Pre-aggregate productId trước khi validate stock.
- <b>[BUG-COM-004]</b> Sửa <code>src/lib/commissionUtils.ts</code> — Phân bổ giảm giá pro-rata thay vì sequential.
- <b>[BUG-REV-001]</b> Sửa <code>src/app/admin/revenue/page.tsx</code> — Tăng query window từ 3 → 6 tháng.

### 2026-05-17 - BATCH 3: INPUT VALIDATION & FLOAT PRECISION (6 bugs)
- **Color:** success
- **Summary:** Vá 6 lỗi module: <b>BUG-COM-003</b> (Float Math.round), <b>BUG-COM-005</b> (Order payment guard), <b>BUG-POS-004</b> (POS rounding), <b>BUG-POS-005</b> (Negative price), <b>BUG-SER-001</b> (Negative service price), <b>BUG-REV-003</b> (Revenue float).

- <b>[BUG-COM-003 + BUG-COM-005]</b> Sửa <code>src/lib/commissionUtils.ts</code> — Math.round() cho 2 phép tính HH + Guard order status !== Completed.
- <b>[BUG-COM-003]</b> Sửa <code>src/app/admin/commissions/page.tsx</code> — Math.round() cho totalCommission display.
- <b>[BUG-POS-004 + BUG-POS-005]</b> Sửa <code>src/app/admin/pos/page.tsx</code> — Math.round + Math.max(0) + min="0" cho giá bán/giảm giá/cọc.
- <b>[BUG-SER-001]</b> Sửa <code>src/app/admin/services/page.tsx</code> — Math.max(0) cho giá dịch vụ gốc + khuyến mãi.

### 2026-05-17 - SECURITY BATCH 2 (5 bugs)
- **Color:** success
- **Summary:** Vá thêm 5 lỗi: <b>BUG-POS-003</b> (Held Stock), <b>HACK-SEC-002</b> (RTDB Rules), <b>HACK-SEC-003</b> (XSS), <b>BUG-POS-002</b> (Race Condition), <b>BUG-ORD-002</b> (Âm held).

- <b>[BUG-POS-003]</b> Sửa <code>src/app/admin/pos/page.tsx</code> — Thêm <code>held: increment(qty)</code> cho đơn Pending.
- <b>[HACK-SEC-003]</b> Tạo <code>src/lib/sanitizeHtml.ts</code> — Shared XSS sanitizer. Áp dụng cho <code>product/[id]/page.tsx</code>.
- <b>[HACK-SEC-002]</b> Siết <code>database.rules.json</code> — Validation text ≤500, senderType whitelist, <code>$other: false</code>.
- <b>[BUG-POS-002]</b> Xác nhận đã fix từ 12.05 (runTransaction). Cập nhật trạng thái.
- <b>[BUG-ORD-002]</b> Xác nhận đã fix từ 12.05 (Completed→Cancelled logic). Cập nhật trạng thái.

### 2026-05-17 - SECURITY BATCH 1 (2 bugs)
- **Color:** success
- **Summary:** Vá 2 lỗ hổng bảo mật nghiêm trọng: <b>HACK-SEC-001</b> (Hardcoded Secret) và <b>BUG-RBAC-001</b> (RBAC URL Bypass).

- <b>[HACK-SEC-001]</b> Xóa fallback secret trong <code>src/app/api/seed-admin/route.ts</code>. Bắt buộc dùng env var.
- <b>[BUG-RBAC-001]</b> Thêm 3 file mới: <code>src/lib/sessionCookie.ts</code>, <code>src/app/api/auth/session/route.ts</code>, <code>src/middleware.ts</code>. Sửa <code>src/lib/AuthContext.tsx</code>.

### 2026-05-12 - DASHBOARD MIGRATION
- **Color:** var(--text-muted)
- **Summary:** Chuyển đổi toàn bộ tài liệu tracking từ .md sang <b>Super Dashboard HTML</b>.

- F: <code>12.05.html</code>, <code>Plan.md</code> (deprecated), <code>BUG_REPORT.md</code> (deprecated)

### 2026-05-10 - UNIFIED INVENTORY
- **Color:** var(--text-muted)
- **Summary:** Hợp nhất quy trình nhập hàng Bán lẻ và Linh kiện vào module Parts. Gọn hóa trang Inventory.


### 2026-05-08 - GIFT REDEMPTION
- **Color:** var(--text-muted)
- **Summary:** Thay đổi nhập quà tặng từ số tiền sang chọn sản phẩm trực tiếp từ kho.
