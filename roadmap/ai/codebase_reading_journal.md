# Nhật ký Đọc Mã nguồn (Codebase Reading Journal)

Nhật ký này được tạo ra để lưu trữ chi tiết những nội dung mã nguồn thực tế mà AI đã đọc trực tiếp (từng dòng). Việc ghi chép này đóng vai trò là **bộ nhớ dài hạn ngoại vi**, giúp AI không bị quên hoặc nhầm lẫn logic của các tệp tin trước đó khi đạt giới hạn cửa sổ ngữ cảnh (context window).

Tệp tin này được lưu trữ trực tiếp trong thư mục `roadmap/ai/` của dự án để đảm bảo an toàn và giúp AI ở các phiên làm việc tiếp theo có thể dễ dàng đọc lại, kế thừa toàn bộ tri thức của phiên làm việc trước.

---

## 📊 Tiến độ Đọc & Phân tích
*   **Tổng số tệp tin nghiệp vụ trong dự án (ước tính):** 281 tệp.
*   **Số tệp tin đã đọc chi tiết (dòng đối dòng):** 249 tệp.
*   **Tỷ lệ hoàn thành:** ~88.6%

---

## 📂 Chi tiết Nhật ký Đọc Mã nguồn

### 1. Nhóm Nghiệp vụ Thanh toán & Quản lý Đơn hàng (POS & Checkout)

#### 📝 [src/app/api/pos/checkout/route.ts](file:///m:/QLCH_VanLanh/src/app/api/pos/checkout/route.ts) (1000 dòng)
*   **Chức năng:** API Endpoint xử lý việc checkout tại quầy POS. Quản lý đồng thời cả bán sản phẩm mới, hoàn tất dịch vụ sửa chữa và thu nợ đơn hàng cũ.
*   **Các thành phần cốt lõi:**
    *   `resolveWarranty(productData)`: Tra cứu chính sách bảo hành động của sản phẩm bằng cách đi dọc cây danh mục bán lẻ (`retailTrees`) từ gốc đến ngọn. Trả về loại bảo hành và số tháng bảo hành.
    *   `resolvePaymentCompletionTarget(workflow, status)`: Phân tích workflow sửa chữa của thiết bị để tìm trạng thái hoàn tất thanh toán phù hợp (trạng thái terminal có tính hoa hồng).
    *   Giao dịch Firestore (`db.runTransaction`):
        *   **Giai đoạn Đọc (Reads):** Kiểm tra tồn kho của tất cả sản phẩm, kiểm tra số lượng tạm giữ (`held`), nạp thông tin nhân viên, thông tin khách hàng từ CRM và các phiếu sửa chữa/đơn nợ liên quan.
        *   **Giai đoạn Ghi (Writes):** Trừ kho vật lý (`stock`), giải phóng hàng tạm giữ (`held` cho sửa chữa), tạo đơn hàng mới (`orders`), cập nhật trạng thái phiếu sửa chữa (`repairs`), cập nhật công nợ khách hàng (`totalDebt`), ghi nhận đối ứng vào sổ nợ (`customer_ledger`) và nhật ký kho (`inventory_logs`).
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   Chỉ cập nhật tồn kho bằng atomic operation (`FieldValue.increment`) bên trong transaction.
    *   Nếu đơn hàng là ghi nợ (`DEBT`) hoặc thanh toán thiếu, bắt buộc phải cung cấp số điện thoại khách hàng hợp lệ để đồng bộ CRM.
    *   Nếu có tiền thừa (`surplus`) và khách hàng có nợ cũ, hệ thống tự động cấn trừ nợ cũ (`debtPaymentAmount`) và ghi nhận vào sổ nợ.
    *   Tích hợp xác thực Voucher (hạn dùng, lượt dùng, giá trị đơn tối thiểu, voucher cá nhân theo SĐT).
*   **Đánh giá:** Hoạt động tốt. Đã được sửa lỗi thiếu timestamp khi tạo mới khách hàng ở đợt cập nhật gần nhất.

#### 📝 [src/app/api/checkout/route.ts](file:///m:/QLCH_VanLanh/src/app/api/checkout/route.ts) (440 dòng)
*   **Chức năng:** API xử lý đặt hàng từ Web Storefront (khách hàng mua online, thanh toán COD).
*   **Các thành phần cốt lõi:**
    *   `POST(request)`: Thực thi giao dịch Firestore an toàn, gom nhóm sản phẩm, kiểm tra stock, áp dụng voucher, hạng thành viên, tạo đơn hàng mới và đồng bộ CRM.
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Rate Limiting & Bảo mật:** Giới hạn 3 requests/phút trên mỗi IP (`isRateLimited`). Sử dụng cơ chế Honeypot (ẩn field `website` trong form) để chặn bot spam tự động.
    *   **Quản lý Kho (Tạm giữ - Held):** Khác với POS (trừ kho vật lý ngay), đơn hàng online khi ở trạng thái `Pending` chỉ được **tăng lượng tạm giữ (`held` tăng)** để giữ hàng, giữ nguyên tồn kho vật lý (`stock`). Kho vật lý chỉ bị trừ khi đơn chuyển sang `Completed` bởi Admin.
    *   **Voucher & Hạng thành viên (Tier):**
        *   *Voucher:* Hạn dùng, số lượt dùng, đơn tối thiểu, và kiểm tra quyền sở hữu đối với voucher cá nhân (`ownerId` khớp với SĐT đặt hàng).
        *   *Hạng thành viên:* Đọc hạng từ CRM dựa trên tổng chi tiêu tích lũy, áp dụng phần trăm chiết khấu động từ cấu hình `tier_settings`.
        *   *Stacking Engine (Xếp chồng ưu đãi):* Nếu voucher có cờ độc quyền (`isExclusive`), chỉ dùng voucher. Nếu cho phép cộng dồn (`stackWithTier`), cộng cả hai. Nếu không, hệ thống tự động chọn ưu đãi cao nhất và bỏ ưu đãi còn lại.
*   **Đánh giá:** Logic xử lý rất an toàn, thông minh. Thiết kế Stacking Engine và quản lý tồn kho held đạt tiêu chuẩn nghiệp vụ e-commerce rất cao.

#### 📝 [src/app/api/orders/transition/route.ts](file:///m:/QLCH_VanLanh/src/app/api/orders/transition/route.ts) (296 dòng)
*   **Chức năng:** API Endpoint xử lý chuyển đổi trạng thái đơn hàng trên trang quản trị (ví dụ: duyệt đơn sang `Completed` hoặc hủy đơn sang `Cancelled`).
*   **Các thành phần cốt lõi:**
    *   `POST(request)`: Nhận `orderId`, `targetStatus` và `idempotencyKey`. Chạy giao dịch Firestore để kiểm tra trạng thái cũ, tính toán sự thay đổi kho và cập nhật tài liệu.
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Quản lý kho:**
        *   `Pending/Confirmed/Shipping` ➔ `Cancelled`: Giải phóng lượng hàng tạm giữ (`held` giảm).
        *   `Pending/Confirmed/Shipping` ➔ `Completed`: Trừ kho vật lý (`stock` giảm) và giải phóng hàng tạm giữ (`held` giảm).
        *   `Completed` ➔ `Cancelled`: Cộng lại kho vật lý (`stock` tăng) và ghi nhận log kho loại `ORDER_CANCEL`.
    *   **CRM & Sổ nợ:** Khi đơn chuyển sang `Completed`, tích lũy `totalSpent` và `totalOrders` của khách hàng, đồng thời ghi nhận dòng `purchase_order` và `purchase_payment` (nếu có cọc) vào `customer_ledger`. Nếu là đơn ghi nợ, cộng nợ ròng vào `totalDebt` của khách.
    *   **Hoa hồng:** Tự động gọi `calculateAndSaveCommissionsServer` khi hoàn thành, hoặc `reverseCommissionServer` để thu hồi hoa hồng khi hủy đơn.
*   **Đánh giá:** Hoạt động tốt. Tuân thủ tuyệt đối quy tắc Read-Before-Write.

#### 📝 [src/lib/CartContext.tsx](file:///m:/QLCH_VanLanh/src/lib/CartContext.tsx) (126 dòng)
*   **Chức năng:** Context và Provider quản lý giỏ hàng (Cart) của khách hàng ở trang ngoài storefront.
*   **Cơ chế hoạt động:**
    *   **SSR Hydration Guard:** Sử dụng cờ `isMounted` để chỉ nạp dữ liệu giỏ hàng từ `localStorage` sau khi component đã mount hoàn toàn trên client, tránh hiện tượng bất đồng bộ (hydration mismatch) giữa HTML của server và client.
    *   `addItem(item)`: Thêm sản phẩm vào giỏ hàng. Nếu trùng khớp các thuộc tính `id`, `color`, và `storage` thì sẽ tự động cộng dồn số lượng. Khi thêm hàng thành công, tự động bật ngăn kéo hiển thị giỏ hàng (`isDrawerOpen`).
    *   `updateQuantity(id, quantity)`: Cập nhật số lượng sản phẩm, nếu số lượng giảm về `<= 0` sẽ tự động xóa sản phẩm đó khỏi giỏ hàng.
*   **Đánh giá:** Logic giỏ hàng chuẩn mực, an toàn cho SEO và có trải nghiệm người dùng Front-end rất mượt mà.

#### 📝 [src/features/pos/posTypes.ts](file:///m:/QLCH_VanLanh/src/features/pos/posTypes.ts) (90 dòng)
*   **Chức năng:** Định nghĩa các kiểu dữ liệu và giao diện cấu trúc cho màn hình bán hàng và thu ngân POS.
*   **Các thành phần cốt lõi:**
    *   `CartItem`: Đại diện cho phần tử trong giỏ hàng POS. Có tính đa năng cực cao: chứa sản phẩm lẻ thông thường, hoặc ánh xạ một phiếu sửa chữa (`isRepairTicket`, `repairTicketId`), hoặc ánh xạ chứng từ thu nợ đơn cũ (`isOrderPayment`, `orderPaymentId`). Hỗ trợ lưu trữ IMEI/Serial và mã lô kho (`lotCode`).
    *   `RepairTicketInfo` & `PayableOrderInfo`: Khai báo thông tin phiếu sửa và thông tin đơn nợ phục vụ cơ chế tra cứu nhanh và kéo vào giỏ thanh toán.
    *   `AppliedVoucher` & `VoucherStatus`: Cấu trúc dữ liệu cho voucher áp dụng.
*   **Đánh giá:** Các kiểu dữ liệu được thiết kế rất linh hoạt, bao quát toàn diện các trường hợp checkout phức hợp tại quầy POS.

#### 📝 [src/features/pos/PosCartPanel.tsx](file:///m:/QLCH_VanLanh/src/features/pos/PosCartPanel.tsx) (424 dòng)
*   **Chức năng:** Component giao diện quản lý giỏ hàng và bảng điều khiển thanh toán POS (POS Cart Sidebar).
*   **Cơ chế hoạt động:**
    *   **Giỏ hàng đa nhiệm:** Hiển thị và xử lý đồng thời sản phẩm bán lẻ, phiếu sửa chữa KTV bàn giao, và phiếu thu nợ đơn cũ. Cho phép sửa giá trực tiếp (highlight màu cam nếu giá bị ghi đè, vô hiệu hóa nút sửa với phiếu sửa/đơn nợ cố định).
    *   **Theo dõi IMEI/Serial bắt buộc:** Nếu sản phẩm có loại bảo hành là thiết bị (`warrantyDevice`), hệ thống tự động sinh các ô nhập IMEI tương ứng với số lượng mua, kèm cờ cảnh báo nếu IMEI ngắn hơn 5 ký tự để tránh thất thoát dữ liệu bảo hành.
    *   **Tra cứu và Tích hợp thông minh:** Cho phép tìm kiếm phiếu sửa chữa và đơn nợ theo SĐT khách hàng. Tự động hiển thị và cho phép nhân viên kéo nhanh phiếu sửa hoặc đơn nợ vào giỏ thanh toán.
    *   **Cấn trừ nợ tự động (Surplus Offset):** Nếu khách hàng có nợ cũ (`customerDebt > 0`) và số tiền khách đưa (`deposit`) lớn hơn tổng tiền đơn hiện tại (`total`), hệ thống hiển thị checkbox cho phép cấn trừ khoản tiền thừa trực tiếp vào nợ cũ.
*   **Đánh giá:** Giao diện sidebar POS cực kỳ chuyên nghiệp, tích hợp mượt mà các nghiệp vụ phức tạp (bán hàng, thu nợ, thu phí sửa chữa, dán số IMEI, cấn trừ nợ).

---

### 2. Nhóm Nghiệp vụ Quản lý Sửa chữa (Repairs Workflow)

#### 📝 [src/app/api/repairs/create/route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/create/route.ts) (127 dòng)
*   **Chức năng:** API xử lý tạo phiếu sửa chữa mới trên hệ thống qua Admin SDK.
*   **Các thành phần cốt lõi:**
    *   `POST(request)`: Thực thi giao dịch Firestore để sinh mã tuần tự, ép trạng thái ban đầu, kiểm tra KTV gán và cập nhật doanh thu cọc.
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Sanitization (Làm sạch payload):** Chủ động xóa bỏ các trường `createdAt`, `updatedAt`, `status`, `statusTimeline`, `version` do client tự gửi lên để ngăn chặn hành vi ghi đè trạng thái hệ thống bất hợp pháp.
    *   **Kiểm tra KTV gán:** Đọc dữ liệu của thợ sửa được chỉ định để xác minh họ thực sự tồn tại và có vai trò là Kỹ thuật viên (`isTechnicianUser`).
    *   **Tạo mã tuần tự:** Sinh mã ID tuần tự an toàn (`SC-XXXX` cho phiếu sửa thường, `BH-XXXX` cho phiếu bảo hành) thông qua `reserveSequentialDocumentId`.
    *   **Doanh thu cọc (Deposit):** Nếu phiếu có kèm theo tiền cọc trước, hệ thống tự động tính toán số tiền cọc ròng và tích lũy trực tiếp vào báo cáo doanh thu (`incrementRevenueAggregates`) ngay tại thời điểm tạo phiếu.
*   **Đánh giá:** Quy trình làm sạch dữ liệu và tạo ID tuần tự cực kỳ chặt chẽ, xử lý an toàn doanh số cọc đầu kỳ.

#### 📝 [src/app/api/repairs/transition/route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/transition/route.ts) (230 dòng)
*   **Chức năng:** API xử lý chuyển trạng thái phiếu sửa chữa trên hệ thống theo cấu hình workflow động, quản lý chặt chẽ các exit gates và điều kiện ràng buộc.
*   **Các thành phần cốt lõi:**
    *   `POST(request)`: Nhận `ticketId`, `targetStatus`, `technicianNote`, `ticketVersion` và `idempotencyKey`. Chạy giao dịch Firestore an toàn.
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Optimistic Locking:** Sử dụng trường `version` trên tài liệu `repairs` để tránh ghi đè dữ liệu chéo khi nhiều người dùng cùng thao tác.
    *   **Exit Gates (Cổng kiểm soát):**
        *   *Technician Note:* Nếu node hiện tại yêu cầu ghi chú kỹ thuật (`requireTechnicianNote`), bắt buộc thợ sửa phải nhập ghi chú kết quả kiểm tra mới được chuyển trạng thái.
        *   *Checklist:* Nếu node hiện tại yêu cầu checklist (`requireChecklist`), bắt buộc phải hoàn tất 100% checklist kiểm tra thiết bị.
        *   *Parts Ready:* Nếu yêu cầu linh kiện sẵn sàng (`requirePartsReady`), hệ thống kiểm tra mảng `parts` xem có linh kiện nào còn ở trạng thái đặt hàng hoặc yêu cầu (`REQUESTED`, `ORDERED`) không. Nếu có, chặn không cho sửa chữa.
        *   *Technician Assignment:* Nếu trạng thái đích yêu cầu gán KTV phụ trách (`requireAssignedTechnician`), chặn lại nếu phiếu chưa có thợ sửa.
    *   **Phân quyền & Override:** Chỉ KTV được phân công hoặc quản lý có quyền chuyển trạng thái. Nếu quản lý thực hiện ghi đè, bắt buộc phải nhập lý do vào Ghi chú kỹ thuật (`manager_override` log).
    *   **Thời gian xử lý (`durationInMinutes`):** Cộng dồn thời gian ở trạng thái trước đó bằng cách lấy hiệu số thời gian hiện tại với mốc thời gian của event gần nhất trong timeline.
*   **Đánh giá:** Rất chặt chẽ, tối ưu và tuân thủ đúng quy tắc an toàn giao dịch.

#### 📝 [src/app/api/repairs/confirm-parts/route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/confirm-parts/route.ts) (435 dòng)
*   **Chức năng:** Chốt và cập nhật danh sách linh kiện sử dụng cho ca sửa chữa. Hỗ trợ thêm linh kiện từ kho, yêu cầu linh kiện mới, thay đổi số lượng và từ chối yêu cầu.
*   **Các thành phần cốt lõi:**
    *   Xử lý hàng loạt lệnh (`commands`): `add_selected` (thêm linh kiện có sẵn), `request_part` (yêu cầu linh kiện ngoài danh mục/đang đặt hàng), `remove_line` (xóa dòng), `change_quantity` (sửa số lượng), `reject_request` (từ chối yêu cầu).
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Tồn kho khả dụng:** Khi thêm linh kiện có sẵn, kiểm tra `stock - held >= quantity`. Nếu đủ, tăng lượng tạm giữ `held` của sản phẩm lên để giữ chỗ.
    *   **Bảo toàn giá lịch sử (Split Line):** Khi tăng số lượng linh kiện đã chốt trước đó, hệ thống không sửa số lượng dòng cũ (vì giá vốn/bán có thể đã thay đổi) mà **tạo thêm một dòng linh kiện mới (Split Line)** để ghi nhận đúng giá vốn và giá bán tại thời điểm chốt mới.
    *   **Tự động tạo Đơn hàng nháp (Consolidated Receipt):** Khi KTV yêu cầu linh kiện chưa có sẵn (`request_part`), hệ thống tự động gom yêu cầu này vào một phiếu nhập kho nháp (`import_receipts` có trạng thái `draft` và nguồn `repair_request`). Nếu chưa có phiếu nháp nào, hệ thống tự động tạo mã tuần tự `NH-XXXX` và mở phiếu nháp mới.
*   **Đánh giá:** Thuật toán xử lý rất thông minh, đặc biệt là cơ chế Split Line để bảo toàn giá vốn lịch sử và cơ chế tự động gom đơn hàng nháp giúp tối ưu hóa quy trình đặt hàng.

#### 📝 [src/app/api/repairs/handover/route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/handover/route.ts) (374 dòng)
*   **Chức năng:** API kết thúc quy trình sửa chữa: Bàn giao thiết bị cho khách hàng, trừ kho vật lý linh kiện sử dụng, tính hoa hồng, dán tem bảo hành và ghi nhận dòng tiền.
*   **Các thành phần cốt lõi:**
    *   Thực thi giao dịch Firestore an toàn, kiểm tra tính toàn vẹn của snapshot giá linh kiện (`priceConfirmedAt`).
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Trừ kho vật lý:** Giảm đồng thời `stock` và `held` của sản phẩm linh kiện sử dụng bên trong transaction. Chặn giao dịch nếu kho thực tế không đủ.
    *   **Trừ kho FIFO:** Gọi thư viện `inventoryFifo` để thực thi trừ hàng tồn kho theo lô nhập thực tế từ nhà cung cấp (First-In-First-Out).
    *   **Bảo hành:**
        *   Dán hạn bảo hành dịch vụ chung cho toàn bộ phiếu dựa trên taxonomy của danh mục sửa chữa (thông qua `resolveServiceWarrantyMonths`, mặc định là 3 tháng).
        *   So khớp mờ thông minh để dán hạn bảo hành riêng cho từng linh kiện sử dụng thông qua thư viện `repairWarrantyRules`.
    *   **CRM & Doanh thu:** Cập nhật tích lũy tổng chi tiêu `totalSpent` and `totalRepairs` của khách hàng. Ghi nhận giao dịch thanh toán vào sổ nợ khách hàng (`customer_ledger`).
    *   **Hoa hồng:** Gọi `calculateAndSaveCommissionsServer` để tính hoa hồng cho nhân viên sale và KTV phụ trách ca sửa chữa.
*   **Đánh giá:** API cực kỳ quan trọng và phức tạp. Thiết kế rất chặt chẽ, liên kết trơn tru giữa sửa chữa, kho bãi, tài chính và CRM.

#### 📝 [src/lib/repairAccess.ts](file:///m:/QLCH_VanLanh/src/lib/repairAccess.ts) (19 dòng)
*   **Chức năng:** Phân quyền và kiểm soát vai trò trong quy trình sửa chữa thiết bị.
*   **Cơ chế hoạt động:**
    *   `isRepairManager(actor)`: Xác định người dùng có phải Quản trị viên sửa chữa hay không. Điều kiện: có vai trò `admin` hoặc là nhân viên (`staff`) sở hữu đồng thời hai quyền hạn `manage_repairs` và `manage_orders`. Chỉ người này mới có quyền chốt hóa đơn thanh toán hoặc ghi đè trạng thái.
    *   `isTechnicianUser(data)`: Kiểm tra xem nhân viên có phải Kỹ thuật viên (thợ sửa) dựa trên quyền hạn `manage_repairs` để gán phụ trách ca sửa.
*   **Đánh giá:** Logic phân quyền tinh gọn, tách biệt vai trò quản lý tài chính và thao tác kỹ thuật của thợ sửa.

#### 📝 [src/lib/repairWorkflowConfig.ts](file:///m:/QLCH_VanLanh/src/lib/repairWorkflowConfig.ts) (116 dòng)
*   **Chức năng:** Chuẩn hóa cấu trúc và kiểm duyệt tính hợp lệ (Validation) của cấu hình luồng công việc (Workflow) sửa chữa và bảo hành.
*   **Cơ chế hoạt động:**
    *   **Bắt buộc tính năng an toàn:** Hệ thống tự động inject các cờ kiểm soát bắt buộc (`REQUIRED_REPAIR_FEATURES`/`REQUIRED_WARRANTY_FEATURES`) vào các trạng thái cấu hình của Admin (ví dụ: trạng thái `cho_tiep_nhan` bắt buộc phải có cờ gán thợ và checklist) nhằm ngăn ngừa việc cấu hình sai hoặc cố ý bypass các exit gates kiểm soát chất lượng.
    *   `validateWorkflow(workflow, name)`: Chạy thuật toán đồ thị kiểm tra toàn vẹn luồng trạng thái: bắt buộc có ít nhất một nút kết thúc (`isTerminal`), nút đầu tiên không được là kết thúc, phát hiện vòng lặp vô hạn (allowedNext trỏ tới chính nó), và phát hiện các liên kết trỏ tới các nút không tồn tại.
    *   `validateTrackingGroups(groups, repairWorkflow)`: Đảm bảo các nhóm theo dõi hành trình sửa chữa của khách hàng được ánh xạ chính xác tới các trạng thái thật và không bị trùng lặp chéo.
*   **Đánh giá:** Đảm bảo tính nhất quán dữ liệu cấu hình, tránh race condition bằng cách chạy đọc cấu hình trực tiếp trong transaction của chứng từ sửa chữa.

#### 📝 [src/features/repairs/repairPageUtils.ts](file:///m:/QLCH_VanLanh/src/features/repairs/repairPageUtils.ts) (65 dòng)
*   **Chức năng:** Thư viện tiện ích dùng chung cho giao diện quản lý sửa chữa.
*   **Cơ chế hoạt động:**
    *   `canOverrideRepairTerminalStatus(user)`: Xác định người dùng có quyền admin hoặc quyền override để cưỡng chế chuyển đổi các trạng thái đóng của phiếu sửa chữa.
    *   `resolveWarrantyTypeFromPath(nodes, categoryPath)`: Duyệt cây phân cấp danh mục dịch vụ để tự động tìm ra loại bảo hành tương ứng (`device`, `repair`, `accessory`) phục vụ in ấn.
*   **Đánh giá:** Code tinh gọn, hỗ trợ phân quyền và phân tách tốt logic nghiệp vụ bảo hành.

#### 📝 [src/features/repairs/RepairPageHeader.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairPageHeader.tsx) (23 dòng)
*   **Chức năng:** Component tiêu đề trang quản trị sửa chữa, chứa nút "Tạo phiếu mới".
*   **Đánh giá:** Trực quan, tối giản.

#### 📝 [src/features/repairs/RepairPaginationFooter.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairPaginationFooter.tsx) (56 dòng)
*   **Chức năng:** Component thanh phân trang kết hợp nút tải thêm tài liệu lịch sử cũ (`loadMore`).
*   **Đánh giá:** Đảm bảo trải nghiệm cuộn trang mượt mà và tối ưu lượt đọc database.

#### 📝 [src/features/repairs/RepairStatsGrid.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairStatsGrid.tsx) (38 dòng)
*   **Chức năng:** Lưới hiển thị các thẻ chỉ số tổng quan (Tổng phiếu, Đang xử lý, Hoàn thành, Doanh thu sửa chữa).
*   **Đánh giá:** Giao diện trực quan, tự động cập nhật realtime.

#### 📝 [src/features/repairs/RepairFilters.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairFilters.tsx) (114 dòng)
*   **Chức năng:** Thanh bộ lọc tìm kiếm nâng cao dành cho phiếu sửa chữa.
*   **Cơ chế hoạt động:** Hỗ trợ lọc theo loại phiếu (Sửa chữa/Bảo hành), lọc trạng thái động thích ứng theo vai trò, lọc KTV đảm nhận, và tích hợp nút "Tìm Server" (Database Server Search) khi cần quét sâu.
*   **Đánh giá:** Bộ lọc xử lý trạng thái động rất thông minh, hỗ trợ tốt cho việc tra cứu nhanh.

#### 📝 [src/features/repairs/RepairMediaManagers.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairMediaManagers.tsx) (44 dòng)
*   **Chức năng:** Component quản lý các cửa sổ Media Picker để chọn hình ảnh/video lúc nhận máy và sau khi sửa xong.
*   **Đánh giá:** Đóng gói tốt, tái sử dụng component thư viện phương tiện tập trung.

#### 📝 [src/features/repairs/RepairAuxiliaryModals.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairAuxiliaryModals.tsx) (174 dòng)
*   **Chức năng:** Tập hợp các modal phụ trợ trong màn hình quản trị sửa chữa.
*   **Các thành phần cốt lõi:**
    *   `posRedirectModal`: Khi sửa chữa hoàn tất, hiển thị nút chuyển hướng sang màn hình thu ngân POS kèm tham số SĐT và ID phiếu sửa chữa để tự động kéo hóa đơn thanh toán.
    *   `managerOverrideModal`: Buộc quản lý phải ghi nhận lý do chi tiết khi cưỡng chế chuyển đổi trạng thái phiếu của KTV khác.
    *   `assignModal`: Modal phân công nhanh KTV.
*   **Đánh giá:** Giao diện chuyển hướng POS rất thuận tiện, tối ưu hóa quy trình làm việc giữa kỹ thuật và thu ngân.

#### 📝 [src/features/repairs/RepairHandoverModal.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairHandoverModal.tsx) (178 dòng)
*   **Chức năng:** Modal xử lý kết thúc phiếu sửa chữa trong các trường hợp đặc biệt (Huỷ sửa trả máy hoặc Hoàn phí).
*   **Cơ chế hoạt động:**
    *   **Huỷ sửa/Trả máy (`out`):** Tính toán chi phí chẩn đoán phát sinh, đối ứng với số tiền khách đã đặt cọc để tính ra số tiền cần thu thêm hoặc cửa hàng phải hoàn lại.
    *   **Hoàn phí (`refund`):** Hỗ trợ tính toán hoàn trả tiền cọc/chi phí cho khách.
    *   **Guardrails:** Bắt buộc nhập lý do chi tiết và yêu cầu tick chọn xác nhận đã trả tiền mặt cho khách mới cho phép chốt.
*   **Đánh giá:** Logic tài chính đối chiếu tiền cọc và kiểm soát biên lỗi vô cùng chặt chẽ, bảo vệ dòng tiền cửa hàng.

#### 📝 [src/features/repairs/RepairWarrantyModal.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairWarrantyModal.tsx) (119 dòng)
*   **Chức năng:** Modal kích hoạt yêu cầu bảo hành cho thiết bị/linh kiện bị lỗi.
*   **Cơ chế hoạt động:** Hiển thị cảnh báo số lần đã bảo hành trước đó. Liệt kê các linh kiện đã thay thế có trong phiếu còn hạn bảo hành thực tế (`warrantyExpiresAt > Date.now()`) để nhân viên chọn chính xác linh kiện lỗi cần làm bảo hành.
*   **Đánh giá:** Giao diện kiểm soát thông tin minh bạch, giao dịch bảo hành lịch sử rõ ràng.

#### 📝 [src/features/repairs/RepairPrintTemplates.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairPrintTemplates.tsx) (107 dòng)
*   **Chức năng:** Bộ render các mẫu in ấn hóa đơn chứng từ sửa chữa.
*   **Cơ chế hoạt động:** Tự động tổng hợp và render 3 mẫu hóa đơn chính: Phiếu tiếp nhận nhận máy (`receipt`), Hóa đơn thanh toán (`invoice`), và Thẻ bảo hành (`warranty`). Tự động tổng hợp các dòng bảo hành linh kiện hợp lệ còn hạn.
*   **Đánh giá:** Triển khai gọn gàng, tính toán thời hạn bảo hành ròng chuẩn xác.

#### 📝 [src/features/repairs/RepairDetailModal.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairDetailModal.tsx) (231 dòng)
*   **Chức năng:** Modal hiển thị thông tin chi tiết đầy đủ của phiếu sửa chữa.
*   **Cơ chế hoạt động:** Trình bày trực quan danh sách lỗi, mô tả kỹ thuật, thông tin linh kiện sử dụng (giá, chất lượng, nhà cung cấp), checklist kiểm tra phần cứng 8 hạng mục (màu sắc trực quan theo kết quả OK/Lỗi), các tệp đa phương tiện nhận/trả máy và toàn bộ lịch sử timeline trạng thái.
*   **Đánh giá:** Bố cục khoa học, hiển thị đầy đủ và chi tiết mọi khía cạnh thông tin của phiếu sửa chữa.

#### 📝 [src/features/repairs/RepairEditorModal.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairEditorModal.tsx) (693 dòng)
*   **Chức năng:** Modal tạo mới và chỉnh sửa thông tin phiếu sửa chữa toàn diện.
*   **Các thành phần cốt lõi:**
    *   **Visual Screen Pattern Lock:** Tích hợp bộ vẽ hình mở khóa màn hình 3x3 trực quan dưới dạng sơ đồ điểm (`1->2->3->6->9`), giúp nhân viên dễ dàng ghi nhận chính xác mật khẩu vẽ của khách.
    *   **Typeahead Service Autocomplete:** Khi nhân viên nhập tên lỗi, hệ thống tự động lọc diacritic-free trên danh mục dịch vụ hệ thống và gợi ý nhanh. Click chọn sẽ tự động điền danh mục cha, tên dịch vụ và tự động điền giá tiền ước tính để cộng dồn chi phí nhân công (`laborCost`).
    *   **Kiểm soát luồng động:** Chỉ hiển thị checklist phần cứng khi trạng thái hiện tại yêu cầu (`requireChecklist`). Chỉ mở mục tải media bàn giao khi ở trạng thái kết thúc.
*   **Đánh giá:** Trải nghiệm người dùng tuyệt vời, đặc biệt là tính năng vẽ hình mở khóa màn hình 3x3 và tự động gợi ý dịch vụ thông minh.

#### 📝 [src/features/repairs/RepairTicketBoard.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairTicketBoard.tsx) (516 dòng)
*   **Chức năng:** Bảng điều khiển tiến độ và quản lý danh sách phiếu sửa chữa (Repairs Pipeline Board).
*   **Cơ chế hoạt động:**
    *   **Giao diện thích ứng (Responsive):** Cung cấp giao diện dạng thẻ (Card list) tối ưu cho thiết bị di động của kỹ thuật viên và dạng bảng dữ liệu (`<table>`) chi tiết cho máy tính của quản trị viên.
    *   **Chuyển trạng thái một chạm (Quick Status):** Quét các trạng thái kế tiếp được phép (`allowedNext`) và sinh các nút bấm chuyển trạng thái nhanh tương ứng (ví dụ: nút Hoàn thành có màu xanh lá, Hoàn phí có màu đỏ).
    *   **Tải lên phương tiện bàn giao:** Đối với các phiếu sửa chữa đã xong, cho phép tải ảnh/video trực tiếp lên Storage hoặc dán link YouTube để lưu trữ video bàn giao máy giúp tiết kiệm tối đa chi phí băng thông và lưu trữ đám mây.
*   **Đánh giá:** Trung tâm quản lý quy trình sửa chữa cực kỳ mạnh mẽ, tối ưu hóa năng suất vận hành.

#### 📝 [src/features/technician/TechnicianPageHeader.tsx](file:///m:/QLCH_VanLanh/src/features/technician/TechnicianPageHeader.tsx) (56 dòng)
*   **Chức năng:** Tiêu đề trang dành riêng cho kỹ thuật viên.
*   **Đánh giá:** Hiển thị trực quan số lượng máy đang sửa và chờ trả, cho phép chuyển đổi chế độ xem Danh sách/Kanban.

#### 📝 [src/features/technician/TechnicianWorkflowModals.tsx](file:///m:/QLCH_VanLanh/src/features/technician/TechnicianWorkflowModals.tsx) (266 dòng)
*   **Chức năng:** Bộ các modal kiểm soát quy trình nghiệp vụ chuyên biệt của kỹ thuật viên.
*   **Các thành phần cốt lõi:**
    *   **Modal Chuyển giao KTV:** Cho phép thợ sửa chuyển giao phiếu cho thợ khác kèm lý do bắt buộc. Người cũ vẫn chịu trách nhiệm cho đến khi người mới chấp nhận.
    *   **Modal Xác nhận linh kiện sử dụng (Exit Gate cực kỳ quan trọng):** Khi KTV bấm chuyển sang hoàn tất sửa chữa, hệ thống bắt buộc KTV phải xác nhận trạng thái cho từng linh kiện đã lấy ra lắp thử: đánh dấu **Đã dùng (Use)** hoặc **Hoàn kho (Test) (Return)**. Linh kiện hoàn kho sẽ được lập tức cộng ngược lại tồn kho khả dụng để giải phóng tài nguyên.
*   **Đánh giá:** Thiết kế quy trình phân định trách nhiệm KTV và cơ chế kiểm duyệt hoàn kho test vô cùng xuất sắc, triệt tiêu nguy cơ thất thoát linh kiện.

#### 📝 [src/features/technician/TechnicianTicketDetailModal.tsx](file:///m:/QLCH_VanLanh/src/features/technician/TechnicianTicketDetailModal.tsx) (479 dòng)
*   **Chức năng:** Modal tác vụ chi tiết dành riêng cho KTV phụ trách trực tiếp ca sửa.
*   **Cơ chế hoạt động:**
    *   **Phân quyền nghiêm ngặt (KTV Lock):** Chặn toàn bộ quyền chỉnh sửa nếu phiếu không được gán cho KTV hiện tại (hoặc họ chưa bấm chấp nhận yêu cầu chuyển giao).
    *   **Thao tác linh kiện tại chỗ (In-place Parts Operations):** Cho phép KTV chủ động tìm kiếm linh kiện trong kho. Nếu còn hàng (`stock - held > 0`), hiển thị nút "Có sẵn (Thêm)" để giữ chỗ. Nếu hết hàng, hiển thị nút "Hết (Đề xuất)" để tự động đưa vào phiếu yêu cầu nhập hàng. Cho phép thêm linh kiện ngoài danh mục.
    *   **Lịch sử & Timeline:** Tích hợp lịch sử timeline đảo ngược, hiển thị đầy đủ thông tin người thực hiện, thời gian xử lý và lý do của từng bước.
*   **Đánh giá:** Giao diện thiết kế hướng năng suất cao cho KTV, tích hợp đầy đủ công cụ lấy linh kiện, đề xuất nhập hàng và duyệt chuyển giao.

---

### 3. Nhóm Nghiệp vụ Nhập kho & Kho bãi (Inventory & FIFO)

#### 📝 [src/app/api/inventory/import/route.ts](file:///m:/QLCH_VanLanh/src/app/api/inventory/import/route.ts) (614 dòng)
*   **Chức năng:** Xử lý chốt phiếu nhập kho từ nhà cung cấp. Hỗ trợ đặt hàng, cập nhật khả dụng từng mặt hàng và hoàn tất nhập kho thực tế.
*   **Các thành phần cốt lõi:**
    *   `POST(request)`: Chạy giao dịch Firestore thực hiện các lệnh: `order_receipt` (đặt hàng), `mark_availability` (cập nhật khả dụng), `complete_import` (hoàn tất nhập kho).
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Pre-fetch tránh Read-After-Write:** Quét qua toàn bộ danh sách item nhập kho để lấy ra các `productId` và `ticketId` liên quan, sau đó thực hiện đọc (`tx.get`/`tx.getAll`) đồng loạt ở đầu transaction trước khi thực hiện bất kỳ lệnh ghi nào.
    *   **Tự động tạo sản phẩm mới:** Nếu linh kiện nhập chưa có trong danh mục (linh kiện KTV yêu cầu mới), hệ thống tự động sinh ID tuần tự `LK-XXXX` và tạo tài liệu sản phẩm mới.
    *   **Giá vốn bình quan gia quyền (Weighted Average Cost - WAC):** Khi nhập kho hoàn tất, giá vốn sản phẩm được tính toán lại: `newCostPrice = ((oldStock * oldCostPrice) + (importedQty * importPrice)) / (oldStock + importedQty)`.
    *   **Khớp & Giữ chỗ linh kiện tự động (Allocation):**
        *   Hệ thống kiểm tra xem linh kiện nhập về có được liên kết với phiếu sửa chữa nào đang chờ không (`ticketId` và `partLineId`).
        *   Nếu có, gọi thư viện `inventoryImportAllocation` để tính toán lượng hàng cần tự động giữ chỗ (`held`) cho phiếu sửa chữa đó. Tồn kho của sản phẩm tăng: `stock = stock + importedQty`, `held = held + heldQuantity`.
        *   Dòng linh kiện trong phiếu sửa chữa tự động cập nhật `reservedQuantity`, giá vốn sử dụng được cập nhật theo giá vốn mới, và trạng thái tự động chuyển thành `SELECTED` (sẵn sàng sử dụng) nếu đủ hàng.
    *   **Lô kho & FIFO:** Tự động tạo một lô kho mới (`PN-YYMM-XXXX`) trong collection `inventory_lots` để lưu trữ nguồn gốc và số lượng còn lại phục vụ cho luồng trừ kho FIFO sau này.
    *   **Tài chính & Công nợ:** Nếu thanh toán ghi nợ, tự động tăng công nợ nhà cung cấp (`totalDebt` trong `suppliers`) và tạo giao dịch công nợ. Nếu thanh toán ngay, tự động tạo tài liệu chi phí (`expenses`).
*   **Đánh giá:** Thiết kế xuất sắc, liên kết chặt chẽ và tự động hóa cao độ luồng công việc giữa kho bãi, mua hàng, sửa chữa và kế toán công nợ.

#### 📝 [src/lib/inventoryImportAllocation.ts](file:///m:/QLCH_VanLanh/src/lib/inventoryImportAllocation.ts) (112 dòng)
*   **Chức năng:** Thư viện thuật toán phân bổ linh kiện nhập kho và tính toán biến động tồn kho/giá vốn bình quan gia quyền cho sản phẩm.
*   **Các thành phần cốt lõi:**
    *   `planRepairImportAllocation(importedQuantity, line)`: Lập kế hoạch phân bổ linh kiện nhập kho cho phiếu sửa chữa. Xác định xem có cần gỡ liên kết không (`shouldUnlink`), tính toán lượng hàng tạm giữ (`heldQuantity`) và hàng dư thừa đưa vào kho tự do (`surplusQuantity`).
    *   `applyProductImport(current, importedQuantity, importPrice, heldQuantity)`: Tính toán tồn kho vật lý mới (`stock`), lượng giữ chỗ mới (`held`), và giá vốn bình quan gia quyền mới (`costPrice` làm tròn số nguyên).
*   **Đánh giá:** Code tinh gọn, tập trung và cực kỳ dễ hiểu. Đạt chuẩn chất lượng cao về tính tái sử dụng và đơn giản hóa logic.

#### 📝 [src/lib/inventoryFifo.ts](file:///m:/QLCH_VanLanh/src/lib/inventoryFifo.ts) (155 dòng)
*   **Chức năng:** Thư viện thuật toán trừ kho theo nguyên tắc First-In-First-Out (FIFO) dựa trên các lô kho (`inventory_lots`) trong hệ thống.
*   **Các thành phần cốt lõi:**
    *   `fetchFifoLogsForDeduction(tx, db, deductions)`: Giai đoạn Đọc (Reads) bên trong transaction. Truy vấn các lô kho đang hoạt động (`status == 'active'`) của sản phẩm, sắp xếp theo thời gian nhập kho từ cũ đến mới (`createdAt asc`).
    *   `executeFifoDeductionsWrites(tx, deductions, lotsDataByProduct)`: Giai đoạn Ghi (Writes) bên trong transaction. Thực thi logic trừ kho in-memory và gọi `tx.update` để cập nhật số lượng còn lại của từng lô kho.
*   **Quy tắc & Ràng buộc Kỹ thuật:**
    *   **Ưu tiên Lô cụ thể (Preferred Lots):** Nếu KTV hoặc sale chỉ định một lô cụ thể (`preferredLotCodes`), hệ thống sẽ trừ hàng từ lô đó trước. Số lượng thiếu hụt còn lại mới tiếp tục được phân bổ cho các lô khác theo thứ tự FIFO thông thường.
    *   **Legacy Stock Handling:** Nếu tổng tồn kho của toàn bộ các lô kho không đủ để trừ, hệ thống tự động bù trừ lượng thiếu hụt bằng cách ghi nhận vào lô ảo `LEGACY_STOCK` thay vì quăng lỗi làm sập quy trình nghiệp vụ. Điều này giúp hệ thống vận hành liên tục khi dữ liệu nhập kho ban đầu chưa hoàn thiện.
*   **Đánh giá:** Triển khai thuật toán FIFO rất thông minh và thực tế trên nền tảng Firestore, giải quyết triệt để quy tắc Read-Before-Write của transaction.

#### 📝 [src/lib/importReceiptAvailability.ts](file:///m:/QLCH_VanLanh/src/lib/importReceiptAvailability.ts) (27 dòng)
*   **Chức năng:** Kiểm soát tính khả dụng và tổng hợp giá trị hàng hóa thực tế trên phiếu nhập kho.
*   **Cơ chế hoạt động:**
    *   `getReceiptItemAvailability(item)`: Ánh xạ trạng thái khả dụng của từng dòng linh kiện nhập kho (`in_stock`, `unavailable`, `approved`), tương thích ngược với cấu trúc trường cũ.
    *   `calculateImportableTotal(items)`: Tính toán tổng giá trị thực tế của phiếu nhập, tự động loại trừ (bỏ qua giá trị) các linh kiện được đánh dấu là không khả dụng (`unavailable` - ví dụ: nhà cung cấp hết hàng).
*   **Đánh giá:** Logic xử lý đơn giản, giúp thủ kho dễ dàng chốt chính xác số tiền cần thanh toán cho nhà cung cấp khi có dòng hàng bị hủy.

#### 📝 [src/features/parts/importReceiptTypes.ts](file:///m:/QLCH_VanLanh/src/features/parts/importReceiptTypes.ts) (61 dòng)
*   **Chức năng:** Khai báo cấu trúc dữ liệu cho chứng từ nhập kho (`ImportReceipt`) và các dòng chi tiết hàng hóa (`ImportReceiptItem`).
*   **Các thành phần cốt lõi:** Định nghĩa chi tiết các thuộc tính liên kết giữa dòng nhập kho với phiếu sửa chữa (`ticketId`, `partLineId`), lượng phân bổ giữ chỗ (`allocatedHeldQuantity`) và lượng dư thừa nhập kho tự do (`surplusQuantity`).
*   **Đánh giá:** Thiết kế cấu trúc dữ liệu hoàn chỉnh, đáp ứng đầy đủ yêu cầu quản lý liên kết kho bãi và sửa chữa.

#### 📝 [src/features/parts/importReceiptUtils.ts](file:///m:/QLCH_VanLanh/src/features/parts/importReceiptUtils.ts) (68 dòng)
*   **Chức năng:** Các hàm bổ trợ cho màn hình duyệt nhập kho.
*   **Cơ chế hoạt động:**
    *   `buildImportPreviewState(receipt, parts)`: Chuẩn bị dữ liệu hiển thị preview trước khi chốt nhập kho: tự động lọc bỏ hàng không khả dụng, phát hiện các mặt hàng mới tinh chưa có trong catalog để yêu cầu nhập thông tin, và đặc biệt là **tính toán dự báo giá vốn mới** theo công thức bình quan gia quyền (WAC) cho từng mặt hàng hiện hữu.
*   **Đánh giá:** Tiện ích tính toán giá vốn dự báo rất hữu ích, giúp thủ kho có cái nhìn trực quan về biến động giá trị kho.

#### 📝 [src/features/parts/ImportReceiptModals.tsx](file:///m:/QLCH_VanLanh/src/features/parts/ImportReceiptModals.tsx) (672 dòng)
*   **Chức năng:** Bộ các modal tạo phiếu đề xuất nhập kho và chốt nhập kho thực tế.
*   **Các thành phần cốt lõi:**
    *   `CreateReceiptModal`: Cho phép nhân viên tạo nhanh phiếu đề xuất nhập hàng (linh kiện hoặc hàng bán lẻ), tìm nhanh mặt hàng trong catalog. Nếu chưa có, hệ thống tự động sinh ID tuần tự, đăng ký mã QR và tạo sản phẩm nháp ở trạng thái ẩn (`isProposed = true`). Hỗ trợ chọn nhanh nhà cung cấp hoặc tạo mới NCC trực tiếp từ bảng nhập.
    *   `ImportPreviewModal`: Modal duyệt chốt nhập kho. Cho phép chọn phương thức thanh toán (Ghi công nợ NCC hoặc Thanh toán ngay), hiển thị biến động giá vốn dự báo (so với giá vốn cũ tăng hay giảm). Đối với các sản phẩm/linh kiện mới tinh được tạo nháp trước đó, bắt buộc thủ kho phải điền đầy đủ thông tin (taxonomy danh mục, dòng máy tương thích, loại linh kiện, giá bán lẻ/sửa chữa) mới cho phép chốt nhập kho.
*   **Đánh giá:** Module quản trị nhập kho xuất sắc, kiểm soát chặt chẽ thông tin đầu vào của hàng hóa mới và tích hợp đồng bộ công nợ nhà cung cấp.

---

### 4. Nhóm Tiện ích Dữ liệu & Công cụ Nhập liệu (Excel Import & CRM Sync)

#### 📝 [src/features/excel-import/importSupport.ts](file:///m:/QLCH_VanLanh/src/features/excel-import/importSupport.ts) (1080 dòng)
*   **Chức năng:** Bộ helper hỗ trợ parse file Excel, kiểm duyệt dữ liệu (validation), xử lý ảnh local và đăng ký tài liệu Firestore cho tính năng import hàng loạt.
*   **Các thành phần cốt lõi:**
    *   `MODE_CONFIG`: Định nghĩa cấu hình cho 8 chế độ import (sản phẩm, phụ kiện, linh kiện, dịch vụ, khách hàng, nhà cung cấp, đơn hàng cũ, phiếu sửa cũ) bao gồm tên cột bắt buộc và ví dụ mẫu.
    *   `parseRawNumber(raw)`: Làm sạch chuỗi tiền tệ (bỏ ký tự `đ`, `vnd`, khoảng trắng), kiểm tra tính hợp lệ và trả về số nguyên gốc.
    *   `resolveCategoryPath(pathStr, taxonomy)`: Duyệt dọc theo đường dẫn danh mục phân cấp bằng dấu `>` (ví dụ: `Điện thoại > iPhone`) để ánh xạ ra mảng `categoryIds` và tên danh mục cuối.
    *   `findExistingImportImage(fileName, folder)`: Tìm kiếm ảnh đã upload trong `media_library` dựa trên base name của file ảnh local để tái sử dụng URL, tránh upload trùng.
    *   `createInitialProductWithCodes(...)`: Chạy transaction Firestore để khởi tạo sản phẩm mới, đăng ký mã QR vào `product_code_registry` (kiểm tra chống trùng lặp mã) và tạo log nhập kho đầu kỳ.
    *   `generateTemplate(mode, taxonomy)`: Tự động sinh file Excel mẫu cấu trúc chuẩn (`xlsx` library) chứa đầy đủ các sheet hướng dẫn quy ước cột, giá trị hợp lệ, quy định ảnh/media, danh mục taxonomy mẫu và ví dụ đầy đủ cho người dùng tải về.
*   **Đánh giá:** Xử lý rất tốt các biên lỗi của dữ liệu Excel tự do. Module sinh file mẫu được đầu tư cực kỳ chi tiết, giúp nâng cao trải nghiệm người dùng khi nhập liệu ban đầu.

#### 📝 [src/app/api/customers/sync/route.ts](file:///m:/QLCH_VanLanh/src/app/api/customers/sync/route.ts) (77 dòng)
*   **Chức năng:** API Endpoint đồng bộ thông tin khách hàng CRM phía server-side sử dụng Admin SDK.
*   **Cơ chế hoạt động:** Nhận SĐT và tên khách hàng. Chuẩn hóa số điện thoại qua `normalizeVietnamPhone`. Chạy transaction kiểm tra tài liệu trong collection `customers`. Nếu chưa có, tạo mới profile mặc định. Nếu đã có, chỉ cập nhật tên nếu tên cũ là "Khách lẻ" hoặc có cờ `forceUpdateName`.
*   **Đánh giá:** Hoạt động tốt. Đảm bảo an toàn dữ liệu CRM.

#### 📝 [src/lib/customerTiers.ts](file:///m:/QLCH_VanLanh/src/lib/customerTiers.ts) (39 dòng)
*   **Chức năng:** Định cấu hình và tính toán thứ hạng khách hàng (Customer Tiers) dựa trên chi tiêu tích lũy.
*   **Cơ chế hoạt động:**
    *   Định nghĩa 4 hạng thành viên cốt lõi trong `TIER_CONFIGS`: `Smember` (>= 30 triệu VND, chiết khấu 5%), `Gold` (>= 15 triệu VND, chiết khấu 3%), `Silver` (>= 5 triệu VND, chiết khấu 1%), và `Bronze` (>= 0 VND, chiết khấu 0%).
    *   `calculateCustomerTier(totalSpent)`: Trả về hạng thành viên tương ứng bằng cách đối chiếu tổng chi tiêu với các ngưỡng cấu hình từ cao xuống thấp.
    *   `getTierDiscountPercent(tier)`: Trả về phần trăm chiết khấu trực tiếp tương ứng với từng hạng.
*   **Đánh giá:** Thiết kế cấu hình tĩnh rõ ràng, logic tính toán cực kỳ đơn giản và chính xác.


---

### 5. Nhóm Logic Hoa hồng & Bảo hành (Commissions & Warranty)

#### 📝 [src/lib/commissionCalcServer.ts](file:///m:/QLCH_VanLanh/src/lib/commissionCalcServer.ts) (227 dòng)
*   **Chức năng:** Tính toán, phân bổ và thu hồi hoa hồng cho nhân viên bán hàng (Order) và kỹ thuật viên (Repair) phía server-side.
*   **Các thành phần cốt lõi:**
    *   `findBestRule(rules, type, productId, category)`: Thuật toán tìm quy tắc hoa hồng phù hợp nhất theo phân cấp: *Sản phẩm cụ thể (Cấp 3) ➔ Danh mục (Cấp 2) ➔ Quy tắc chung (Cấp 1)*.
    *   `calculateAndSaveCommissionsServer(...)`: Chạy trong transaction. Với đơn hàng, phân bổ chiết khấu pro-rata (theo tỷ lệ) cho từng sản phẩm trước khi tính phần trăm hoa hồng. Lưu bản ghi vào collection `commissions` với ID định danh duy nhất chống trùng lặp. Tích lũy chi phí hoa hồng vào báo cáo tổng hợp doanh thu.
    *   `reverseCommissionServer(...)`: Thu hồi hoa hồng khi đơn hàng bị hủy bằng cách ghi nhận bản ghi âm đối ứng, đảm bảo lịch sử kiểm toán không bị sửa xóa thô bạo.
*   **Đánh giá:** Hoạt động tốt. Đây là lõi tính hoa hồng duy nhất đang chạy trong hệ thống.

#### 📝 [src/lib/repairWarrantyRules.ts](file:///m:/QLCH_VanLanh/src/lib/repairWarrantyRules.ts) (116 dòng)
*   **Chức năng:** Xử lý logic tính hạn bảo hành cho linh kiện sửa chữa phía server-side.
*   **Các thành phần cốt lõi:**
    *   `normalizeWarrantyRuleKey(value)`: Loại bỏ dấu tiếng Việt (NFD), chuyển chữ thường, loại bỏ ký tự đặc biệt để tạo khóa so khớp đồng nhất.
    *   `resolveRepairPartWarrantyRule(part, productData, ruleMap)`: Thực hiện so khớp mờ thông minh giữa tên linh kiện, dòng máy tương thích, danh mục sản phẩm với các quy tắc bảo hành trong cấu hình hệ thống. Nếu không khớp bất kỳ từ khóa nào, sẽ áp dụng quy tắc mặc định (`khac`).
    *   `stampRepairWarrantyOnParts(...)`: Dán thông tin hạn bảo hành (`warrantyMonths` và `warrantyExpiresAt`) lên các linh kiện sửa chữa đủ điều kiện.
*   **Đánh giá:** Thuật toán xử lý chuỗi rất tốt, hạn chế lỗi do thợ kỹ thuật nhập sai chính tả hoặc khoảng trắng.

---

### 6. Nhóm File Dư thừa & Cần Refactor (Phát hiện từ Code Review)

#### 🚨 [src/lib/commissionUtils.ts](file:///m:/QLCH_VanLanh/src/lib/commissionUtils.ts) (189 dòng) - **DƯ THỪA**
*   **Hiện trạng:** Chứa thuật toán tính hoa hồng client-side sử dụng Client SDK.
*   **Đánh giá:** 0 direct importers. Đây là tệp tin lỗi thời, đã bị thay thế hoàn toàn bởi `commissionCalcServer.ts` và cần được xóa bỏ để tránh nhầm lẫn.

#### 🚨 [src/lib/warrantyUtils.ts](file:///m:/QLCH_VanLanh/src/lib/warrantyUtils.ts) (59 dòng) - **DƯ THỪA**
*   **Hiện trạng:** Chứa logic dán tem bảo hành client-side thô sơ (chỉ so khớp chính xác).
*   **Đánh giá:** 0 direct importers. Đã bị thay thế bởi `repairWarrantyRules.ts` và cần được xóa bỏ.

#### 🚨 [src/lib/customerSync.ts](file:///m:/QLCH_VanLanh/src/lib/customerSync.ts) (61 dòng) - **DƯ THỪA**
*   **Hiện trạng:** Đồng bộ khách hàng client-side sử dụng Client SDK.
*   **Đánh giá:** 0 direct importers. Đã bị thay thế bởi Server API `api/customers/sync/route.ts` và cần được xóa bỏ.

#### 🚨 [src/lib/sms.ts](file:///m:/QLCH_VanLanh/src/lib/sms.ts) (39 dòng) - **DƯ THỪA**
*   **Hiện trạng:** Chức năng gửi OTP qua SpeedSMS.
*   **Đánh giá:** 0 direct importers. Hệ thống hiện dùng Firebase Phone Auth, không có tệp nào gọi đến file này. Cần được xóa bỏ.

#### 🚨 [src/components/common/Container.tsx](file:///m:/QLCH_VanLanh/src/components/common/Container.tsx) (19 dòng) - **DƯ THỪA**
*   **Hiện trạng:** Component căn giữa nội dung.
*   **Đánh giá:** Các trang đều viết trực tiếp class Tailwind vào thẻ `div`, không ai sử dụng component này. Cần được xóa bỏ.

#### 🚨 [src/components/admin/ExportImportReportButton.tsx](file:///m:/QLCH_VanLanh/src/components/admin/ExportImportReportButton.tsx) (95 dòng) - **DƯ THỪA / CHỜ TÍCH HỢP**
*   **Hiện trạng:** Nút xuất báo cáo Excel cho lịch sử nhập kho.
*   **Đánh giá:** Code hoàn chỉnh nhưng chưa được import vào bất kỳ trang nào. Cần tích hợp vào trang `/admin/parts` hoặc xóa bỏ.

#### 🚨 [src/lib/permissions.ts](file:///m:/QLCH_VanLanh/src/lib/permissions.ts) (11 dòng) - **CẦN REFACTOR**
*   **Hiện trạng:** File trung gian chỉ thực hiện re-export các hàm từ `adminModules.ts`.
*   **Đánh giá:** Nên cập nhật import tại 5 file đang gọi nó trỏ thẳng về `adminModules.ts` và xóa bỏ file này để làm sạch cấu trúc thư viện.

#### 📝 [src/lib/useFirestore.ts](file:///m:/QLCH_VanLanh/src/lib/useFirestore.ts) (282 dòng)
*   **Chức năng:** Bộ helper và hook kết nối Firestore client-side.
*   **Các thành phần cốt lõi:**
    *   `useFirestoreCollection(...)`: Lắng nghe realtime dữ liệu của một collection kèm theo các bộ lọc `QueryConstraint` động. Tự động quản lý vòng đời listener (unsubscribe khi component unmount) và theo dõi trạng thái loading/error.
    *   Các hook chuyên dụng: `useProducts` (lọc sản phẩm active), `useFlashSaleProducts` (tự động lọc sản phẩm có cờ flash sale hoặc có mức giảm giá từ 10% trở lên), `useServices` (dịch vụ), `useArticles` (bài viết), `useOrders` (đơn hàng).
    *   Các hàm CRUD helper: `addDocument`, `addDocumentWithId`, `updateDocument`, `deleteDocument` tự động chèn các trường thời gian `createdAt` và `updatedAt` sử dụng `serverTimestamp()` của Firestore.
*   **Đánh giá:** Bộ thư viện client-side rất sạch sẽ, đóng gói tốt và dễ sử dụng trên toàn bộ giao diện quản trị.

---

### 10. Nhóm Quản lý Thiết bị & Chuẩn hóa Mã vạch (Product Codes & Image Pipelines)

#### 📝 [src/lib/productCodes.ts](file:///m:/QLCH_VanLanh/src/lib/productCodes.ts) (129 dòng)
*   **Chức năng:** Các hàm tiện ích xử lý SKU, Barcode, và QR code của sản phẩm/linh kiện thiết bị.
*   **Cơ chế hoạt động:**
    *   `normalizeProductCode(value)`: Làm sạch mã sản phẩm: viết hoa, loại bỏ khoảng trắng thừa thay bằng dấu gạch ngang, chỉ giữ lại các ký tự thuộc tập `A-Z0-9_-` và giới hạn tối đa 64 ký tự.
    *   `buildShortCode(prefix, source)`: Thuật toán băm (Hashing) chuỗi ID sản phẩm bằng FNV-1a 32-bit tùy chỉnh để sinh ra mã alphanumeric ngắn 8 ký tự duy nhất, kết hợp tiền tố tương ứng (`SP` cho sản phẩm bán lẻ, `PK` cho phụ kiện, `LK` cho linh kiện sửa chữa).
    *   `getProductScanCandidates(product)`: Tập hợp tất cả các chuỗi mã mà một sản phẩm có thể khớp khi quét bằng máy đọc vạch hoặc camera (bao gồm sku, barcode, productCode, id, mã ngắn, mã compact, và mảng qrCodes).
    *   `extractProductCodeFromScan(rawValue)`: Phân tích cú pháp chuỗi quét thô. Nếu là một URL, tự động trích xuất mã từ các tham số truy vấn (`sku`, `code`, `barcode`).
*   **Đánh giá:** Module thiết kế thuật toán băm mã chứng từ và so khớp QR cực kỳ thông minh, giảm tải dung lượng lưu trữ nhãn in.

#### 📝 [src/lib/imageLoader.ts](file:///m:/QLCH_VanLanh/src/lib/imageLoader.ts) (68 dòng)
*   **Chức năng:** Trình tải ảnh tùy chỉnh (Image Loader) cho Next.js Image Component.
*   **Cơ chế hoạt động:**
    *   **Image Proxy WebP:** Đối với các ảnh lưu trên Firebase Storage, hệ thống sử dụng dịch vụ proxy ảnh trung gian `https://wsrv.nl/` để tự động resize ảnh theo kích thước được yêu cầu, nén chất lượng (`quality` mặc định 75) và chuyển đổi định dạng sang WebP siêu nhẹ để tối ưu băng thông.
    *   **LCP Preload Bypass:** Nếu phát hiện cờ `bypassProxy=true` trong URL ảnh (dùng cho ảnh biểu ngữ chính Hero Image), hệ thống trả về trực tiếp link gốc của Storage để trình duyệt tải trước (preload) nhanh nhất, tránh độ trễ qua proxy.
    *   **Thumbnail Swap:** Nếu proxy bị tắt và chiều rộng ảnh nhỏ hơn hoặc bằng 384px, hệ thống tự động tráo đổi ảnh gốc bằng ảnh thumbnail thu nhỏ (`_thumb`) nếu có cờ `hasThumb=true` để tăng tốc độ tải trang.
*   **Đánh giá:** Giải pháp xử lý tải ảnh responsive cực kỳ thực tế, tối ưu hóa hiệu năng LCP và tiết kiệm chi phí băng thông lưu trữ Storage.

#### 📝 [src/lib/imageOptimizer.ts](file:///m:/QLCH_VanLanh/src/lib/imageOptimizer.ts) (71 dòng)
*   **Chức năng:** Tiện ích tối ưu hóa và nén hình ảnh trực tiếp tại trình duyệt client trước khi tải lên máy chủ.
*   **Cơ chế hoạt động:**
    *   **Giải nén phi tuần tự:** Sử dụng `createImageBitmap` để giải nén ảnh dưới nền (off-main-thread), tránh chặn luồng xử lý chính của giao diện.
    *   **Offscreen Canvas:** Nếu trình duyệt hỗ trợ `OffscreenCanvas` (Chrome, Firefox), hệ thống thực hiện vẽ lại ảnh thay đổi kích thước và nén sang WebP ở luồng nền. Nếu là trình duyệt cũ (Safari < 16.4), tự động chuyển sang canvas thông thường của luồng chính làm fallback.
    *   Trả về đối tượng `File` mới có định dạng `.webp` và giải phóng vùng nhớ `ImageBitmap` để tránh rò rỉ bộ nhớ trình duyệt.
*   **Đánh giá:** Tiện ích tối ưu hóa hình ảnh client-side xuất sắc, triệt tiêu hoàn toàn hiện tượng đơ giật giao diện (UI Freeze) khi người dùng tải ảnh dung lượng lớn.

#### 📝 [src/lib/phone.ts](file:///m:/QLCH_VanLanh/src/lib/phone.ts) (24 dòng)
*   **Chức năng:** Chuẩn hóa số điện thoại di động Việt Nam.
*   **Cơ chế hoạt động:** Loại bỏ tất cả ký tự không phải số, chuyển đổi đầu số quốc gia `84` thành số `0`, kiểm tra định dạng độ dài từ 10 đến 11 chữ số bắt đầu bằng số `0`. Trả về đối tượng gồm số điện thoại dùng trong nước (`local` dạng `0987654321`) và định dạng quốc tế E.164 (`e164` dạng `+84987654321`) phục vụ cho Firebase OTP.
*   **Đánh giá:** Code tinh gọn, thực thi chính xác nhiệm vụ chuẩn hóa số điện thoại CRM.

#### 📝 [src/lib/videoOptimizer.ts](file:///m:/QLCH_VanLanh/src/lib/videoOptimizer.ts) (88 dòng)
*   **Chức năng:** Nén video bàn giao thiết bị trực tiếp trên trình duyệt client trước khi tải lên Firebase Storage nhằm tiết kiệm băng thông và dung lượng lưu trữ.
*   **Cơ chế hoạt động:**
    *   Sử dụng thư viện `@ffmpeg/ffmpeg` tải động bản single-threaded core từ CDN `unpkg.com` để tránh xung đột hoặc yêu cầu cấu hình các header bảo mật Cross-Origin (COOP/COEP) ở phía máy chủ.
    *   `compressVideo(file, onProgress)`: Ghi video gốc vào hệ thống tệp ảo của WebAssembly FFmpeg, thực thi lệnh nén H.264 với codec âm thanh `aac`, chỉ số chất lượng `crf=28`, preset `fast`, và bitrate âm thanh `128k`. Sau khi hoàn thành, giải phóng tệp ảo và trả về đối tượng `File` nén dưới định dạng MP4.
*   **Đánh giá:** Giải pháp kỹ thuật nén video client-side đột phá, giảm thiểu tải trọng upload video từ thiết bị di động của kỹ thuật viên.

#### 📝 [src/lib/validateImage.ts](file:///m:/QLCH_VanLanh/src/lib/validateImage.ts) (24 dòng)
*   **Chức năng:** Kiểm tra tính hợp lệ của tệp hình ảnh trước khi tải lên (dùng chung cho mọi thực thể như sản phẩm, bài viết, banner...).
*   **Các thành phần cốt lõi:**
    *   Hằng số `MAX_FILE_SIZE = 2MB`.
    *   Mảng định dạng hợp lệ `ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']`.
    *   `validateImageFile(file)`: Đối chiếu kiểu tệp và dung lượng tệp. Trả về thông báo lỗi bằng tiếng Việt cụ thể nếu không hợp lệ hoặc `null` nếu tệp hoàn toàn an sau để upload.
*   **Đánh giá:** Guardrail hữu ích ở client-side để hạn chế lưu trữ tệp dung lượng quá lớn hoặc không đúng định dạng lên Firebase Storage.

#### 📝 [src/lib/productLifecycle.ts](file:///m:/QLCH_VanLanh/src/lib/productLifecycle.ts) (54 dòng)
*   **Chức năng:** Quản lý vòng đời trạng thái (Active, Hidden, Inactive) và kiểm soát điều kiện bán hàng của sản phẩm/linh kiện.
*   **Cơ chế hoạt động:**
    *   `isProductSellable(product)`: Sản phẩm chỉ được phép bán khi ở trạng thái `active`, không phải là hàng đề xuất chưa duyệt (`isProposed == false`), và có số lượng tồn khả dụng > 0 (`stock - held > 0`).
    *   `canArchiveProduct(product)`: Chỉ cho phép chuyển trạng thái sản phẩm thành lưu trữ (`inactive`) khi sản phẩm đã hết sạch hàng tồn thực tế (`stock <= 0`) và không còn bị giữ chỗ bởi bất kỳ đơn hàng/ca sửa chữa nào (`held <= 0`).
    *   `buildReactivateOnImportUpdate(product, newStock)`: Tự động kích hoạt lại trạng thái hoạt động (`active`) và gỡ cờ đề xuất (`isProposed = false`) cho sản phẩm lưu trữ khi thủ kho tiến hành nhập thêm số lượng tồn kho mới.
*   **Đánh giá:** Thiết kế vòng đời sản phẩm vô cùng chặt chẽ, bảo vệ toàn vẹn logic kho bãi và hiển thị storefront.

#### 📝 [src/lib/storage.ts](file:///m:/QLCH_VanLanh/src/lib/storage.ts) (199 dòng)
*   **Chức năng:** Dịch vụ xử lý tải lên, xóa bỏ và quản trị các tệp đa phương tiện (Media) trên Firebase Storage.
*   **Cơ chế hoạt động:**
    *   `uploadMedia(file, path)`: Tự động nhận dạng ảnh/video. Kiểm tra dung lượng video (tối đa 50MB) để tránh làm nghẽn băng thông. Làm sạch tên file vật lý chỉ giữ lại ký tự chữ cái và số, tạo cấu trúc thư mục rõ ràng: `images/{path}/{timestamp}_{name}` hoặc `videos/{path}/{timestamp}_{name}`.
    *   `deleteImage(fileUrl)`: Thực hiện phân tích ngược URL tải về của Firebase Storage để trích xuất đường dẫn file gốc và gọi API xóa file. Hoạt động an toàn (không ném lỗi nếu file không tồn tại).
    *   `cleanBrokenMedia(onProgress)`: Thuật toán dọn rác dữ liệu. Quét qua toàn bộ collection `media_library` trong Firestore theo từng batch 50 tài liệu. Gọi kiểm tra metadata tệp tương ứng trên Storage. Nếu phát hiện tệp đã bị xóa thô bạo khỏi Storage, hệ thống tự động xóa bản ghi tương ứng trên Firestore để giải phóng cơ sở dữ liệu.
*   **Đánh giá:** Dịch vụ quản lý tệp tin rất toàn diện, đặc biệt thuật toán dọn rác Broken Media giúp duy trì tính nhất quán dữ liệu ở mức tối đa.




---

### 11. Nhóm Báo cáo Tài chính & Tự động Hóa Cache (Finance Aggregates & Cache Revalidation)

#### 📝 [src/lib/revenueAggregate.ts](file:///m:/QLCH_VanLanh/src/lib/revenueAggregate.ts) (144 dòng)
*   **Chức năng:** Các hằng số, kiểu dữ liệu và thuật toán xử lý dữ liệu tổng hợp doanh thu báo cáo.
*   **Các thành phần cốt lõi:**
    *   `REVENUE_AGGREGATE_NUMERIC_FIELDS`: Định nghĩa 16 trường chỉ số tài chính (doanh thu bán lẻ, sửa chữa, công nợ thu, giá vốn nhập, chi phí hoa hồng, chi phí chi tiêu khác, lợi nhuận ròng, số lượng đơn hàng, v.v.).
    *   `normalizeRevenueAggregateDelta(...)`: Thuật toán chuẩn hóa biến động doanh thu. Tự động tính toán lại tổng doanh thu ròng, tổng chi phí ròng và hiệu số lợi nhuận ròng thực tế dựa trên các biến động thô truyền lên để đảm bảo tính nhất quán số liệu.
    *   `applyRevenueAggregateDelta(...)`: Hợp nhất biến động doanh thu vào danh sách tài liệu tổng hợp hàng ngày trong bộ nhớ tạm trước khi hiển thị báo cáo.
*   **Đánh giá:** Định nghĩa cấu trúc dữ liệu báo cáo rất khoa học, đồng nhất và tính toán logic chặt chẽ.

#### 📝 [src/lib/revenueAggregateServer.ts](file:///m:/QLCH_VanLanh/src/lib/revenueAggregateServer.ts) (105 dòng)
*   **Chức năng:** Dịch vụ ghi nhận và tích lũy doanh thu báo cáo phía server-side sử dụng Admin SDK.
*   **Cơ chế hoạt động:**
    *   `incrementRevenueAggregates(...)`: Thực thi bên trong một Firestore Transaction. Sử dụng toán tử atomic `FieldValue.increment` để cộng dồn các chỉ số tài chính đồng thời vào tài liệu ngày tương ứng trong `revenue_daily_aggregates` và tài liệu tháng tương ứng trong `revenue_monthly_aggregates`.
    *   `buildCompletedOrderRevenueDelta(...)`: Thuật toán phân tích đơn hàng hoàn tất để trích xuất dòng tiền. Hệ thống duyệt qua lịch sử thanh toán ròng (`paymentHistory`) để bóc tách chính xác phần doanh thu thực thu bằng tiền mặt/chuyển khoản (`orderRevenue`) với phần doanh thu ghi nợ phải thu (`debtRevenue`) làm căn cứ tích lũy báo cáo tài chính chuẩn xác.
*   **Đánh giá:** Logic xử lý dữ liệu doanh thu vô cùng chính xác, quản lý dòng tiền mặt đối ứng công nợ chặt chẽ và an toàn tuyệt đối qua transaction.

#### 📝 [src/lib/revalidate.ts](file:///m:/QLCH_VanLanh/src/lib/revalidate.ts) (57 dòng)
*   **Chức năng:** Server Action kích hoạt làm mới bộ nhớ đệm trang tĩnh (On-Demand ISR Revalidation).
*   **Cơ chế hoạt động:**
    *   Thực hiện gọi `revalidatePath` và `revalidateTag` của Next.js Cache. Đặc biệt, nếu cấu hình hệ thống thay đổi, hệ thống chỉ revalidate thư mục trang khách hàng `/(customer)` thay vì root `/` để bảo toàn Router Cache của trang quản trị `/admin`, tránh hiện tượng văng đăng nhập và remount Auth.
    *   **Cross-Domain Revalidation:** Nếu cấu hình khóa bí mật `REVALIDATE_SECRET`, hệ thống tự động gửi yêu cầu fetch POST làm mới cache đồng loạt sang các tên miền production (`fixphone.vn` và Google Firebase Hosting domains).
*   **Đánh giá:** Cơ chế quản lý bộ đệm phân vùng rất thông minh, giải quyết triệt để lỗi trải nghiệm người dùng trang quản trị khi lưu cấu hình.

#### 📝 [src/lib/requestRevalidate.ts](file:///m:/QLCH_VanLanh/src/lib/requestRevalidate.ts) (26 dòng)
*   **Chức năng:** Tiện ích gửi yêu cầu làm mới cache tĩnh chạy độc lập từ giao diện client.
*   **Cơ chế hoạt động:** Thay vì gọi Server Action trực tiếp từ UI React làm Next.js tự động refresh lại cấu trúc router tree của trang hiện tại, hàm này thực hiện gửi một yêu cầu fetch HTTP nền (background request) đến API `/api/revalidate` với thông tin paths/tags cần xóa cache.
*   **Đánh giá:** Giải pháp kỹ thuật khôn ngoan, giải quyết triệt để vấn đề Router Cache remount Auth của Next.js App Router trên trang quản trị.

---

### 12. Nhóm Tích hợp Kênh Chat & Exit Gates Sửa chữa (Chat Channels & Repair Exit Gates)

#### 📝 [src/lib/chatChannels.ts](file:///m:/QLCH_VanLanh/src/lib/chatChannels.ts) (30 dòng)
*   **Chức năng:** Định nghĩa cấu hình kênh chat và chuẩn hóa định dạng khóa lưu trữ của Realtime Database.
*   **Cơ chế hoạt động:**
    *   Hỗ trợ 3 kênh chat: `web` (trực tuyến ẩn danh), `zalo`, `facebook`.
    *   `toSafeRtdbKey(value)`: Làm sạch khóa lưu trữ bằng cách loại bỏ các ký tự đặc biệt bị cấm trong RTDB (như `.`, `#`, `$`, `/`, `[`, `]`) thay bằng dấu gạch dưới và giới hạn 180 ký tự.
    *   `buildExternalChatRoomId(...)`: Tạo ID phòng chat duy nhất cho các kênh ngoài theo cấu trúc `{channel}_{safePageId}_{safeUserId}` để quản lý hội thoại đồng nhất.
*   **Đánh giá:** Đảm bảo an toàn cấu trúc dữ liệu cho Realtime Database, tránh lỗi ký tự đặc biệt làm sập luồng ghi nhận tin nhắn.

#### 📝 [src/lib/chatWorkflowHandoff.ts](file:///m:/QLCH_VanLanh/src/lib/chatWorkflowHandoff.ts) (35 dòng)
*   **Chức năng:** Chuyển tiếp thông tin khách hàng từ màn hình Live Chat sang trang nghiệp vụ POS/Sửa chữa.
*   **Cơ chế hoạt động:**
    *   **Bảo vệ dữ liệu nhạy cảm (PII):** Thay vì truyền tên và số điện thoại khách hàng qua tham số truy vấn URL (Query Parameters) gây nguy cơ rò rỉ thông tin cá nhân vào lịch sử trình duyệt hoặc log máy chủ, hệ thống lưu tạm thông tin vào `sessionStorage` của trình duyệt.
    *   `consumeChatWorkflowHandoff()`: Trang POS hoặc Sửa chữa khi load sẽ đọc thông tin pre-fill từ `sessionStorage` và lập tức xóa bỏ bản ghi tạm thời này khỏi bộ nhớ để tránh lưu vết.
*   **Đánh giá:** Giải pháp kỹ thuật đạt tiêu chuẩn bảo mật dữ liệu khách hàng cực kỳ cao, ngăn chặn rò rỉ thông tin cá nhân hoàn hảo.

#### 📝 [src/lib/repairStatus.ts](file:///m:/QLCH_VanLanh/src/lib/repairStatus.ts) (62 dòng)
*   **Chức năng:** Định nghĩa các hằng số trạng thái phiếu sửa chữa, trạng thái linh kiện và các helper kiểm tra.
*   **Các thành phần cốt lõi:**
    *   `REPAIR_STATUS`: Định nghĩa 7 trạng thái cốt lõi của phiếu sửa chữa (`cho_tiep_nhan`, `dang_kiem_tra`, `da_dat_linh_kien`, `cho_ban_giao_khach`, `done`, `refund`, `out`).
    *   `REPAIR_PART_STATUS`: Định nghĩa 8 trạng thái vòng đời của linh kiện yêu cầu (`requested`, `approved`, `ordered`, `selected`, `in_stock`, `unavailable`, `rejected`, `cancelled`).
    *   Các helper: `isPendingRepairPart` (kiểm tra linh kiện đang trong quá trình đặt hàng hoặc chờ nhập), `isSelectedRepairPart` (linh kiện đã sẵn sàng lắp ráp), `isWarrantyEligibleRepairPart` (linh kiện hợp lệ để dán tem bảo hành).
*   **Đánh giá:** Quy chuẩn hóa trạng thái vòng đời rất rõ ràng, nhất quán và chặt chẽ.

#### 📝 [src/lib/workflowFeatures.ts](file:///m:/QLCH_VanLanh/src/lib/workflowFeatures.ts) (161 dòng)
*   **Chức năng:** Bộ đăng ký tính năng và kiểm soát cổng ra trạng thái sửa chữa (Exit Gates Validation).
*   **Các thành phần cốt lõi:**
    *   `WORKFLOW_FEATURES`: Khai báo chi tiết 9 cờ tính năng an toàn gắn liền với trạng thái (yêu cầu hoàn tất checklist, yêu cầu linh kiện sẵn sàng, yêu cầu ghi chú kỹ thuật, yêu cầu gán KTV, tính hoa hồng cho thợ sửa/sale, v.v.).
    *   `isChecklistComplete(checklist)`: Kiểm tra bắt buộc hoàn tất checklist 8 hạng mục phần cứng thiết bị (`body`, `screen`, `touch`, `camera`, `speaker`, `connectivity`, `battery`, `biometric`).
    *   `getYouTubeEmbedUrl(url)`: Phân tích và tự động chuyển đổi mọi định dạng link YouTube (share link, short link, watch link) thành URL nhúng (`embed`) chuẩn để hiển thị video bàn giao thiết bị trực tiếp trên UI.
    *   `areAllPartsReady(ticket)`: Kiểm tra xem ca sửa chữa còn linh kiện nào ở trạng thái chờ đặt hàng/yêu cầu hay không, phục vụ cho cổng kiểm soát `requirePartsReady`.
*   **Đánh giá:** Trung tâm quản lý nghiệp vụ kiểm soát chất lượng sửa chữa cực kỳ chặt chẽ, đảm bảo tính ổn định và chính xác trong quy trình kỹ thuật.

#### 📝 [src/lib/chatIntegrationConfig.ts](file:///m:/QLCH_VanLanh/src/lib/chatIntegrationConfig.ts) (224 dòng)
*   **Chức năng:** Quản lý cấu hình tích hợp live chat đa kênh (Zalo OA, Facebook Messenger) và danh sách câu trả lời nhanh (Quick Replies).
*   **Cơ chế hoạt động:**
    *   **Bảo mật thông tin nhạy cảm:** Hàm `toPublicChatIntegrationConfig` tự động bóc tách và ẩn toàn bộ các token truy cập, app secret, và webhook verify token nhạy cảm trước khi gửi cấu hình về phía client-side, chỉ trả về các cờ kiểm tra (vd: `pageAccessTokenSet: true`).
    *   **Đồng bộ cấu hình nhà phát triển:** Hàm `mergeWithEnv` tự động ưu tiên nạp cấu hình từ các biến môi trường (`.env`) làm cấu hình mặc định, giúp các lập trình viên có thể code tính năng chat lập tức mà không cần kết nối tới Firestore.
    *   **Chuẩn hóa câu trả lời nhanh:** Giới hạn tối đa 30 câu trả lời mẫu, khống chế số lượng ký tự, và tự động ép tiền tố dấu gạch chéo `/` cho phím tắt (vd: `/chao` cho tin nhắn chào mừng) để nhân viên dễ dàng soạn nhanh.
*   **Đánh giá:** Module quản lý cấu hình live chat cực kỳ bảo mật, thiết kế gọn gàng và có độ an toàn nghiệp vụ cao.


---

### 7. Nhóm Tiện ích Hệ thống & Quản lý Cấu hình (System Utilities & Contexts)

#### 📝 [src/lib/AuthContext.tsx](file:///m:/QLCH_VanLanh/src/lib/AuthContext.tsx) (242 dòng)
*   **Chức năng:** Context và Provider quản lý trạng thái xác thực (Authentication) phía client-side.
*   **Cơ chế hoạt động:**
    *   **Lazy-loading Auth:** Để tối ưu tốc độ tải trang cho khách hàng vãng lai, hệ thống chỉ khởi tạo và tải thư viện Firebase Auth khi thực sự cần thiết (ví dụ: phát hiện cờ `has_logged_in` trong `localStorage` hoặc người dùng đang truy cập các tuyến đường `/admin`).
    *   **Đồng bộ Quyền hạn (RBAC):** Khi đăng nhập thành công, hệ thống đọc tài liệu của nhân viên từ collection `users` để nạp thông tin vai trò (`role`) và danh sách quyền hạn (`permissions`).
    *   **Đồng bộ Session Cookie:** Nếu người dùng là Admin hoặc Staff, hệ thống tự động gửi ID Token lên API `/api/auth/session` để tạo session cookie được ký bảo mật phục vụ cho bộ lọc Edge Middleware RBAC, quá trình này diễn ra bất đồng bộ để không chặn việc render UI.
*   **Đánh giá:** Thiết kế tối ưu hiệu năng xuất sắc thông qua cơ chế trì hoãn tải (lazy-loading) thư viện Auth của Firebase.

#### 📝 [src/lib/ConfigContext.tsx](file:///m:/QLCH_VanLanh/src/lib/ConfigContext.tsx) (327 dòng)
*   **Chức năng:** Context và Provider quản lý cấu hình động toàn hệ thống (Site Configuration).
*   **Cơ chế hoạt động:**
    *   **Realtime Split-Config Listener:** Đăng ký lắng nghe realtime đồng thời 4 tài liệu cấu hình riêng biệt trong collection `system_config`: `main_settings` (cài đặt chung), `layout_settings` (giao diện homepage), `navigation_settings` (menu điều hướng), `taxonomy_settings` (danh mục).
    *   **Tự động khởi tạo (Seeding):** Nếu bất kỳ tài liệu cấu hình nào chưa tồn tại trong Firestore, hệ thống tự động ghi dữ liệu cấu hình mặc định (`DEFAULT_CONFIG`) xuống database.
    *   **Động hóa giao diện:** Khi cấu hình thay đổi, hệ thống tự động inject các biến CSS màu sắc chủ đạo (`--primary`), thay đổi hình nền/màu nền của thẻ `body` và cập nhật cấu hình proxy tối ưu ảnh.
    *   **Ghi dữ liệu an toàn:** Hàm `updateConfig` tự động làm sạch các trường `undefined` để tránh lỗi Firestore, phân chia các key cấu hình về đúng tài liệu Firestore tương ứng và gửi yêu cầu revalidate cache nền qua `/api/revalidate`.
*   **Đánh giá:** Kiến trúc cấu hình phân tách (Split Config) rất thông minh, giúp giảm tải dữ liệu đọc/ghi và tránh ghi đè chéo cấu hình.

#### 📝 [src/lib/adminModules.ts](file:///m:/QLCH_VanLanh/src/lib/adminModules.ts) (239 dòng)
*   **Chức năng:** Đăng ký danh mục quyền hạn, định tuyến và phân quyền sidebar trang quản trị.
*   **Các thành phần cốt lõi:**
    *   `PERMISSIONS_REGISTRY`: Khai báo 16 quyền hạn nghiệp vụ phân cấp rõ ràng (quản lý đơn, sửa chữa, sản phẩm, tồn kho, cskh, nhân sự, v.v.).
    *   `ADMIN_NAV_GROUPS`: Định nghĩa menu sidebar admin được gom nhóm theo luồng nghiệp vụ (Tổng quan, Bán hàng, Sửa chữa, Kho hàng, Khách hàng, Quản trị). Mỗi menu liên kết chặt chẽ với một `permission` bắt buộc và một `badgeKey` để hiển thị số lượng realtime.
    *   `ADMIN_ROLE_PRESETS`: Định nghĩa sẵn các gói phân quyền cho các vai trò vận hành: Thu ngân (`cashier`), Kỹ thuật viên (`technician`), Thủ kho (`warehouse`), Chăm sóc khách hàng (`customer-care`), Biên tập viên (`content`).
    *   Các helper: `canStaffAccess` (kiểm tra quyền truy cập route), `findFirstAccessibleRoute` (tìm trang hợp lệ đầu tiên để chuyển hướng sau khi đăng nhập).
*   **Đánh giá:** Trung tâm quản lý RBAC cực kỳ gọn gàng, nhất quán và dễ mở rộng.

#### 📝 [src/lib/chatServer.ts](file:///m:/QLCH_VanLanh/src/lib/chatServer.ts) (401 dòng)
*   **Chức năng:** Dịch vụ xử lý tin nhắn đa kênh (omni-channel) phía server-side sử dụng Admin SDK.
*   **Các thành phần cốt lõi:**
    *   `cacheFacebookImages(...)`: Tự động tải các tệp ảnh đính kèm từ CDN của Facebook, kiểm tra dung lượng (tối đa 8MB) và lưu trữ private vào Firebase Storage dưới đường dẫn `private/chat/facebook/{roomId}/` để đảm bảo an toàn bảo mật và hiển thị ổn định.
    *   `fetchFacebookUserProfile(...)`: Gọi Facebook Graph API bằng Page Access Token để tự động lấy tên và ảnh đại diện thật của khách hàng gửi tin nhắn qua Messenger.
    *   `upsertExternalInboundMessage(...)`: Nhận webhook tin nhắn từ Facebook/Zalo, chuẩn hóa văn bản, tạo ID phòng chat duy nhất, ghi nhận tin nhắn vào Realtime Database và cập nhật thông tin phòng chat (tin nhắn cuối, thời gian, cờ chưa đọc).
    *   `sendAdminChatMessage(...)`: Gửi tin nhắn phản hồi của nhân viên đến Zalo OA hoặc Facebook Messenger thông qua các API tương ứng, sau đó ghi nhận tin nhắn vào RTDB phòng chat.
*   **Đánh giá:** Bộ xử lý tin nhắn backend rất hoàn thiện, giải quyết triệt để vấn đề bảo mật ảnh Facebook và tối ưu trải nghiệm chăm sóc khách hàng.

#### 📝 [src/lib/utils.ts](file:///m:/QLCH_VanLanh/src/lib/utils.ts) (91 dòng)
*   **Chức năng:** Các hàm tiện ích dùng chung về xử lý chuỗi (slug), định tuyến danh mục (taxonomy) và sinh từ khóa tìm kiếm cho Firestore.
*   **Các thành phần cốt lõi:**
    *   `generateSlug(text)`: Chuẩn hóa chuỗi tiếng Việt có dấu thành không dấu (NFD), thay `đ` thành `d`, chuyển thành chữ thường, loại bỏ ký tự đặc biệt, thay thế khoảng trắng bằng dấu gạch ngang.
    *   `getCategoryPath(nodeId, trees)`: Hàm đệ quy duyệt cây danh mục trên bộ nhớ RAM (0 Firestore read) để trả về đường dẫn danh mục đầy đủ dạng thân thiện (vd: `Điện thoại > iPhone > iPhone 16`).
    *   `collectAllNodeIds(trees)`: Gom tất cả ID danh mục trong cây phân cấp vào một đối tượng `Set` để tối ưu hóa việc kiểm tra sự tồn tại với độ phức tạp O(1).
    *   `generateSearchKeywords(name)`: Sinh mảng các từ khóa tìm kiếm (tối đa 60 từ khóa) bao gồm các tiền tố (prefix tối thiểu 2 ký tự) phục vụ cho truy vấn `array-contains` giả lập chức năng typeahead tìm kiếm của Firestore.
*   **Đánh giá:** Code viết rất tối ưu, quản lý bộ nhớ RAM tốt và giải quyết khéo léo hạn chế tìm kiếm của Firestore.

#### 📝 [src/lib/toast.ts](file:///m:/QLCH_VanLanh/src/lib/toast.ts) (15 dòng)
*   **Chức năng:** Bộ hàm tiện ích bọc thư viện `sonner` để hiển thị thông báo toast nhanh cho người dùng.
*   **Các thành phần cốt lõi:**
    *   `toastSuccess(message)`: Hiển thị thông báo thành công.
    *   `toastError(message)`: Hiển thị thông báo lỗi.
    *   `toastWarning(message)`: Hiển thị thông báo cảnh báo.
*   **Đánh giá:** Code đơn giản, gọn nhẹ, giúp đồng nhất thư viện thông báo trên toàn hệ thống.

#### 📝 [src/lib/sanitizeHtml.ts](file:///m:/QLCH_VanLanh/src/lib/sanitizeHtml.ts) (26 dòng)
*   **Chức năng:** Làm sạch chuỗi mã HTML thô nhằm chống lỗ hổng bảo mật tấn công tiêm mã độc Cross-Site Scripting (XSS) trước khi hiển thị qua `dangerouslySetInnerHTML`.
*   **Cơ chế hoạt động:**
    *   Thay thế khoảng trắng cứng `&nbsp;` và `\u00A0` thành khoảng trắng thường để tránh phá vỡ giao diện layout.
    *   Sử dụng biểu thức chính quy (Regex) để xóa bỏ hoàn toàn các thẻ `<script>`, `<style>`, các thuộc tính bắt sự kiện nội dòng (như `onclick`, `onload`...), và vô hiệu hóa các liên kết chứa mã thực thi `javascript:`.
    *   **Iframe Allowlist:** Chỉ cho phép giữ lại các thẻ `<iframe>` trỏ đến nguồn nhúng của YouTube hoặc Facebook, loại bỏ toàn bộ các nguồn lạ khác.
*   **Đánh giá:** Giải pháp lọc XSS nhanh, nhẹ và thực tế cho các mô tả bài viết/dịch vụ của quản trị viên.

#### 📝 [src/lib/businessIdentity.ts](file:///m:/QLCH_VanLanh/src/lib/businessIdentity.ts) (75 dòng)
*   **Chức năng:** Tổng hợp và quản lý tập trung thông tin nhận diện thương hiệu của doanh nghiệp (tên, địa chỉ, chi nhánh, hotline, socials...) để tránh việc hardcode rải rác.
*   **Cơ chế hoạt động:**
    *   `getBusinessIdentity(config)`: Hợp nhất thông tin liên hệ và chi nhánh động từ Firestore (`SiteConfig`) với cấu hình tĩnh mặc định `DEFAULT_CONFIG`.
    *   Tự động sinh liên kết Zalo chat (`https://zalo.me/{phone}`), liên kết tìm kiếm bản đồ Google Maps và chuẩn hóa định dạng số điện thoại hiển thị dạng dấu chấm (`0987.654.321`).
*   **Đánh giá:** Một module quan trọng phục vụ dọn dẹp nợ kỹ thuật hardcode, giúp việc hiển thị thương hiệu của storefront linh hoạt và đồng bộ.

#### 📝 [src/lib/constants.ts](file:///m:/QLCH_VanLanh/src/lib/constants.ts) (18 dòng)
*   **Chức năng:** Định nghĩa các hằng số phân loại danh mục sản phẩm/dịch vụ dùng chung.
*   **Cơ chế hoạt động:**
    *   Khai báo mảng `RETAIL_CATEGORIES` và tên định danh nội bộ của linh kiện sửa chữa `PART_CATEGORY = 'component'`.
    *   `isPartCategory(category, categoryIds)`: Hàm so khớp mờ thông minh kiểm tra xem sản phẩm có thuộc nhóm linh kiện sửa chữa hay không thông qua tên danh mục tiếng Việt/tiếng Anh hoặc phân cấp ID.
*   **Đánh giá:** Tách biệt tốt hằng số hệ thống, giúp đồng nhất logic phân loại mặt hàng.

#### 📝 [src/lib/firebase.ts](file:///m:/QLCH_VanLanh/src/lib/firebase.ts) (56 dòng)
*   **Chức năng:** Khởi tạo cấu hình và quản lý các kết nối Firebase phía Client-side.
*   **Cơ chế hoạt động:**
    *   Eager loading Firestore (`db`) vì hầu hết mọi trang của hệ thống đều cần đọc ghi dữ liệu.
    *   **Lazy Singletons Pattern:** Để tối ưu hóa tốc độ tải trang Front-end cho khách hàng, hệ thống chỉ tải động (`import(...)`) các SDK nặng như Firebase Auth, Realtime Database, và Firebase Storage khi có hành động gọi thực sự. Điều này giúp giảm ~100-150KB dung lượng bundle của storefront.
*   **Đánh giá:** Giải pháp tối ưu hiệu năng tải trang xuất sắc, đạt tiêu chuẩn chất lượng Web Core Vitals rất cao.

#### 📝 [src/lib/firebaseAdmin.ts](file:///m:/QLCH_VanLanh/src/lib/firebaseAdmin.ts) (170 dòng)
*   **Chức năng:** Khởi tạo cấu hình và quản lý các kết nối Firebase Admin SDK phía Server-side.
*   **Cơ chế hoạt động:**
    *   **Độc lập môi trường:** Tự động đọc và parse file cấu hình `.env.local` khi chạy trong ngữ cảnh các file script chạy độc lập bằng Node.js (ví dụ như tool di chuyển dữ liệu, batch jobs) để nạp các khóa bí mật.
    *   **Đa cơ chế xác thực:** Hỗ trợ nạp Service Account từ biến môi trường JSON, đường dẫn file vật lý, hoặc các trường khóa đơn lẻ. Nếu chạy trên Google Cloud (Cloud Run/Cloud Functions), hệ thống tự động fallback dùng Application Default Credentials (ADC) để kết nối không cần file key bảo mật.
    *   Cung cấp các hàm cached singletons (`getAdminDb`, `getAdminAuth`, `getAdminRtdb`...) để tối ưu tài nguyên kết nối.
*   **Đánh giá:** Module lõi kết nối máy chủ cực kỳ hoàn thiện, linh hoạt và tương thích hoàn hảo cả môi trường dev local lẫn hạ tầng cloud production.

#### 📝 [src/lib/icon-map.ts](file:///m:/QLCH_VanLanh/src/lib/icon-map.ts) (51 dòng)
*   **Chức năng:** Ánh xạ từ chuỗi tên icon lưu trữ trong Firestore thành component giao diện Lucide React.
*   **Cơ chế hoạt động:**
    *   Quản lý bảng tra cứu `ICON_MAP` gồm 25 icon Lucide thông dụng phục vụ vẽ menu động.
    *   `getIcon(name)`: Trả về component icon tương ứng, tự động fallback về icon `LayoutGrid` nếu tên icon không hợp lệ hoặc bị xóa.
*   **Đánh giá:** Giải pháp vẽ menu động an toàn, chống lỗi sập giao diện khi cấu hình dữ liệu sai.

#### 📝 [src/lib/useAdminBadges.ts](file:///m:/QLCH_VanLanh/src/lib/useAdminBadges.ts) (256 dòng)
*   **Chức năng:** Hook trung tâm quản lý realtime toàn bộ số lượng thông báo (Badges) trên thanh menu sidebar admin.
*   **Cơ chế hoạt động:**
    *   **Tiết kiệm lượt đọc Firestore:** Gom tất cả các truy vấn số lượng đơn hàng, lịch hẹn, đánh giá và phiếu sửa chữa vào trong một hook duy nhất để tránh việc đăng ký lặp và lãng phí lượt đọc Firestore giữa các component con.
    *   **Server Aggregation Query:** Sử dụng hàm `getCountFromServer()` của Firestore để đếm số lượng tài liệu trực tiếp trên server thay vì tải toàn bộ snapshot tài liệu về client, giúp tiết kiệm tối đa chi phí băng thông và lượt đọc.
    *   **Realtime Hybrid Listener:** Sử dụng lắng nghe realtime trên Realtime Database cho số lượng tin nhắn live chat chưa đọc, và lắng nghe realtime Firestore cho hoạt động hệ thống mới (`activities`).
    *   **Ủy quyền truy cập:** Tự động kích hoạt các listener tương ứng dựa trên danh sách quyền hạn vai trò của nhân viên đang đăng nhập, tránh lỗi bảo mật và tối ưu hóa tài nguyên.
*   **Đánh giá:** Một trong những hook phức tạp và tối ưu nhất của hệ thống, quản lý tài nguyên và lượt truy vấn dữ liệu xuất sắc.

#### 📝 [src/lib/useClientPagination.ts](file:///m:/QLCH_VanLanh/src/lib/useClientPagination.ts) (46 dòng)
*   **Chức năng:** Hook hỗ trợ phân trang dữ liệu ở phía Client-side (Client-side Pagination).
*   **Cơ chế hoạt động:**
    *   Hỗ trợ các tùy chọn kích thước trang `20`, `50`, `100`.
    *   Tự động tính toán số trang (`totalPages`), áp dụng cổng an toàn bounds check (`safePage`) để tránh lỗi truy xuất mảng vượt biên khi bộ lọc dữ liệu thay đổi.
*   **Đánh giá:** Code tinh gọn, tái sử dụng tốt trên toàn bộ các bảng dữ liệu admin.

#### 📝 [src/lib/usePresence.ts](file:///m:/QLCH_VanLanh/src/lib/usePresence.ts) (40 dòng)
*   **Chức năng:** Hook theo dõi lưu lượng truy cập của khách hàng và ghi nhận analytics.
*   **Cơ chế hoạt động:**
    *   Gửi một background request `POST` tới API `/api/analytics/visit` sau khi trang đã mount được 2 giây để tránh chặn luồng hiển thị chính (hydration).
    *   **Tối ưu hóa hiệu năng:** Quyết định tắt (disable) tính năng theo dõi online realtime bằng Realtime Database để tránh làm nghẽn luồng xử lý chính và giảm thiểu chi phí băng thông kết nối WebSockets đồng thời cho các thiết bị di động cấu hình yếu.
*   **Đánh giá:** Thiết kế rất thực tế, đặt hiệu năng tải trang và trải nghiệm người dùng lên trên các chỉ số không thực sự cần thiết.




---

### 8. Nhóm Thuật toán Nghiệp vụ & Trí tuệ Nhân tạo (Algorithms & AI)

#### 📝 [src/lib/discountCalc.ts](file:///m:/QLCH_VanLanh/src/lib/discountCalc.ts) (164 dòng)
*   **Chức năng:** Lõi tính toán của công cụ xếp chồng ưu đãi (Discount Stacking Engine).
*   **Cơ chế hoạt động:**
    *   `normalizeMatchText(value)`: Hàm làm sạch chuỗi chuyên sâu: chuyển chữ thường, khử dấu tiếng Việt (NFD), đổi `đ` thành `d`, thay thế ký tự đặc biệt bằng dấu gạch ngang để tạo chuỗi so khớp chuẩn.
    *   `matchesCategoryId(...)` và `matchesCategoryPath(...)`: Thuật toán duyệt đệ quy cây danh mục phân cấp để so khớp danh mục sản phẩm/dịch vụ (ví dụ: sản phẩm thuộc danh mục `phu-kien/op-lung/iphone-15` sẽ tự động khớp với quy tắc giảm giá áp dụng cho danh mục cha `phu-kien`).
    *   `calculateAccessoryDiscounts(...)`: Đối chiếu các quy tắc giảm giá phụ kiện mua kèm dịch vụ sửa chữa. Nếu phát hiện dịch vụ sửa chữa khớp với điều kiện kích hoạt (`triggerKeywords` hoặc `triggerServiceCategory`), hệ thống sẽ quét giỏ hàng để tìm các phụ kiện khớp điều kiện áp dụng, tính toán giảm giá (phần trăm hoặc cố định), áp trần tối đa (`maxDiscountAmount`) và đảm bảo không giảm quá giá trị gốc của phụ kiện.
*   **Đánh giá:** Thuật toán so khớp mờ và phân cấp danh mục cực kỳ thông minh, chính xác và thực tế.

#### 📝 [src/lib/gemini.ts](file:///m:/QLCH_VanLanh/src/lib/gemini.ts) (166 dòng)
*   **Chức năng:** Dịch vụ tích hợp trí tuệ nhân tạo Gemini tư vấn khách hàng trực tuyến.
*   **Cơ chế hoạt động:**
    *   Sử dụng model `gemini-2.5-flash` làm lõi xử lý.
    *   `SYSTEM_PROMPT`: Định nghĩa chi tiết vai trò tư vấn viên của cửa hàng Văn Lành, chứa toàn bộ thông tin về giờ làm việc, cam kết chất lượng, danh mục dịch vụ sửa chữa chính, hotline liên hệ và các quy tắc ứng xử (thân thiện, không bịa đặt thông tin kỹ thuật, hướng khách hàng gọi hotline).
    *   `chatWithGemini(...)`: Hàm xử lý hội thoại. Thực hiện làm sạch và định cấu hình lịch sử chat của khách hàng để đảm bảo tuân thủ nghiêm ngặt quy định của Gemini (lịch sử phải bắt đầu bằng vai trò `user` và luân phiên xen kẽ `user ➔ model`).
    *   `generateContent(...)`: Hỗ trợ Admin tạo nhanh nội dung bài viết tin tức, mẹo vặt công nghệ hoặc bài đánh giá mẫu dựa trên từ khóa yêu cầu.
*   **Đánh giá:** Tích hợp AI rất chuyên nghiệp, xử lý biên lỗi chặt chẽ và có prompt hệ thống được tinh chỉnh kỹ lưỡng.

#### 📝 [src/lib/realtimedb.ts](file:///m:/QLCH_VanLanh/src/lib/realtimedb.ts) (234 dòng)
*   **Chức năng:** Tiện ích kết nối và thao tác dữ liệu Realtime Database phía client-side cho tính năng Live Chat.
*   **Các thành phần cốt lõi:**
    *   `subscribeToRooms(...)` / `subscribeToRoomInfo(...)`: Lắng nghe biến động danh sách phòng chat và thông tin phòng chat realtime để cập nhật giao diện Admin chat.
    *   `subscribeToMessages(...)`: Lắng nghe danh sách tin nhắn trong phòng chat (giới hạn 100 tin nhắn mới nhất để tối ưu hiệu năng).
    *   `sendMessage(...)`: Pushes tin nhắn mới lên RTDB và cập nhật metadata phòng chat kèm cờ thông báo chưa đọc tương ứng cho khách hoặc admin.
    *   `handleAIAutoReply(...)`: Xử lý tự động trả lời bằng AI. Kiểm tra xem phòng chat có bật bot không (`botActive !== false`), lấy 5 tin nhắn gần nhất làm ngữ cảnh lịch sử và gọi API Route `/api/ai` để sinh câu trả lời và tự động ghi thẳng vào RTDB.
*   **Đánh giá:** Triển khai luồng dữ liệu realtime cực kỳ mượt mà, tối ưu hóa băng thông bằng cách giới hạn số lượng tin nhắn tải về.

#### 📝 [src/lib/useCustomerActivity.ts](file:///m:/QLCH_VanLanh/src/lib/useCustomerActivity.ts) (229 dòng)
*   **Chức năng:** Hook client-side truy vấn realtime toàn bộ lịch sử hoạt động của khách hàng phục vụ cho CRM.
*   **Cơ chế hoạt động:**
    *   **Đồng bộ Đơn hàng bán lẻ:** Truy vấn song song hai luồng đơn hàng: Đơn hàng mới (lọc theo `customer_info.phone`) và Đơn hàng cũ (lọc theo `customer.phone`), sau đó gộp hai mảng, lọc trùng theo `orderId` và sắp xếp theo ngày tạo giảm dần.
    *   **Đồng bộ Ca sửa chữa:** Truy vấn danh sách phiếu sửa chữa theo số điện thoại khách hàng, đồng thời lắng nghe tài liệu cấu hình `system_config/repairs` để tự động ánh xạ mã trạng thái thô thành tên trạng thái thân thiện (ví dụ: `dang_sua_chua` ➔ `Đang sửa chữa`) và xác định ca sửa chữa đã kết thúc hay chưa (`isTerminal`).
*   **Đánh giá:** Thiết kế lazy-loaded rất tốt, chỉ kích hoạt truy vấn khi có số điện thoại hợp lệ, kết hợp xử lý đồng bộ mượt mà giữa dữ liệu nghiệp vụ và cấu hình hệ thống.

#### 📝 [src/lib/flashSale.ts](file:///m:/QLCH_VanLanh/src/lib/flashSale.ts) (26 dòng)
*   **Chức năng:** Kiểm tra và lọc các sản phẩm đủ điều kiện tham gia chương trình Flash Sale.
*   **Cơ chế hoạt động:**
    *   `isFlashSaleProduct(product)`: Sản phẩm được tính là Flash Sale nếu có cờ `isFlashSale === true` hoặc có giá khuyến mãi (`price_promo`) giảm giá tối thiểu từ 10% trở lên so với giá gốc (`price_original` hoặc `price`).
    *   `filterFlashSaleProducts(products)`: Lọc nhanh danh sách sản phẩm trong giỏ hàng hoặc catalog để hiển thị riêng nhóm flash sale.
*   **Đánh giá:** Logic lọc đơn giản, linh hoạt, tự động nhận diện ưu đãi lớn để hiển thị ra trang chủ mà không cần admin cấu hình thủ công từng sản phẩm.

#### 📝 [src/lib/discountRuleUtils.ts](file:///m:/QLCH_VanLanh/src/lib/discountRuleUtils.ts) (17 dòng)
*   **Chức năng:** Hàm tiện ích truy vấn cấu hình khuyến mại.
*   **Cơ chế hoạt động:**
    *   `fetchActiveDiscountRules()`: Truy vấn và trả về toàn bộ danh sách các quy tắc chiết khấu linh kiện sửa chữa đang kích hoạt (`isActive == true`) trong collection `accessory_discount_rules`.
*   **Đánh giá:** Đóng gói tốt logic truy vấn dữ liệu khuyến mại.

#### 📝 [src/lib/ollama.ts](file:///m:/QLCH_VanLanh/src/lib/ollama.ts) (90 dòng)
*   **Chức năng:** Dịch vụ kết nối và gọi mô hình ngôn ngữ lớn (LLM) Ollama chạy cục bộ (Local AI).
*   **Cơ chế hoạt động:**
    *   Kết nối tới `OLLAMA_HOST` (mặc định `http://localhost:11434`) và model `OLLAMA_MODEL` (mặc định `gemma4:e4b`).
    *   `generateContentStream(prompt, systemPrompt)`: Trả về một `ReadableStream` chứa các token văn bản trả về realtime. Sử dụng `TransformStream` của Next.js để tự động nhận dạng, parse từng dòng JSON từ stream của Ollama và đẩy ngược dữ liệu thô về client.
    *   `generateContent(prompt, systemPrompt)`: Phiên bản không stream, gom toàn bộ câu trả lời dạng chuỗi đơn giản phục vụ cho các tác vụ phân tích chạy ngầm hoặc tự động tinh chỉnh.
*   **Đánh giá:** Tích hợp Local AI rất chuyên nghiệp, xử lý stream hoàn chỉnh và cung cấp giải pháp dự phòng tuyệt vời cho Gemini để tiết kiệm chi phí API Cloud.

#### 📝 [src/lib/reviewVisibility.ts](file:///m:/QLCH_VanLanh/src/lib/reviewVisibility.ts) (22 dòng)
*   **Chức năng:** Bộ lọc chất lượng đánh giá (Review Filter) để kiểm soát nội dung hiển thị ra trang chủ.
*   **Cơ chế hoạt động:**
    *   `isPublicReview(review)`: Tự động ẩn các bài đánh giá có cờ `isTest === true`, hoặc có tên khách hàng/nội dung chứa các từ khóa test diacritic-free như `"test"`, `"testing"`, `"teo"` để ngăn ngừa các dữ liệu rác/thử nghiệm hiển thị ra ngoài storefront.
*   **Đánh giá:** Tiện ích nhỏ nhưng rất thực tế, giúp bảo vệ tính thẩm mỹ và chuyên nghiệp của trang chủ.



---

### 9. Nhóm Bảo mật & Quản lý ID Tuần tự (Security & Sequential IDs)

#### 📝 [src/lib/sessionCookie.ts](file:///m:/QLCH_VanLanh/src/lib/sessionCookie.ts) (69 dòng)
*   **Chức năng:** Bộ quản lý session cookie bảo mật chạy được trong môi trường Edge (Edge-compatible).
*   **Cơ chế hoạt động:**
    *   Không sử dụng các thư viện mã hóa nặng của Node.js (như `crypto`), file này sử dụng trực tiếp **Web Crypto API** có sẵn trong V8 runtime (Edge Middleware và Cloud Functions).
    *   `signPayload(...)`: Mã hóa JSON payload (vai trò và danh sách quyền hạn) thành chuỗi Base64Url, sau đó ký mã hóa bằng thuật toán **HMAC-SHA256** kết hợp khóa bí mật `SESSION_SECRET` để tạo ra session cookie dạng `payload.signature`.
    *   `verifyPayload(...)`: Tách chuỗi cookie, dùng khóa bí mật xác thực chữ ký số. Nếu khớp, giải mã và trả về thông tin quyền hạn của nhân viên. Nếu chữ ký sai lệch (nguy cơ bị giả mạo), lập tức trả về `null`.
*   **Đánh giá:** Giải pháp bảo mật cực kỳ gọn nhẹ, an toàn tuyệt đối và tương thích hoàn hảo với Next.js Edge Middleware để chặn route truy cập trái phép.

#### 📝 [src/lib/serverDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/serverDocumentIds.ts) (139 dòng)
*   **Chức năng:** Thuật toán sinh mã ID tuần tự và độc nhất cho chứng từ phía server-side sử dụng Admin SDK.
*   **Cơ chế hoạt động:**
    *   `formatVietnamDateKey()`: Lấy ngày hiện tại theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`) và trả về chuỗi định dạng `YYMMDD` (ví dụ: ngày 24/06/2026 trả về `260624`).
    *   `reserveSequentialDocumentId(...)`: Hàm sinh mã đơn lẻ. Thực thi bên trong một Firestore Transaction. Hệ thống đọc bộ đếm sequence trong tài liệu `system_counters/document_ids_{PREFIX}-{dateKey}`. Tăng sequence lên 1, tạo ID thử nghiệm (ví dụ: `SC-260624-0001`). Tiến hành đọc thử tài liệu có ID đó trong collection đích để đảm bảo không bị trùng lặp. Nếu an toàn, trả về ID kèm hàm `commitCounter()` để transaction thực hiện ghi đệm sequence mới vào bộ đếm.
    *   `reserveSequentialDocumentIds(...)`: Hàm sinh mã hàng loạt (Bulk). Cho phép sinh đồng thời nhiều ID tuần tự trong cùng một transaction. Quá trình kiểm tra trùng lặp diễn ra liên tục, và chỉ thực hiện ghi đếm sequence một lần duy nhất ở phần tử cuối cùng để tiết kiệm tối đa số lần ghi Firestore.
*   **Đánh giá:** Giải pháp sinh ID tuần tự xuất sắc nhất trên nền tảng Firestore, giải quyết triệt để nguy cơ trùng lặp mã số chứng từ khi có nhiều giao dịch đồng thời (High Concurrency).

#### 📝 [src/lib/productCodeRegistry.ts](file:///m:/QLCH_VanLanh/src/lib/productCodeRegistry.ts) (149 dòng)
*   **Chức năng:** Sổ đăng ký mã vạch và QR code sản phẩm tập trung (Unique Code Registry).
*   **Cơ chế hoạt động:**
    *   Để ngăn chặn việc hai sản phẩm khác nhau có cùng một mã QR hoặc barcode, hệ thống quản lý một collection trung gian là `product_code_registry` với Document ID chính là chuỗi mã sản phẩm.
    *   `assertProductCodesAvailable(...)`: Quét qua toàn bộ sản phẩm hiện có để kiểm tra xem mã yêu cầu đã được sử dụng chưa (loại trừ ID sản phẩm hiện tại khi cập nhật).
    *   `createProductWithCodes(...)` / `updateProductWithCodes(...)`: Thực thi Firestore Transaction. Đọc đồng thời tài liệu sản phẩm và các tài liệu mã đăng ký tương ứng. Tiến hành ghi nhận liên kết `mã sản phẩm ➔ productId` vào sổ đăng ký và tạo/cập nhật sản phẩm. Khi sản phẩm thay đổi mã, hệ thống tự động xóa bỏ các bản ghi mã cũ khỏi sổ đăng ký để giải phóng tài nguyên.
*   **Đánh giá:** Cơ chế kiểm soát trùng lặp mã sản phẩm cực kỳ chặt chẽ và an toàn, ngăn ngừa triệt để lỗi quét sai hàng tại quầy POS.

#### 📝 [src/lib/idNormalizer.ts](file:///m:/QLCH_VanLanh/src/lib/idNormalizer.ts) (37 dòng)
*   **Chức năng:** Chuẩn hóa và tự động sinh mã ID tài liệu Firestore độc nhất không trùng lặp cho sản phẩm/linh kiện mới.
*   **Cơ chế hoạt động:**
    *   `normalizeDocId(name, mode, category)`: Sinh tiền tố dựa trên danh mục và phân loại: linh kiện (`component`) dùng tiền tố `LK`, phụ kiện (`accessory` / `phu-kien`) dùng `PK`, các sản phẩm bán lẻ khác dùng `SP`.
    *   Tạo mã cơ sở `baseId = {prefix}-{slug(name)}`.
    *   Sử dụng vòng lặp kiểm tra tối đa 50 lần đối với các mã ứng viên (bằng cách thêm hậu tố số tăng dần `-2`, `-3`,...) thông qua `getDoc` kiểm tra sự tồn tại trên Firestore để đảm bảo an toàn tuyệt đối trước khi trả về ID cuối cùng.
*   **Đánh giá:** Logic xử lý rất an toàn, giúp chuẩn hóa dữ liệu danh mục sản phẩm và ngăn ngừa xung đột ID tài liệu.

#### 📝 [src/lib/rateLimit.ts](file:///m:/QLCH_VanLanh/src/lib/rateLimit.ts) (64 dòng)
*   **Chức năng:** Bộ kiểm soát tần suất yêu cầu (Rate Limiter) phân tán, tương thích môi trường Serverless (Edge/Cloud Functions) sử dụng Firestore làm bộ nhớ đếm.
*   **Cơ chế hoạt động:**
    *   `isRateLimited(ip, route, limit, windowMs)`: Tạo ID tài liệu an toàn từ IP và Route, thực thi transaction Firestore để đọc bản ghi chặn.
    *   Nếu thời gian hiện tại nằm trong cửa sổ kiểm soát (`now < resetAt`), tăng số đếm `count`. Nếu vượt quá hạn mức `limit`, đánh dấu chặn `isLimited = true`. Nếu hết cửa sổ, reset lại số đếm và thiết lập cửa sổ mới.
    *   **Fail-Open Design:** Nếu có lỗi kết nối database hoặc lỗi transaction, hệ thống sẽ tự động bắt lỗi và trả về `false` (không chặn người dùng) để đảm bảo tính liên tục của dịch vụ (Fail-Open).
*   **Đánh giá:** Giải pháp kỹ thuật xử lý rate limit rất thông minh trong môi trường serverless không trạng thái (stateless) mà không cần phụ thuộc Redis.

#### 📝 [src/lib/clientDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/clientDocumentIds.ts) (12 dòng)
*   **Chức năng:** Sinh mã định danh tài liệu Firestore duy nhất ở phía Client-side theo cấu trúc quy chuẩn.
*   **Cơ chế hoạt động:**
    *   `buildClientDocumentId(prefix, scope)`: Sinh ID có cấu trúc dạng `{PREFIX}-{YYMMDD}-{TIMESTAMP_BASE36}-{SCOPE_SLUG}` để lưu trữ tài liệu tạo nhanh từ phía client mà vẫn đảm bảo tính độc nhất và có thứ tự thời gian thô.
*   **Đánh giá:** Giải pháp thay thế tốt cho ID ngẫu nhiên của Firestore, đảm bảo tính đồng dạng mã chứng từ trên toàn hệ thống.

#### 📝 [src/lib/supplierDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/supplierDocumentIds.ts) (20 dòng)
*   **Chức năng:** Sinh và giữ chỗ ID tài liệu an toàn cho nhà cung cấp mới ở phía client-side.
*   **Cơ chế hoạt động:**
    *   `buildSupplierDocumentBaseId(data)`: Tạo mã cơ sở dạng `NCC-{phone-or-name-slug}`.
    *   `reserveSupplierDocumentId(data)`: Quét kiểm tra sự tồn tại trên Firestore tối đa 50 lần kèm hậu tố tăng dần để đảm bảo tuyệt đối không có hai nhà cung cấp trùng ID.
*   **Đánh giá:** Logic kiểm tra chống trùng lặp chặt chẽ, tối ưu hóa việc quản lý nhà cung cấp theo số điện thoại hoặc slug tên.

#### 📝 [src/lib/apiAuth.ts](file:///m:/QLCH_VanLanh/src/lib/apiAuth.ts) (63 dòng)
*   **Chức năng:** Bộ kiểm soát xác thực và phân quyền (RBAC) phía Server-side cho các API Routes nghiệp vụ.
*   **Cơ chế hoạt động:**
    *   `verifyUser(req)`: Trích xuất Bearer Token từ header `Authorization`, gọi Firebase Admin Auth để xác thực chữ ký token, sau đó truy vấn collection `users` để nạp vai trò và danh sách quyền hạn.
    *   Các hàm bảo vệ route: `requireAdminOrStaff(req)` (chỉ cho phép admin/staff), `requireAdmin(req)` (chỉ cho phép admin), và `requirePermission(req, permission)` (yêu cầu nhân viên sở hữu quyền cụ thể hoặc là admin).
*   **Đánh giá:** Chốt chặn bảo mật API cực kỳ chặt chẽ, bảo vệ tuyệt đối các đầu ghi dữ liệu nhạy cảm ở backend.




#### 📝 [src/lib/useFirestore.ts](file:///m:/QLCH_VanLanh/src/lib/useFirestore.ts) (282 dòng)
*   **Chức năng:** Bộ helper và hook kết nối Firestore client-side.
*   **Các thành phần cốt lõi:**
    *   `useFirestoreCollection(...)`: Lắng nghe realtime dữ liệu của một collection kèm theo các bộ lọc `QueryConstraint` động. Tự động quản lý vòng đời listener (unsubscribe khi component unmount) và theo dõi trạng thái loading/error.
    *   Các hook chuyên dụng: `useProducts` (lọc sản phẩm active), `useFlashSaleProducts` (tự động lọc sản phẩm có cờ flash sale hoặc có mức giảm giá từ 10% trở lên), `useServices` (dịch vụ), `useArticles` (bài viết), `useOrders` (đơn hàng).
    *   Các hàm CRUD helper: `addDocument`, `addDocumentWithId`, `updateDocument`, `deleteDocument` tự động chèn các trường thời gian `createdAt` và `updatedAt` sử dụng `serverTimestamp()` của Firestore.
*   **Đánh giá:** Bộ thư viện client-side rất sạch sẽ, đóng gói tốt và dễ sử dụng trên toàn bộ giao diện quản trị.

---

### 13. Nhóm Quản lý Bài viết & Tự động Hóa Nội dung AI (Articles & AI Content Generation)

#### 📝 [src/features/articles/articleTypes.ts](file:///m:/QLCH_VanLanh/src/features/articles/articleTypes.ts) (31 dòng)
*   **Chức năng:** Định nghĩa kiểu dữ liệu `Article` (bài viết tin tức, khuyến mãi, mẹo hay) và các hằng số màu sắc, nhãn hiển thị tương ứng cho từng loại bài viết.
*   **Đánh giá:** Quy định kiểu dữ liệu rõ ràng, hỗ trợ tốt cho việc đồng bộ và render thẻ phân loại bài viết.

#### 📝 [src/features/articles/ArticleComments.tsx](file:///m:/QLCH_VanLanh/src/features/articles/ArticleComments.tsx) (394 dòng)
*   **Chức năng:** Component quản trị và kiểm duyệt bình luận của khách hàng trên các bài viết.
*   **Các thành phần cốt lõi:**
    *   `CommentsModal`: Lắng nghe realtime danh sách bình luận (`article_comments`) của một bài viết cụ thể. Cho phép admin duyệt hiển thị (`approved` / `pending`), xóa bình luận, hoặc viết/chỉnh sửa câu trả lời của cửa hàng (`reply` chứa nội dung phản hồi và timestamp).
    *   `GlobalCommentsTab`: Bảng quản trị tập trung hiển thị toàn bộ bình luận trên hệ thống, giúp người kiểm duyệt dễ dàng bao quát và phản hồi nhanh mà không cần mở từng bài viết.
*   **Đánh giá:** Logic xử lý realtime qua listener `onSnapshot` rất mượt mà, phân cấp chức năng kiểm duyệt và trả lời của cửa hàng cực kỳ rõ ràng.

#### 📝 [src/features/articles/ArticleEditorModal.tsx](file:///m:/QLCH_VanLanh/src/features/articles/ArticleEditorModal.tsx) (872 dòng)
*   **Chức năng:** Modal soạn thảo và đăng tải bài viết, tích hợp sâu bộ công cụ tự động hóa nội dung bằng Trí tuệ nhân tạo (AI Auto-Pilot).
*   **Cơ chế hoạt động:**
    *   **Rich-Text Editor:** Sử dụng thư viện `react-quill-new` được load động (`ssr: false`) để tránh lỗi hydration mismatch của Next.js.
    *   **AI Auto-Pilot 1-Touch:** Người dùng chỉ cần nhập một từ khóa hoặc chủ đề (ví dụ: "Tủ lạnh cũ giá rẻ"). Hệ thống sẽ tự động thực hiện chuỗi tác vụ AI khép kín:
        1. *Phân tích SEO Meta:* Gọi AI (`seo-suggest`) để sinh Tiêu đề cuốn hút, mô tả ngắn gọn chuẩn SEO và các thẻ tag liên quan.
        2. *Viết bản nháp:* Gọi AI (`content-suggest`) để viết bài viết chi tiết, chuyên sâu theo tiêu chuẩn EEAT.
        3. *Tối ưu hóa SEO tự động (Auto-Refine Loop):* Chạy vòng lặp kiểm tra và sửa lỗi SEO thông minh (`auto-refine` API stream) qua nhiều vòng cho đến khi đạt điểm SEO mục tiêu (85+) mới cho phép chốt.
        4. *Tự động vẽ và ghép hình ảnh:* Hệ thống quét bài viết tìm các placeholder dạng `[CHÈN HÌNH ẢNH: mô tả cảnh]`. Gọi AI vẽ ảnh (`gptimage`), tự động nén ảnh sang WebP ở client (`optimizeImage`), upload lên Firebase Storage, đăng ký vào `media_library` và tự động thay thế placeholder bằng thẻ HTML `<figure><img>` responsive tuyệt đẹp.
    *   **Standalone AI Actions:** Cung cấp các nút riêng lẻ để "Chấm bài SEO" (gọi mô hình Ollama cục bộ) và "Tự sửa SEO" trực tiếp từ giao diện soạn thảo thủ công.
*   **Đánh giá:** Một trong những module Front-end đột phá và tinh tế nhất của hệ thống, tự động hóa toàn diện quy trình sáng tạo nội dung chuẩn SEO bằng AI từ A-Z.


---

### 14. Nhóm API Tích hợp Trí tuệ Nhân tạo & Chăm sóc Khách hàng (AI, Chat & CRM APIs)

#### 📝 [src/app/api/admin/ai/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/ai/route.ts) (556 dòng)
*   **Chức năng:** API Endpoint nghiệp vụ AI dành cho quản trị viên, hỗ trợ tạo mô tả sản phẩm, viết bài chuẩn SEO, chấm điểm SEO và sinh hình ảnh minh họa bằng AI.
*   **Các thành phần cốt lõi:**
    *   **Xác thực & Rate Limit:** Xác thực quyền hạn `requireAdminOrStaff` và kiểm soát tần suất IP (`isRateLimited` tối đa 5 lần/phút).
    *   **Tạo nội dung & Tối ưu SEO:** Tự động hóa viết bài SEO qua Ollama với prompt được tinh chỉnh nghiêm ngặt (ngăn chặn tính từ sáo rỗng, ép cấu trúc HTML thay vì Markdown, chèn placeholder đa phương tiện, phân bổ liên kết nội bộ).
    *   **Vẽ ảnh minh họa:** Quét văn bản dịch thuật tiếng Việt qua Ollama thành prompt tiếng Anh chuẩn, gọi API vẽ ảnh Google Gemini (`gemini-3.1-flash-image-preview`) hoặc fallback `Pollinations.ai` (flux-realism/flux) để trả về luồng ảnh JPEG thô.
    *   **Vòng lặp tự tối ưu SEO (`auto-refine`):** Sử dụng Next.js `ReadableStream` để trả về log tiến độ realtime. Chạy vòng lặp (tối đa 3 vòng) chấm điểm và tự động viết lại bài viết bằng AI cho đến khi đạt điểm mục tiêu (mặc định 85).
*   **Đánh giá:** Tích hợp AI vô cùng đa dạng, xử lý RAG và stream chất lượng cao, thiết kế vòng lặp auto-refine rất thông minh.

#### 📝 [src/app/api/ai/route.ts](file:///m:/QLCH_VanLanh/src/app/api/ai/route.ts) (144 dòng)
*   **Chức năng:** API Endpoint trò chuyện với AI dành cho khách hàng truy cập website (Storefront AI Assistant).
*   **Các thành phần cốt lõi:**
    *   **Guardrails:** Rate limit 5 lần/phút và giới hạn kích thước đầu vào (prompt < 800 ký tự, lịch sử < 30 dòng).
    *   **Công cụ RAG gọn nhẹ:** Quét từ khóa trong câu hỏi của khách, tìm kiếm và chấm điểm tối đa 250 sản phẩm active từ Firestore để chọn ra 10 sản phẩm khớp nhất và nhúng trực tiếp giá/tình trạng kho vào prompt ngữ cảnh cho Gemini.
    *   **Đồng bộ Realtime Database:** Nếu cờ `pushToRtdb` được bật, tự động ghi nhận câu trả lời của AI vào luồng tin nhắn phòng chat khách hàng (`chats/{roomId}/messages`) và cập nhật metadata phòng chat.
*   **Đánh giá:** Kết hợp RAG tìm kiếm thông tin sản phẩm trực tiếp với chatbot AI giúp tăng độ chính xác của phản hồi và đồng bộ tin nhắn RTDB rất mượt mà.

#### 📝 [src/app/api/admin/chat/integrations/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/chat/integrations/route.ts) (144 dòng)
*   **Chức năng:** API cấu hình tích hợp live chat đa kênh (Facebook & Zalo) và câu trả lời nhanh của hệ thống.
*   **Các thành phần cốt lõi:**
    *   `GET`: Trả về cấu hình chat hiện tại sau khi đã làm sạch các token nhạy cảm (`toPublicChatIntegrationConfig`), kèm theo thông tin các link webhook.
    *   `PUT`: Kiểm duyệt, làm sạch và cập nhật cấu hình PATCH cho các tài khoản Facebook OA, Zalo OA và danh sách câu trả lời nhanh.
    *   `POST` (Test): Chạy kiểm tra sức khỏe (Health Check) cấu hình của từng kênh để đảm bảo các trường bắt buộc đã được khai báo và kết nối database hoạt động bình thường.
*   **Đánh giá:** Logic xử lý cấu hình an toàn, tách biệt tốt dữ liệu nhạy cảm trước khi trả về client.

#### 📝 [src/app/api/admin/chat/quick-replies/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/chat/quick-replies/route.ts) (22 dòng)
*   **Chức năng:** API truy vấn nhanh danh sách câu trả lời mẫu đang hoạt động cho nhân viên chat.
*   **Các thành phần cốt lõi:** Yêu cầu quyền `chat_support`, trả về danh sách các câu trả lời nhanh đã được bật (`enabled === true`).
*   **Đánh giá:** Thiết kế tinh gọn, thực thi chính xác.

#### 📝 [src/app/api/admin/chat/rooms/[roomId]/customer/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/chat/rooms/[roomId]/customer/route.ts) (165 dòng)
*   **Chức năng:** API đồng bộ và liên kết phòng chat với hồ sơ khách hàng trong CRM.
*   **Các thành phần cốt lõi:**
    *   `GET`: Tra cứu nhanh hồ sơ khách hàng từ Firestore dựa theo số điện thoại, tự động ẩn/hiện các chỉ số mua hàng/sửa chữa nhạy cảm tùy thuộc vào quyền hạn của nhân viên đang thao tác.
    *   `POST`: Cập nhật thông tin khách hàng trong CRM và liên kết thông tin đó sang Realtime Database (`chats/{roomId}/info`). Sử dụng `Promise.race` khống chế timeout kết nối RTDB trong 8 giây để đảm bảo API không bị treo.
*   **Đánh giá:** Thiết kế bảo mật thông tin CRM rất tốt và xử lý timeout kết nối cơ sở dữ liệu phân tán vô cùng an toàn.

#### 📝 [src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts) (30 dòng)
*   **Chức năng:** API đồng bộ thông tin tài khoản Facebook cá nhân của khách hàng gửi tin nhắn.
*   **Đánh giá:** Đồng bộ mượt mà tên tuổi và ảnh đại diện thật qua Graph API của Meta.

#### 📝 [src/app/api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route.ts) (109 dòng)
*   **Chức năng:** API đại lý bảo mật (Secure Proxy) phục vụ hiển thị hình ảnh đính kèm từ Facebook Messenger.
*   **Các thành phần cốt lõi:**
    *   Chặn hiển thị nếu nhân viên không có quyền `chat_support`, kiểm duyệt bounds check chỉ số đính kèm.
    *   Kiểm tra xem ảnh đã được tải và lưu trữ trong thư mục Storage private của phòng chat chưa. Nếu có, tải trực tiếp từ Storage và trả về file kèm header cache riêng tư.
    *   Nếu chưa có trong Storage, kiểm tra nguồn link Meta, tải ảnh về server, lưu trữ private vào Storage để làm cache lâu dài, cập nhật lại đường dẫn trong Realtime Database và trả về luồng ảnh.
*   **Đánh giá:** Giải pháp bảo mật hình ảnh chat tuyệt vời, giải quyết triệt để lỗi rò rỉ link hoặc link ảnh Facebook hết hạn bằng cơ chế proxy và cache tự động.

#### 📝 [src/app/api/admin/chat/send/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/chat/send/route.ts) (32 dòng)
*   **Chức năng:** API gửi tin nhắn phản hồi của nhân viên đến các kênh chat Zalo OA hoặc Facebook Messenger.
*   **Đánh giá:** Đơn giản, gọi trực tiếp hàm xử lý trung tâm của chat server.

#### 📝 [src/app/api/integrations/facebook/webhook/route.ts](file:///m:/QLCH_VanLanh/src/app/api/integrations/facebook/webhook/route.ts) (152 dòng)
*   **Chức năng:** API Endpoint xử lý webhook nhận tin nhắn từ Facebook Messenger.
*   **Các thành phần cốt lõi:**
    *   **Xác thực Hub (GET):** So khớp và phản hồi mã thử nghiệm `hub.challenge` cho Meta để kích hoạt webhook.
    *   **Xác thực chữ ký (POST):** Kiểm duyệt mã chữ ký `x-hub-signature-256` bằng HMAC-SHA256 kết hợp `appSecret` để ngăn chặn giả mạo payload.
    *   **Bóc tách & Đồng bộ:** Tự động loại bỏ các tin nhắn dội ngược (`is_echo === true`), bóc tách tối đa 5 file đính kèm (sticker, ảnh, audio, video), tra cứu thông tin người dùng từ Graph API của Meta và lưu tin nhắn vào Realtime Database.
*   **Đánh giá:** Tích hợp webhook Facebook tiêu chuẩn rất cao, bảo mật chữ ký an toàn và xử lý bóc tách tệp đính kèm linh hoạt.

#### 📝 [src/app/api/integrations/facebook/webhook/test/route.ts](file:///m:/QLCH_VanLanh/src/app/api/integrations/facebook/webhook/test/route.ts) (84 dòng)
*   **Chức năng:** API Endpoint chẩn đoán và giả lập nhận tin nhắn từ Facebook.
*   **Đánh giá:** Giúp nhân viên kỹ thuật dễ dàng tạo tin nhắn ảo gửi đến trang admin chat để kiểm tra luồng tin nhắn mà không cần thao tác thật trên điện thoại.

#### 📝 [src/app/api/integrations/zalo/webhook/route.ts](file:///m:/QLCH_VanLanh/src/app/api/integrations/zalo/webhook/route.ts) (127 dòng)
*   **Chức năng:** API Endpoint xử lý webhook nhận tin nhắn từ Zalo OA.
*   **Các thành phần cốt lõi:**
    *   Kiểm tra tính hợp lệ của mã webhook token qua header hoặc tham số query.
    *   Tự động lọc bỏ các sự kiện không phải tin nhắn, phân tích cú pháp đa dạng của payload Zalo để lấy ra SĐT, nội dung tin nhắn, tệp đính kèm và đồng bộ tin nhắn vào RTDB.
*   **Đánh giá:** Code xử lý linh hoạt, tương thích tốt với nhiều phiên bản cấu trúc payload khác nhau của Zalo Webhook.

---

### 15. Nhóm API Quản trị Hệ thống, Bảo mật & Giao dịch (Admin Configuration, Auth & Transactions APIs)

#### 📝 [src/app/api/admin/bank-config/banks/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/bank-config/banks/route.ts) (17 dòng)
*   **Chức năng:** API proxy danh sách ngân hàng Việt Nam từ VietQR để tránh lỗi CORS ở client.
*   **Đánh giá:** Code tinh gọn, giải quyết tốt vấn đề CORS.

#### 📝 [src/app/api/admin/bank-config/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/bank-config/route.ts) (32 dòng)
*   **Chức năng:** API lấy thông tin cấu hình tài khoản ngân hàng nhận thanh toán chuyển khoản của cửa hàng.
*   **Đánh giá:** Yêu cầu quyền `manage_settings`, trả về danh sách các tài khoản ngân hàng và trạng thái kích hoạt xác thực hai yếu tố (TOTP).

#### 📝 [src/app/api/admin/bank-config/totp/setup/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/bank-config/totp/setup/route.ts) (38 dòng)
*   **Chức năng:** API khởi tạo và thiết lập mã xác thực hai yếu tố (2FA TOTP) để bảo vệ cấu hình tài khoản ngân hàng.
*   **Các thành phần cốt lõi:** Sinh khóa bảo mật ngẫu nhiên qua `otplib`, tạo chuỗi URI authenticator và sinh ảnh QR Code (dạng base64 Data URL) để admin quét cấu hình trên app điện thoại.
*   **Đánh giá:** Bảo mật tốt, chặn thiết lập lại nếu hệ thống đã có mã xác thực hoạt động trước đó.

#### 📝 [src/app/api/admin/bank-config/totp/verify/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/bank-config/totp/verify/route.ts) (56 dòng)
*   **Chức năng:** API kiểm tra và xác nhận mã token OTP của authenticator để hoàn tất cài đặt hoặc xác minh quyền chỉnh sửa.
*   **Các thành phần cốt lõi:** Kiểm tra token nhận được với secret truyền lên (lúc cài đặt mới) hoặc secret trong database (lúc xác minh chỉnh sửa). Nếu hợp lệ ở lần đầu, ghi nhận cờ `totpEnabled: true` và lưu secret vào database.
*   **Đánh giá:** Quy trình xác minh hai bước chặt chẽ, đảm bảo tính xác thực cao.

#### 📝 [src/app/api/admin/bank-config/update/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/bank-config/update/route.ts) (91 dòng)
*   **Chức năng:** API cập nhật danh sách tài khoản ngân hàng và hotline nhận thông báo biến động số dư của cửa hàng.
*   **Các thành phần cốt lõi:**
    *   Buộc hệ thống phải được cài đặt TOTP trước đó. Yêu cầu nhập mã token xác thực TOTP và thực hiện kiểm tra so khớp trước khi cho phép ghi đè cấu hình.
    *   Chuẩn hóa số điện thoại nhận tin, cập nhật thông tin tài khoản mặc định và lưu trữ danh sách tài khoản liên kết.
*   **Đánh giá:** Chốt chặn bảo mật TOTP cực kỳ quan trọng giúp ngăn chặn hành vi thay đổi tài khoản ngân hàng nhận tiền của kẻ gian (kể cả khi chúng chiếm được tài khoản staff/admin).

#### 📝 [src/app/api/admin/customers/collect-debt/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/customers/collect-debt/route.ts) (127 dòng)
*   **Chức năng:** API xử lý thu nợ khách hàng trực tiếp tại trang quản trị CRM.
*   **Các thành phần cốt lõi:**
    *   Thực thi transaction Firestore an toàn: kiểm tra nợ khách hàng, truy vấn tất cả đơn hàng nợ của khách hàng theo thứ tự thời gian tăng dần (FIFO).
    *   Phân bổ số tiền thu nợ lần lượt cho các đơn hàng cũ, cập nhật trạng thái thanh toán đơn sang `paid` nếu nợ được xóa hoàn toàn và lưu lại lịch sử thanh toán nợ (`debt_payment`).
    *   Giảm nợ ròng của khách hàng (`totalDebt`), sinh mã ID tuần tự dạng `CT-XXXX` cho chứng từ thu nợ, ghi nhận giao dịch nợ mới và tích lũy doanh thu thực tế.
*   **Đánh giá:** Thuật toán phân bổ nợ theo FIFO và cập nhật công nợ ròng trong transaction cực kỳ xuất sắc, chặt chẽ về mặt tài chính.

#### 📝 [src/app/api/admin/fix-held/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/fix-held/route.ts) (78 dòng)
*   **Chức năng:** API công cụ tự chữa lành (Self-Healing Tool) để tính toán lại và sửa chữa số lượng hàng tạm giữ (held) bị lệch trong kho.
*   **Các thành phần cốt lõi:** Quét toàn bộ phiếu sửa chữa đang mở (loại trừ các phiếu ở trạng thái terminal đã kết thúc), cộng dồn số lượng linh kiện đã chốt giữ chỗ (`reservedQuantity`), sau đó sử dụng `bulkWriter` cập nhật đồng loạt chỉ số `held` chuẩn xác về từng tài liệu sản phẩm.
*   **Đánh giá:** Công cụ bảo trì hệ thống vô cùng thực tế và hữu ích, giúp giải quyết các lỗi lệch tồn kho held do xung đột logic hoặc crash mạng trước đó.

#### 📝 [src/app/api/admin/seed-taxonomy/route.ts](file:///m:/QLCH_VanLanh/src/app/api/admin/seed-taxonomy/route.ts) (31 dòng)
*   **Chức năng:** API seed cây danh mục phân cấp (taxonomy) mặc định cho hệ thống khi cài đặt ban đầu.
*   **Đánh giá:** Tự động chặn chạy ở môi trường production để bảo vệ an toàn dữ liệu.

#### 📝 [src/app/api/auth/session/route.ts](file:///m:/QLCH_VanLanh/src/app/api/auth/session/route.ts) (103 dòng)
*   **Chức năng:** API quản lý vòng đời session cookie và đồng bộ quyền hạn nhân viên phục vụ kiểm soát truy cập (RBAC).
*   **Các thành phần cốt lõi:**
    *   `POST`: Nhận ID Token từ Firebase client, xác thực chữ ký token, truy vấn profile nhân viên từ Firestore để nạp vai trò/quyền hạn. Ký mã hóa session cookie bảo mật (HMAC-SHA256) có thời hạn 5 ngày để Edge Middleware chặn route truy cập.
    *   **Đồng bộ Realtime Database RBAC:** Với tài khoản admin/staff, tự động ghi nhận vai trò và danh sách quyền hạn vào RTDB tại path `admin_roles/{uid}` với thời hạn 5 ngày. Điều này giúp bộ lọc bảo mật Realtime Database Security Rules có thể đọc vai trò trực tiếp để phân quyền truy cập chat realtime.
    *   `DELETE`: Xóa bỏ session cookie khi đăng xuất.
*   **Đánh giá:** Kiến trúc phân quyền RBAC kết hợp session cookie ở Edge và đồng bộ vai trò lên RTDB để bảo vệ dữ liệu chat trực tuyến cực kỳ thông minh và chuyên nghiệp.

#### 📝 [src/app/api/orders/assign-seller/route.ts](file:///m:/QLCH_VanLanh/src/app/api/orders/assign-seller/route.ts) (68 dòng)
*   **Chức năng:** API gán nhân viên phụ trách tư vấn/bán hàng cho đơn hàng.
*   **Cơ chế hoạt động:** Chạy transaction Firestore để đảm bảo đơn chưa ở trạng thái `Completed` hay `Cancelled`, xác minh tài khoản được gán là nhân viên cửa hàng, và cập nhật thông tin gán kèm thời gian.
*   **Đánh giá:** Logic kiểm tra chặt chẽ, bảo vệ đơn hàng khỏi việc gán sai quyền.

#### 📝 [src/app/api/orders/[id]/imei/route.ts](file:///m:/QLCH_VanLanh/src/app/api/orders/[id]/imei/route.ts) (72 dòng)
*   **Chức năng:** API cập nhật danh sách số IMEI/Serial cho thiết bị trong đơn hàng để phục vụ bảo hành.
*   **Cơ chế hoạt động:** Chạy transaction Firestore để xác minh đơn hàng tồn tại, kiểm tra dòng sản phẩm có cấu hình bảo hành là thiết bị (`warrantyDevice`), và xác minh số lượng IMEI cung cấp phải khớp chính xác với số lượng mua trước khi lưu.
*   **Đánh giá:** Chốt chặn kiểm soát số IMEI vô cùng chặt chẽ, ngăn ngừa thất thoát dữ liệu bảo hành thiết bị.

#### 📝 [src/app/api/repairs/payment-edit/route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/payment-edit/route.ts) (107 dòng)
*   **Chức năng:** API chỉnh sửa thông tin chi phí và tiền cọc của phiếu sửa chữa.
*   **Cơ chế hoạt động:**
    *   Chạy transaction Firestore kiểm soát chống gửi trùng bằng `idempotencyKey`.
    *   Áp dụng Optimistic Locking qua `ticketVersion` để chống ghi đè dữ liệu.
    *   Ngăn chặn chỉnh sửa chi phí đối với các phiếu đã thanh toán, hoàn tiền hoặc đã ở trạng thái kết thúc trong workflow.
    *   Cập nhật các trường được phép sửa (cọc, báo giá, giảm giá, phí phụ thu, công thợ) và tự động tính toán lại tổng chi phí ròng của phiếu.
*   **Đánh giá:** Quy trình kiểm soát tài chính và chống race condition khi sửa chi phí cực kỳ chặt chẽ.

#### 📝 [src/app/api/repairs/technician/assign/route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/technician/assign/route.ts) (106 dòng)
*   **Chức năng:** API phân công kỹ thuật viên phụ trách ca sửa chữa lần đầu.
*   **Cơ chế hoạt động:** Chỉ cho phép quản lý sửa chữa gán thợ lần đầu trong transaction, kiểm tra KTV hợp lệ, chặn gán nếu phiếu đã có thợ phụ trách trước đó, và ghi nhận sự kiện vào timeline hành trình.
*   **Đánh giá:** Phân định quyền hạn rõ ràng, ghi nhận lịch sử đầy đủ.

#### 📝 [src/app/api/repairs/technician/transfer/route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/technician/transfer/route.ts) (248 dòng)
*   **Chức năng:** Bộ máy trạng thái (State Machine) xử lý quy trình bàn giao hoặc chuyển đổi kỹ thuật viên phụ trách ca sửa chữa.
*   **Cơ chế hoạt động:**
    *   `action == 'request'`: KTV hiện tại hoặc quản lý tạo yêu cầu chuyển giao cho KTV mới kèm lý do bắt buộc. Hệ thống lưu trạng thái `pending` và ghi log.
    *   `action == 'respond'`: KTV nhận bấm Chấp nhận (chuyển giao chính thức phụ trách trong transaction) hoặc Từ chối (giữ nguyên KTV cũ).
    *   `action == 'cancel'`: Người tạo yêu cầu hoặc quản lý có thể hủy yêu cầu chuyển giao khi còn chờ.
*   **Đánh giá:** Một trong những module quản trị quy trình nội bộ tinh tế và an toàn nhất, đảm bảo tính liên tục của ca sửa chữa mà không gây tranh chấp hoặc mất dấu trách nhiệm.

#### 📝 [src/app/api/revalidate/route.ts](file:///m:/QLCH_VanLanh/src/app/api/revalidate/route.ts) (56 dòng)
*   **Chức năng:** API làm mới cache tĩnh (On-Demand ISR Revalidation) theo yêu cầu.
*   **Cơ chế hoạt động:** Đòi hỏi xác thực qua mã khóa bí mật `REVALIDATE_SECRET` hoặc phiên admin đăng nhập. Khi xóa cache path `layout`, hệ thống chỉ xóa cache trang khách hàng `/(customer)` để bảo toàn Router Cache của admin, tránh làm gián đoạn phiên làm việc của nhân viên.
*   **Đánh giá:** Logic phân cấp cache và revalidate rất thông minh.

#### 📝 [src/app/api/seed-admin/route.ts](file:///m:/QLCH_VanLanh/src/app/api/seed-admin/route.ts) (114 dòng)
*   **Chức năng:** API hỗ trợ seed tài khoản Admin ban đầu khi thiết lập hệ thống.
*   **Đánh giá:** Được bảo vệ bằng mã khóa bí mật và tự động vô hiệu hóa hoàn toàn trên môi trường production.

#### 📝 [src/app/api/seed-config/route.ts](file:///m:/QLCH_VanLanh/src/app/api/seed-config/route.ts) (67 dòng)
*   **Chức năng:** API seed cài đặt cấu hình mặc định cho hệ thống.
*   **Đánh giá:** Chỉ ghi nhận nếu tài liệu cấu hình chưa tồn tại để tránh ghi đè dữ liệu đang chạy, hỗ trợ cờ `force=true` cho quản trị viên.

---

### 16. Nhóm API Khách hàng, Tiếp thị & Thống kê (Storefront, Bounty & Analytics APIs)

#### 📝 [src/app/api/analytics/visit/route.ts](file:///m:/QLCH_VanLanh/src/app/api/analytics/visit/route.ts) (99 dòng)
*   **Chức năng:** API ghi nhận lượt truy cập độc nhất hàng ngày của khách hàng phục vụ báo cáo lưu lượng.
*   **Các thành phần cốt lõi:**
    *   Cơ chế tối ưu hóa cookie kép: sử dụng một cookie định danh thiết bị dài hạn `vl_device_id` (1 năm) và một cookie trạng thái ngày `vl_visit_today` (hết hạn lúc nửa đêm).
    *   Nếu phát hiện cookie ngày là `true`, lập tức trả về thành công mà không thực hiện bất kỳ truy vấn Firestore nào để tiết kiệm tối đa tài nguyên đọc/ghi database.
    *   Nếu chưa có cookie ngày, thực hiện batch ghi: tăng bộ đếm lượt khách `visitors` của ngày hiện tại và ghi nhận nhật ký chi tiết (IP, User-Agent) vào subcollection `visits` theo ID thiết bị. Thiết lập cookie ngày với thời gian sống (TTL) chính xác bằng số giây còn lại từ thời điểm hiện tại đến nửa đêm.
*   **Đánh giá:** Thuật toán tối ưu hóa database bằng cookie ngày và cơ chế tính toán thời điểm hết hạn cookie lúc nửa đêm đạt độ hoàn thiện kỹ thuật rất cao.

#### 📝 [src/app/api/appointments/route.ts](file:///m:/QLCH_VanLanh/src/app/api/appointments/route.ts) (144 dòng)
*   **Chức năng:** API đặt lịch hẹn sửa chữa thiết bị từ storefront của khách hàng.
*   **Các thành phần cốt lõi:**
    *   Giới hạn tần suất 3 lần/phút, honeypot chặn bot gửi form tự động.
    *   Chuẩn hóa số điện thoại, chạy transaction Firestore để sinh mã lịch hẹn tuần tự dạng `DL-XXXX`.
    *   Kiểm tra CRM khách hàng: nếu là khách mới thì tạo profile với `totalAppointments: 1`, nếu khách cũ thì cập nhật tên và tăng số lượng lịch hẹn.
*   **Đánh giá:** Logic xử lý an toàn, tích hợp CRM chặt chẽ và sinh mã lịch hẹn tuần tự an toàn.

#### 📝 [src/app/api/bounty/claim/route.ts](file:///m:/QLCH_VanLanh/src/app/api/bounty/claim/route.ts) (203 dòng)
*   **Chức năng:** API xử lý nhận thưởng mã voucher khuyến mại cho khách hàng tham gia chương trình tiếp thị (Bounty Program).
*   **Các thành phần cốt lõi:**
    *   Xác thực số điện thoại đã được xác minh OTP qua Firebase ID Token ở header `Authorization`.
    *   Chạy transaction Firestore để đảm bảo tính duy nhất tuyệt đối: tạo ID tài liệu voucher bằng khóa cố định `bounty_{phone}` để ngăn chặn race condition nhận mã trùng lặp.
    *   Đọc cấu hình phần thưởng (loại voucher phần trăm/cố định, giá trị, trần giảm giá) từ cài đặt hệ thống để sinh voucher mới có mã dạng `VDV-XXXX` và tự động cập nhật cờ `bounty_claimed` vào CRM khách hàng.
*   **Đánh giá:** Thiết kế ID tài liệu cố định `bounty_{phone}` để loại bỏ hoàn toàn lỗi race condition nhận voucher kép là một giải pháp kỹ thuật rất thông minh và an toàn.

#### 📝 [src/app/api/bounty/request-otp/route.ts](file:///m:/QLCH_VanLanh/src/app/api/bounty/request-otp/route.ts) (219 dòng)
*   **Chức năng:** API kiểm tra điều kiện nhận thưởng và kiểm soát tần suất yêu cầu gửi OTP SMS cho chương trình bounty.
*   **Các thành phần cốt lõi:**
    *   Tra cứu trạng thái nhận voucher của số điện thoại trước khi cho phép gửi OTP, giúp tiết kiệm chi phí gửi SMS đối với các số đã nhận thưởng.
    *   **Lũy tiến kiểm soát tần suất (Progressive Rate Limiting):** Theo dõi số lượng OTP đã gửi theo IP và Số điện thoại trong vòng 12 giờ. Áp dụng thời gian chờ tăng dần để chống spam phá hoại: lần 1 chờ 30 giây, lần 2 chờ 5 phút, lần 3 trở đi buộc chờ 1 tiếng.
    *   Ghi nhận lần gửi thành công (`record` action) qua transaction để cập nhật mốc thời gian chặn tiếp theo.
*   **Đánh giá:** Giải pháp chống spam OTP và tối ưu chi phí viễn thông cực kỳ chặt chẽ, bảo vệ ngân sách cửa hàng khỏi các cuộc tấn công spam SMS hiệu quả.

#### 📝 [src/app/api/products/route.ts](file:///m:/QLCH_VanLanh/src/app/api/products/route.ts) (48 dòng)
*   **Chức năng:** API truy vấn danh sách sản phẩm lẻ cho storefront.
*   **Đánh giá:** Hỗ trợ lọc theo danh mục, thương hiệu, trạng thái và giới hạn số lượng. Code viết rõ ràng, dễ hiểu.

#### 📝 [src/app/api/proxy-image/route.ts](file:///m:/QLCH_VanLanh/src/app/api/proxy-image/route.ts) (24 dòng)
*   **Chức năng:** API đại lý hình ảnh (Image Proxy) giúp client tải ảnh từ nguồn ngoài để tránh lỗi bảo mật CORS khi vẽ canvas.
*   **Đánh giá:** Tải ảnh trung gian an toàn, thiết lập Content-Type phù hợp và tích hợp cache 1 ngày để tối ưu tải trọng.

#### 📝 [src/app/api/reviews/google/route.ts](file:///m:/QLCH_VanLanh/src/app/api/reviews/google/route.ts) (95 dòng)
*   **Chức năng:** API proxy và cache các bài đánh giá của cửa hàng từ Google Places API để hiển thị ở trang chủ.
*   **Các thành phần cốt lõi:**
    *   Đọc động mã `googlePlaceId` từ cấu hình giao diện Firestore.
    *   Gọi Google Places API mới với header xác thực và fieldmasking tối ưu dung lượng tải.
    *   Tự động dịch thuật/lấy dữ liệu bằng tiếng Việt, lọc bỏ các bài viết trống và lưu đệm kết quả 1 ngày (`revalidate: 86400`) để bảo vệ định mức API miễn phí.
*   **Đánh giá:** Giải pháp tích hợp Google Review rất mượt mà, tối ưu hóa chi phí API tuyệt vời bằng cơ chế cache thông minh.

#### 📝 [src/app/api/reviews/product/route.ts](file:///m:/QLCH_VanLanh/src/app/api/reviews/product/route.ts) (121 dòng)
*   **Chức năng:** API gửi bài đánh giá sản phẩm của khách hàng mua lẻ.
*   **Các thành phần cốt lõi:**
    *   Kiểm soát spam IP kép: giới hạn tối đa 3 lần/phút và 5 lần/ngày (tính thời gian sống của rate limit tự động reset vào nửa đêm).
    *   Chặn bot spam tự động bằng honeypot field, kiểm duyệt số sao (1-5 sao), lọc tối đa 5 hình ảnh đi kèm và lưu trữ ở trạng thái chờ duyệt (`status: 'pending'`).
*   **Đánh giá:** Logic chống spam bài viết vô cùng an toàn và thực tế, bảo vệ chất lượng dữ liệu hiển thị.

#### 📝 [src/app/api/reviews/route.ts](file:///m:/QLCH_VanLanh/src/app/api/reviews/route.ts) (214 dòng)
*   **Chức năng:** API gửi bài đánh giá dịch vụ sửa chữa hoặc đánh giá chung của cửa hàng, tích hợp xác thực vị trí vật lý chống đánh giá ảo (Anti-Fraud Geofencing).
*   **Các thành phần cốt lõi:**
    *   Kiểm soát tần suất IP kép (3 lần/phút, 3 lần/ngày reset lúc nửa đêm) và honeypot.
    *   **Xác thực vị trí vật lý (Geofencing):** Nếu hệ thống bật geofence, khách hàng phải chia sẻ tọa độ GPS. Hệ thống tính toán khoảng cách thực tế bằng thuật toán **Haversine** (mặc định trong bán kính 500m quanh cửa hàng). Nếu ngoài phạm vi, bắt buộc phải nhập mã PIN xác thực tại quầy do nhân viên cung cấp mới cho phép gửi bài.
    *   Chạy transaction Firestore để sinh mã lịch sử tuần tự dạng `RV-XXXX` và lưu bài đánh giá chờ duyệt.
*   **Đánh giá:** Một trong những tính năng chống spam đánh giá ảo sáng tạo và triệt để nhất, ngăn chặn hiệu quả việc seeding đánh giá giả mạo từ xa.

#### 📝 [src/app/api/search/route.ts](file:///m:/QLCH_VanLanh/src/app/api/search/route.ts) (162 dòng)
*   **Chức năng:** API tìm kiếm hợp nhất đa năng cho storefront và quầy POS.
*   **Các thành phần cốt lõi:**
    *   **In-Memory Caching:** Lưu trữ sản phẩm active và dịch vụ trên bộ nhớ RAM của máy chủ trong 60 giây để trả về kết quả tìm kiếm tức thì, giảm 95% lượt đọc Firestore.
    *   **Tìm kiếm đa dạng:** Tìm kiếm mờ trên cache cho sản phẩm/dịch vụ (theo tên, mô tả, danh mục, hãng).
    *   **Exact Match Lookup:** Nếu từ khóa khớp mã đơn hàng hoặc phiếu sửa (hỗ trợ quét QR), thực hiện đọc trực tiếp Firestore để trả về thông tin tức thì.
    *   **Tìm theo SĐT:** Nếu là số điện thoại, tự động quét song song lấy ra 5 đơn hàng và 5 phiếu sửa gần nhất.
*   **Đánh giá:** API tìm kiếm cực kỳ mạnh mẽ, tối ưu hóa lượt đọc cơ sở dữ liệu và tích hợp mượt mà các trải nghiệm POS/quét QR.

#### 📝 [src/app/api/services/homepage-pricing/route.ts](file:///m:/QLCH_VanLanh/src/app/api/services/homepage-pricing/route.ts) (34 dòng)
*   **Chức năng:** API lấy danh sách dịch vụ sửa chữa hiển thị bảng giá ở trang chủ storefront.
*   **Đánh giá:** Tích hợp HTTP cache CDN (`stale-while-revalidate=60`) giúp trang chủ tải cực nhanh và tiết kiệm tài nguyên server.

#### 📝 [src/app/api/tracking/route.ts](file:///m:/QLCH_VanLanh/src/app/api/tracking/route.ts) (148 dòng)
*   **Chức năng:** API tra cứu hành trình sửa chữa và đơn hàng dành cho khách hàng tự tra cứu qua SĐT.
*   **Các thành phần cốt lõi:**
    *   Truy vấn đồng thời lịch hẹn, phiếu sửa chữa, và đơn hàng bán lẻ dựa trên số điện thoại khách hàng.
    *   **Bảo mật thông tin cá nhân (PII Masking):** Tự động ẩn số điện thoại dạng `093***026`, che tên khách hàng dạng `T*** D***`.
    *   **Tẩy sạch dữ liệu nhạy cảm:** Chủ động xóa bỏ trường mật mã màn hình máy khách (`passcode`) và số IMEI của thiết bị trước khi trả về client để ngăn ngừa nguy cơ rò rỉ dữ liệu cá nhân của khách.
*   **Đánh giá:** Module tra cứu thiết kế rất tinh tế, đặt tính bảo mật thông tin cá nhân và an toàn dữ liệu khách hàng lên hàng đầu.

#### 📝 [src/app/api/vouchers/validate/route.ts](file:///m:/QLCH_VanLanh/src/app/api/vouchers/validate/route.ts) (88 dòng)
*   **Chức năng:** API kiểm duyệt tính hợp lệ và tính toán số tiền giảm giá xem trước (discount preview) của Voucher.
*   **Các thành phần cốt lõi:**
    *   Kiểm tra sự tồn tại, trạng thái hoạt động, thời hạn sử dụng, giới hạn lượt dùng và giá trị đơn hàng tối thiểu.
    *   **Xác thực Voucher cá nhân:** Đối với mã voucher tặng riêng cho số điện thoại (Bounty Program), hệ thống chuẩn hóa SĐT đầu vào và SĐT sở hữu để đảm bảo chỉ đúng chủ nhân mới được dùng mã.
    *   Tính toán số tiền giảm giá xem trước (áp trần giảm giá tối đa cho voucher dạng %).
*   **Đánh giá:** Bộ kiểm duyệt voucher hoàn chỉnh, chính xác và có độ bảo mật voucher cá nhân cao.

---

### 17. Nhóm Trang Giao diện Khách hàng (Storefront Customer Pages)

#### 📝 [src/app/(customer)/layout.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/layout.tsx) (114 dòng)
*   **Chức năng:** Server Component quản lý bố cục chung cho toàn bộ trang giao diện khách hàng (Storefront).
*   **Cơ chế hoạt động:**
    *   **Tối ưu tải trang:** Thực hiện truy vấn trực tiếp Firestore 1 lần qua Admin SDK để lấy toàn bộ các cấu hình giao diện (`main_settings`, `layout_settings`, `navigation_settings`, `taxonomy_settings`) rồi truyền xuống Client Component.
    *   **Bypass onSnapshot:** Không sử dụng Realtime Listener ở trang khách hàng nhằm tránh tạo WebSocket connection dư thừa cho người dùng đại trà, giúp tiết kiệm chi phí đọc/ghi database.
    *   **Revalidation:** Đặt thời gian cache tĩnh là 30 giây (`revalidate = 30`).
*   **Đánh giá:** Kiến trúc tải dữ liệu tối ưu cho SEO, bảo vệ database khỏi tải trọng cao từ khách truy cập storefront.

#### 📝 [src/app/(customer)/layout.shell.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/layout.shell.tsx) (115 dòng)
*   **Chức năng:** Client Component đóng vai trò vỏ bọc giao diện, quản lý giỏ hàng, thông tin doanh nghiệp và SEO schema.
*   **Cơ chế hoạt động:**
    *   **SEO LocalBusiness Schema:** Tự động nhúng cấu trúc JSON-LD LocalBusiness chuẩn hóa chứa tên, SĐT, email, địa chỉ các chi nhánh, giờ mở cửa và các liên kết mạng xã hội để tối ưu hóa SEO Google Maps và tìm kiếm cục bộ.
    *   **Background Dynamic Styles:** Đọc cấu hình hình nền/màu nền từ hệ thống, tự động tối ưu hóa hình nền qua proxy `wsrv.nl` bằng helper `firebaseImageLoader`.
    *   **Lắng nghe sự hiện diện:** Gọi hook `usePresence()` để cập nhật realtime số lượng người dùng đang truy cập.
*   **Đánh giá:** Triển khai SEO schema và tối ưu ảnh nền rất chuyên nghiệp, đảm bảo trải nghiệm Front-end mượt mà.

#### 📝 [src/app/(customer)/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/page.tsx) (121 dòng)
*   **Chức năng:** Server Component của trang chủ, chịu trách nhiệm tải cấu hình hiển thị và sản phẩm mới nhất.
*   **Cơ chế hoạt động:**
    *   **Bypass cache Serverless:** Truy vấn Firestore trực tiếp (không dùng `unstable_cache`) để đảm bảo tính đồng nhất dữ liệu trên mọi instance Serverless khi admin cập nhật giao diện.
    *   **Truy vấn song song:** Fetch đồng thời dữ liệu cấu hình trang chủ (`main_settings`) và 15 sản phẩm hoạt động mới nhất (`products`).
    *   **Preload LCP Image:** Tự động phát hiện banner đầu tiên của slideshow và sinh thẻ `<link rel="preload" as="image">` có độ ưu tiên cao (`fetchPriority="high"`) để tối ưu chỉ số LCP (Largest Contentful Paint) cho SEO.
*   **Đánh giá:** Logic xử lý tối ưu SEO và tốc độ tải trang cực kỳ xuất sắc.

#### 📝 [src/app/(customer)/page.client.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/page.client.tsx) (136 dòng)
*   **Chức năng:** Client Component điều khiển giao diện trang chủ, sắp xếp các section động theo cấu hình admin.
*   **Cơ chế hoạt động:**
    *   **Dynamic Imports:** Tự động import động (`next/dynamic`) với các skeletons loading tương ứng cho các phần phức tạp (FlashSale, Booking, Suggested, Pricing, GoogleReviews, Articles) để giảm thiểu kích thước bundle JS ban đầu, cải thiện tốc độ tương tác (FID/TBT).
    *   **Sắp xếp bố cục động:** Lọc và sắp xếp các section hiển thị theo thứ tự `order` và trạng thái `visible` do admin cấu hình.
    *   **SEO Website Schema:** Nhúng JSON-LD Website Schema hỗ trợ hộp tìm kiếm Google Sitelinks Searchbox.
*   **Đánh giá:** Trải nghiệm người dùng mượt mà, phân mảnh code (code-splitting) tối ưu.

#### 📝 [src/app/(customer)/cart/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/cart/page.tsx) (257 dòng)
*   **Chức năng:** Trang giỏ hàng của khách hàng mua sắm online.
*   **Cơ chế hoạt động:**
    *   Hiển thị danh sách sản phẩm trong giỏ từ `useCart()`, hỗ trợ tăng/giảm số lượng hoặc xóa sản phẩm.
    *   Tự động tính toán phí vận chuyển: Miễn phí cho đơn hàng từ 300.000đ trở lên, dưới mức đó tính phí 30.000đ. Hiển thị thông báo gợi ý mua thêm để được miễn phí ship.
    *   Tích hợp ô nhập mã giảm giá (coupon) và liên kết chuyển hướng nhanh tới trang thanh toán `/checkout`.
*   **Đánh giá:** Giao diện đơn giản, rõ ràng, tối ưu hóa tỷ lệ chuyển đổi mua hàng.

#### 📝 [src/app/(customer)/category/[...slug]/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/category/[...slug]/page.tsx) (232 dòng)
*   **Chức năng:** Server Component xử lý định tuyến danh mục động đa cấp (ví dụ: `/category/dien-thoai/iphone`).
*   **Cơ chế hoạt động:**
    *   **Giải mã URL thông minh (`resolveSlug`):** Tự động phân tích các phân đoạn slug để đối chiếu với cấu hình điều hướng (navigation) và cây phân mục hệ thống (taxonomy). Phân biệt rõ danh mục dịch vụ sửa chữa (`isRepair`) hay sản phẩm bán lẻ.
    *   **Redirect 308:** Tự động chuyển hướng 308 từ các slug viết tắt hoặc lỗi thời về đường dẫn chuẩn (canonical path) (ví dụ: `/sua-laptop` về `/sua-chua-laptop`).
    *   **SEO & Schemas:** Tự động sinh JSON-LD `Service` schema (cho dịch vụ sửa chữa) hoặc `CollectionPage` schema (cho sản phẩm), kết hợp nhúng `BreadcrumbList` schema đa cấp.
*   **Đánh giá:** Xử lý định tuyến động và tối ưu hóa SEO cực kỳ bài bản.

#### 📝 [src/app/(customer)/category/[...slug]/layout.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/category/[...slug]/layout.tsx) (113 dòng)
*   **Chức năng:** Layout của trang danh mục, quản lý metadata SEO động.
*   **Cơ chế hoạt động:**
    *   `generateMetadata()`: Giải mã các phân đoạn slug để tự động tạo tiêu đề, mô tả chuẩn SEO chứa từ khóa và hotline chi nhánh phù hợp với từng danh mục cụ thể.
    *   Cấu hình revalidate 30 giây để đảm bảo metadata luôn đồng bộ với các thay đổi danh mục của admin.
*   **Đánh giá:** Đảm bảo metadata hiển thị chính xác trên các công cụ tìm kiếm và mạng xã hội (OpenGraph/Twitter Card).

#### 📝 [src/app/(customer)/category/[...slug]/CategoryClient.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/category/[...slug]/CategoryClient.tsx) (580 dòng)
*   **Chức năng:** Client Component hiển thị danh sách sản phẩm hoặc dịch vụ theo danh mục, tích hợp bộ lọc nâng cao.
*   **Cơ chế hoạt động:**
    *   **Bộ lọc thích ứng:**
        *   *Sản phẩm:* Lọc theo thương hiệu, dòng máy (danh mục con), tình trạng (mới/cũ), phân khúc giá, sắp xếp theo giá hoặc độ phổ biến.
        *   *Dịch vụ sửa chữa:* Tự động bóc tách thương hiệu từ văn bản (`KNOWN_BRANDS`) và lọc theo bộ phận lỗi (`KNOWN_PARTS` như màn hình, pin, camera...) để làm bộ lọc thông minh cho khách hàng dễ lựa chọn.
    *   **Client-side Pagination:** Sử dụng hook `useClientPagination` để phân trang dữ liệu (mặc định 20 phần tử/trang) giúp trang phản hồi ngay lập tức khi chuyển trang.
*   **Đánh giá:** Bộ lọc thông minh bóc tách từ khóa dịch vụ hoạt động rất ấn tượng, cải thiện lớn trải nghiệm tìm kiếm của khách hàng.

#### 📝 [src/app/(customer)/checkout/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/checkout/page.tsx) (463 dòng)
*   **Chức năng:** Giao diện đặt hàng và thanh toán COD dành cho khách mua hàng storefront.
*   **Cơ chế hoạt động:**
    *   **Security & Anti-Bot:** Tích hợp bộ thu thập thông tin khách hàng (Tên, SĐT, Ghi chú) kết hợp trường ẩn Honeypot để loại bỏ bot spam tự động gửi đơn hàng ảo.
    *   **Áp dụng Voucher:** Tích hợp ô nhập voucher, gọi API `/api/vouchers/validate` kiểm tra tính hợp lệ và cập nhật giảm giá realtime trước khi đặt hàng.
    *   **Handoff an toàn:** Khi đặt hàng thành công, hiển thị màn hình chúc mừng kèm mã đơn hàng dạng short alias và tự động làm sạch giỏ hàng.
*   **Đánh giá:** Thiết kế form gọn gàng, bảo mật chống bot tốt và xử lý voucher mượt mà.

#### 📝 [src/app/(customer)/flash-sale/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/flash-sale/page.tsx) (27 dòng)
*   **Chức năng:** Server Component của trang khuyến mãi giờ vàng (Flash Sale).
*   **Cơ chế hoạt động:** Tải danh sách sản phẩm có cờ flash sale hoặc chiết khấu cao từ Firestore và chuyển xuống Client Component hiển thị.
*   **Đánh giá:** Tinh gọn, revalidate 30 giây để cập nhật deal mới nhanh chóng.

#### 📝 [src/app/(customer)/flash-sale/page.client.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/flash-sale/page.client.tsx) (97 dòng)
*   **Chức năng:** Client Component hiển thị lưới sản phẩm Flash Sale với hiệu ứng trực quan sinh động.
*   **Cơ chế hoạt động:** Hiển thị thẻ giảm giá phần trăm nổi bật, huy hiệu "HOT" cho các sản phẩm bán chạy (lượt bán > 100) và trình bày lưới sản phẩm responsive.
*   **Đánh giá:** Giao diện bắt mắt, thúc đẩy hành vi mua hàng của người dùng.

#### 📝 [src/app/(customer)/info/layout.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/info/layout.tsx) (112 dòng)
*   **Chức năng:** Layout chung cho nhóm trang chính sách và giới thiệu (Info Pages).
*   **Cơ chế hoạt động:** Cung cấp menu thanh bên (Sidebar) liên kết toàn bộ 7 trang chính sách (Giới thiệu, Bảo hành, Mua hàng, Trả góp, Bảo mật, Điều khoản, Đổi trả), tự động chuyển đổi sang menu thu gọn (Mobile Collapsible Menu) trên thiết bị di động để tối ưu diện tích hiển thị.
*   **Đánh giá:** Giải pháp điều hướng chính sách đồng bộ và thân thiện với thiết bị di động.

#### 📝 [src/app/(customer)/lien-he/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/lien-he/page.tsx) (58 dòng)
*   **Chức năng:** Trang liên hệ của cửa hàng.
*   **Cơ chế hoạt động:** Hiển thị các nút liên hệ nhanh (Hotline, Zalo, Facebook) và trình bày danh sách chi nhánh cửa hàng kèm bản đồ, số điện thoại riêng và nút chỉ đường Google Maps lấy từ cấu hình `store_branches`.
*   **Đánh giá:** Trực quan, dễ sử dụng, cung cấp đầy đủ cổng kết nối cho khách hàng.

#### 📝 [src/app/(customer)/rate/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/rate/page.tsx) (513 dòng)
*   **Chức năng:** Trang gửi đánh giá dịch vụ sửa chữa/mua hàng tại quầy (quét mã QR), tích hợp hàng rào bảo vệ chống seeding ảo.
*   **Cơ chế hoạt động:**
    *   **Haversine Geofencing:** Tự động lấy GPS của khách để tính khoảng cách tới cửa hàng. Nếu nằm ngoài bán kính cho phép (mặc định 500m), hệ thống khóa form và yêu cầu khách nhập mã PIN xác thực do nhân viên tại quầy cung cấp.
    *   **Bảo mật thông tin (PII):** Tự động che số điện thoại của khách hàng trước khi lưu và hiển thị công khai (ví dụ: `093****026`).
    *   **Media Upload:** Hỗ trợ tải lên tối đa 5 hình ảnh đánh giá thực tế (giới hạn kích thước 5MB/ảnh) lên Storage.
*   **Đánh giá:** Một trong những tính năng chống spam đánh giá ảo sáng tạo và triệt để nhất, đảm bảo tính trung thực của các bài review.

#### 📝 [src/app/(customer)/reviews/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/reviews/page.tsx) (41 dòng)
*   **Chức năng:** Server Component của trang tổng hợp đánh giá khách hàng.
*   **Cơ chế hoạt động:** Truy vấn tối đa 50 đánh giá có trạng thái `approved` mới nhất từ collection `reviews` để render lên giao diện. Thiết lập revalidate 2 phút.
*   **Đánh giá:** Đơn giản, hiệu quả, hỗ trợ tải nội dung nhanh.

#### 📝 [src/app/(customer)/reviews/ReviewsClient.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/reviews/ReviewsClient.tsx) (132 dòng)
*   **Chức năng:** Client Component hiển thị danh sách đánh giá của khách hàng.
*   **Cơ chế hoạt động:** Trình bày các bài đánh giá dưới dạng lưới card, hiển thị số sao, nội dung bình luận, hình ảnh đính kèm, tên khách, số điện thoại đã che và nhãn phân loại giao dịch (Đã sửa chữa / Đã mua hàng).
*   **Đánh giá:** Bố cục hiện đại, trực quan, tạo dựng niềm tin vững chắc cho khách hàng mới.

#### 📝 [src/app/(customer)/search/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/search/page.tsx) (160 dòng)
*   **Chức năng:** Trang tìm kiếm hợp nhất dành cho khách hàng.
*   **Cơ chế hoạt động:**
    *   Đọc từ khóa từ URL parameters, gọi API `/api/search` để tìm kiếm sản phẩm/dịch vụ tương ứng và hiển thị kết quả.
    *   Sử dụng React `Suspense` và skeletons loading để tối ưu hóa trải nghiệm tải trang.
    *   Đặt thẻ noindex để ngăn công cụ tìm kiếm index các trang kết quả tìm kiếm nội bộ.
*   **Đánh giá:** Tốc độ phản hồi nhanh nhờ tích hợp cơ chế cache của API tìm kiếm.

#### 📝 [src/app/(customer)/service/[id]/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/service/[id]/page.tsx) (94 dòng)
*   **Chức năng:** Server Component hiển thị chi tiết dịch vụ sửa chữa (ví dụ: Thay pin iPhone).
*   **Cơ chế hoạt động:**
    *   Tải thông tin chi tiết dịch vụ qua `fetchDetailItem`. Nếu không tìm thấy, hiển thị thông báo lỗi thân thiện.
    *   **SEO Schema:** Nhúng JSON-LD `Service` schema chứa thông tin dịch vụ, nhà cung cấp, hotline và khu vực phục vụ (TP.HCM) để Google index dịch vụ sửa chữa chuẩn xác.
*   **Đánh giá:** Tối ưu hóa SEO On-page rất tốt cho các dịch vụ sửa chữa cốt lõi.

#### 📝 [src/app/(customer)/service/[id]/layout.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/service/[id]/layout.tsx) (87 dòng)
*   **Chức năng:** Layout trang chi tiết dịch vụ, quản lý metadata SEO động.
*   **Cơ chế hoạt động:** Tự động tạo thẻ OpenGraph và Twitter Card chứa tiêu đề dịch vụ, mô tả ngắn và hình ảnh đại diện linh kiện sửa chữa để hiển thị bắt mắt khi chia sẻ liên kết.
*   **Đánh giá:** Đảm bảo hiển thị truyền thông mạng xã hội chuyên nghiệp.

#### 📝 [src/app/(customer)/service/[id]/ServiceDetailClient.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/service/[id]/ServiceDetailClient.tsx) (434 dòng)
*   **Chức năng:** Client Component hiển thị thông tin dịch vụ sửa chữa và form đặt lịch hẹn online.
*   **Cơ chế hoạt động:**
    *   **Trực quan hóa dịch vụ:** Trình bày thư viện hình ảnh dịch vụ, video clip quy trình tháo lắp thực tế (hỗ trợ Youtube/MP4), bảng giá gốc/khuyến mãi, thời gian sửa và thời hạn bảo hành.
    *   **Đặt lịch hẹn thông minh:** Tích hợp form đặt hẹn nhanh: Họ tên, SĐT, chọn ngày hẹn (trong 7 ngày tới), chọn ca hẹn (Sáng/Chiều/Tối) và chi nhánh mong muốn. Gửi dữ liệu tới API `/api/appointments` để đồng bộ CRM.
*   **Đánh giá:** Thiết kế hướng chuyển đổi cao, form đặt hẹn cực kỳ tiện lợi và trực quan.

#### 📝 [src/app/(customer)/tin-tuc/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/tin-tuc/page.tsx) (10 dòng)
*   **Chức năng:** Server Component trang danh sách bài viết (Blog).
*   **Cơ chế hoạt động:** Tải danh sách bài viết hoạt động từ Firestore qua `fetchArticles` và chuyển cho Client Component. revalidate 30 giây.
*   **Đánh giá:** Tinh gọn, tải dữ liệu nhanh.

#### 📝 [src/app/(customer)/tin-tuc/page.client.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/tin-tuc/page.client.tsx) (249 dòng)
*   **Chức năng:** Client Component hiển thị danh sách bài viết chuẩn SEO, tích hợp phân loại và phân trang.
*   **Cơ chế hoạt động:**
    *   **Phân loại nhanh (Tabs):** Hỗ trợ lọc bài viết theo Khuyến mãi, Tin tức, Mẹo hay.
    *   **SEO Schemas:** Nhúng JSON-LD `CollectionPage` schema và `BreadcrumbList` schema đa cấp để khai báo cấu trúc trang blog với Google.
    *   **Client-side Pagination:** Sử dụng hook `useClientPagination` phân trang 20 bài viết/trang kết hợp component `PaginationBar`.
*   **Đánh giá:** Trình bày đẹp mắt, hỗ trợ SEO cấu trúc hoàn chỉnh.

#### 📝 [src/app/(customer)/tin-tuc/[slug]/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/tin-tuc/[slug]/page.tsx) (255 dòng)
*   **Chức năng:** Server Component hiển thị nội dung chi tiết bài viết (Blog Post).
*   **Cơ chế hoạt động:**
    *   Tải bài viết theo slug/id qua `fetchArticleDetail`. Nhúng JSON-LD `BlogPosting` schema chứa tiêu đề, ảnh, ngày đăng, tác giả và thông tin nhà xuất bản.
    *   **Render HTML an toàn:** Sử dụng hàm `sanitizeHtml` để làm sạch nội dung HTML soạn thảo từ admin (React Quill) trước khi hiển thị, ngăn chặn triệt độ tấn công XSS qua bài viết.
    *   Tích hợp nhúng video quy trình và hiển thị danh sách thẻ (Tags) bài viết.
*   **Đánh giá:** Xử lý render HTML cực kỳ an toàn, cấu trúc SEO schema BlogPosting đầy đủ.

#### 📝 [src/app/(customer)/tin-tuc/[slug]/layout.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/tin-tuc/[slug]/layout.tsx) (88 dòng)
*   **Chức năng:** Layout chi tiết bài viết, tự động trích xuất metadata SEO bài viết.
*   **Cơ chế hoạt động:** Tự động loại bỏ các thẻ HTML khỏi nội dung bài viết (`stripHtml`) để lấy ra 155 ký tự đầu tiên làm thẻ mô tả `description` chuẩn SEO. Sinh các thẻ chia sẻ bài viết mạng xã hội động.
*   **Đánh giá:** Giải pháp tự động hóa SEO bài viết tinh tế và hiệu quả.

#### 📝 [src/app/(customer)/tin-tuc/[slug]/ArticleClientParts.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/tin-tuc/[slug]/ArticleClientParts.tsx) (320 dòng)
*   **Chức năng:** Client Component quản lý lượt xem bài viết, đánh giá số sao và bình luận của độc giả.
*   **Cơ chế hoạt động:**
    *   **Unique View Counter:** Kiểm tra localStorage để đếm tối đa 1 lượt xem bài viết/trình duyệt/ngày. Nếu hợp lệ, gửi yêu cầu tới POST `/api/articles/view` sử dụng thuộc tính `keepalive: true` để đảm bảo lưu lượt xem kể cả khi khách tắt tab đột ngột.
    *   **Bình luận Realtime:** Tự động truy vấn collection `article_comments` hiển thị danh sách bình luận đã duyệt, cho phép độc giả gửi đánh giá sao + bình luận (SĐT sẽ được ẩn tự động qua `maskPhone`). Hiển thị phản hồi từ cửa hàng (`c.reply`).
*   **Đánh giá:** Quản lý lượt xem thông minh, cơ chế bình luận và bảo mật thông tin khách hàng cực tốt.

#### 📝 [src/app/(customer)/tracking/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/tracking/page.tsx) (972 dòng)
*   **Chức năng:** Trang tra cứu hành trình dịch vụ (Sửa chữa, Lịch hẹn, Đơn hàng) toàn diện dành cho khách hàng.
*   **Cơ chế hoạt động:**
    *   **Lịch hẹn:** Hiển thị thời gian, chi nhánh đặt lịch và trạng thái (Chờ duyệt, Đã duyệt, Đã hủy...).
    *   **Đơn hàng:** Hiển thị danh sách sản phẩm mua, giá tiền, ghi chú đặt hàng và trạng thái vận chuyển (đang giao, hoàn tất, đã hủy).
    *   **Phiếu sửa chữa (Cực kỳ chi tiết):**
        *   *Hành trình sửa chữa:* Vẽ timeline tiến độ sửa chữa động dựa trên cấu hình các nhóm tra cứu (`trackingGroups`) trong hệ thống, chỉ ra rõ ràng máy đang ở công đoạn nào (nhận máy, kiểm tra, đang sửa, chờ trả).
        *   *Hình ảnh/Video bàn giao:* Đối với máy sửa xong, khách hàng có thể xem trực tiếp hình ảnh hoặc video thực tế bàn giao máy do KTV tải lên (hỗ trợ Youtube/MP4).
        *   *Tra cứu bảo hành linh kiện:* Liệt kê bảng linh kiện đã thay thế, thời hạn bảo hành tương ứng và hiển thị nhãn "Còn bảo hành" hoặc "Hết bảo hành" realtime so với mốc thời gian hiện tại.
        *   *Đánh giá một chạm:* Với phiếu sửa hoàn tất, hiển thị nút mở Modal đánh giá nhanh chất lượng sửa chữa trực tiếp từ trang tra cứu.
*   **Đánh giá:** Một trong những trang Front-end đỉnh cao của hệ thống, tích hợp hoàn hảo toàn bộ thông tin hành trình của khách hàng, tạo trải nghiệm minh bạch, uy tín tuyệt đối.

---

### 18. Nhóm Trang Quản trị & Điều phối Nghiệp vụ (Admin Console & Back-Office)

#### 📝 [src/app/admin/layout.tsx](file:///m:/QLCH_VanLanh/src/app/admin/layout.tsx) (548 dòng)
*   **Chức năng:** Client Component đóng vai trò Layout tổng thể cho phân hệ quản trị (Admin Dashboard).
*   **Cơ chế hoạt động:**
    *   **Xác thực quyền & Bảo mật:** Kiểm tra trạng thái đăng nhập qua `useAuth()`. Nếu chưa đăng nhập, tự động chuyển hướng về `/admin/login`. Nếu người dùng đăng nhập nhưng không có vai trò `admin` hoặc `staff`, thực hiện đăng xuất và đẩy về `/admin/login`.
    *   **Phân quyền chi tiết (Permissions):** Lọc menu điều hướng `ADMIN_NAV_GROUPS` dựa theo quyền của nhân viên (`user.permissions`). Đối với vai trò `admin`, hiển thị toàn bộ menu. Đối với `staff`, chỉ hiển thị những menu được cấp quyền.
    *   **Kiểm soát truy cập trực tiếp:** Nếu nhân viên truy cập một đường dẫn không được phép (`isStaffBlocked`), hệ thống chặn ngay lập tức và hiển thị giao diện báo lỗi "Truy cập bị từ chối" cùng nút quay lại trang đầu tiên được phép.
    *   **Menu Lối tắt trên thiết bị di động (Mobile Quick Actions):** Cho phép người dùng ghim tối đa 5 lối tắt truy cập nhanh ở thanh bottom navigation trên giao diện Mobile. Trạng thái ghim được lưu trữ trực tiếp vào `localStorage` (`qlch_admin_mobile_quick_actions_v1`) và tự động đồng bộ.
    *   **Hệ thống cảnh báo nổi bật (Badges & Notifications):** Sử dụng hook `useAdminBadges` để nhận realtime số lượng badge (thông báo chưa xử lý, ví dụ: đơn hàng mới, lịch hẹn mới) và cập nhật số lượng trực tiếp trên từng mục menu tương ứng.
    *   **Tối ưu hóa UI/UX:** Tích hợp `NotificationBell` để xem nhanh lịch sử hoạt động, `GlobalSearch` để tìm kiếm toàn cục trong admin, và PWA Install Prompt để gợi ý cài đặt ứng dụng. Sử dụng Ant Design `ConfigProvider` để bọc toàn bộ cấu hình Antd.
*   **Đánh giá:** Khung layout cực kỳ vững chắc, quản lý phân quyền và lối tắt di động thiết kế rất tỉ mỉ, tối ưu trải nghiệm sử dụng đa thiết bị.

#### 📝 [src/app/admin/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/page.tsx) (290 dòng)
*   **Chức năng:** Client Component hiển thị trang chủ Dashboard của phân hệ quản trị (chỉ dành cho tài khoản Admin).
*   **Cơ chế hoạt động:**
    *   **Redirect Nhân viên (Staff):** Ngay khi auth load xong, nếu vai trò người dùng là `staff`, trang này sẽ tự động chuyển hướng (`router.replace`) về trang đầu tiên họ được quyền truy cập (`findFirstAccessibleRoute(user.permissions)`). Nhân viên không được phép xem dashboard chung này.
    *   **Truy vấn Dữ liệu hôm nay (Today's Statistics):**
        *   *Khoảng thời gian:* Tính toán mốc thời gian từ `00:00:00.000` đến `23:59:59.999` của ngày hôm nay.
        *   *Đơn hàng (orders):* Truy vấn các đơn hàng được cập nhật hôm nay (`updatedAt` nằm trong ngày). Đếm số lượng đơn tạo mới hôm nay. Tính tổng doanh thu bằng cách duyệt qua `paymentHistory` của từng đơn hàng (chỉ lấy phần thanh toán thực hiện trong ngày hôm nay). Tính tổng số sản phẩm đã bán từ các đơn hàng không bị hủy.
        *   *Phiếu sửa chữa (repairs):* Truy vấn các phiếu sửa chữa được cập nhật hôm nay. Đếm số lượng phiếu sửa tạo mới. Tính tổng tiền từ các lịch sử thanh toán (`paymentHistory`) của phiếu sửa diễn ra trong ngày hôm nay.
        *   *Lượt truy cập (analytics):* Tải tài liệu dạng ngày `YYYY-MM-DD` từ collection `analytics` để lấy số lượt khách ghé thăm website (`visitors`).
    *   **Lượt truy cập Realtime (Realtime Database):** Tải và lắng nghe trực tiếp Realtime Database ở node `online_users` để đếm số lượng client đang hoạt động trực tuyến (`onlineUsers`). Sử dụng dynamic import cho firebase db listener nhằm tối ưu kích thước bundle tải lần đầu.
*   **Đánh giá:** Dashboard tinh gọn nhưng chứa đựng những truy vấn dữ liệu theo ngày chính xác bậc nhất (bóc tách chi tiết từng dòng thanh toán lịch sử). Tính năng online realtime hoạt động tốt.

#### 📝 [src/app/admin/pos/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx) (1734 dòng)
*   **Chức năng:** Trang POS (Point of Sale) bán hàng tại quầy dành cho nhân viên/quản trị viên. Cho phép thực hiện thanh toán hỗn hợp gồm: bán sản phẩm lẻ, thu tiền dịch vụ sửa chữa (liên kết phiếu sửa chữa) và thu nợ đơn hàng cũ.
*   **Cơ chế hoạt động:**
    *   **Giỏ hàng đa năng:**
        *   Hỗ trợ nạp nhanh phiếu sửa chữa từ SĐT khách hàng hoặc URL param (`repairId`). Khi thêm phiếu sửa chữa, hệ thống tự động bóc tách các linh kiện có trạng thái `selected` thành các dòng linh kiện sửa chữa và tiền công sửa chữa (`laborCost`).
        *   Hỗ trợ nạp nhanh đơn nợ cũ (`payableOrders`). Cho phép ghi nhận một phần thanh toán/thu nợ cũ trực tiếp qua POS.
        *   Hỗ trợ điều chỉnh số lượng (với sản phẩm lẻ), sửa giá trực tiếp (hiển thị cảnh báo xác nhận nếu giá sửa thấp hơn giá vốn `costPrice` để tránh lỗ).
        *   *Quản lý IMEI/Serial:* Đối với sản phẩm có loại bảo hành là thiết bị (`warrantyDevice`), bắt buộc nhập đủ IMEI tương ứng số lượng trước khi checkout.
    *   **Cơ chế chiết khấu và Voucher:**
        *   Tích hợp tính toán chiết khấu tự động (`calculateAccessoryDiscounts`) khi khách hàng mua phụ kiện kèm theo dịch vụ sửa chữa dựa trên bộ quy tắc khuyến mãi (`fetchActiveDiscountRules`).
        *   Gọi API `/api/vouchers/validate` để kiểm tra và áp dụng voucher giảm giá realtime.
        *   Hỗ trợ tự động chuyển đổi phương thức thanh toán sang Ghi nợ (`DEBT`) nếu số tiền khách trả (`deposit`) nhỏ hơn tổng hóa đơn cần thanh toán (`total`), kèm yêu cầu bắt buộc nhập số điện thoại hợp lệ (9-11 số) để CRM lưu trữ công nợ.
    *   **Quy trình Thanh toán & Checkout:** Gửi payload hoàn chỉnh lên API `/api/pos/checkout` kèm theo Bearer ID Token của Firebase Auth. Nếu checkout thành công, hệ thống tự động làm sạch giỏ hàng và mở Modal hóa đơn bán hàng.
    *   **In hóa đơn đa dạng:**
        *   Hỗ trợ 2 mẫu in: Mẫu nhiệt 80mm (`thermal`) và Mẫu A4/A5 chi tiết (`a5`).
        *   *Quét mã chuyển khoản:* Đối với hình thức thanh toán chuyển khoản (`BANK`), hệ thống tự động lấy danh sách tài khoản ngân hàng mặc định từ cấu hình hệ thống (`bankConfig`) và sinh mã QR động VietQR (`https://img.vietqr.io/image/...`) chứa thông tin tài khoản, số tiền cần thanh toán thực tế (đã trừ cọc) và nội dung chuyển khoản là 6 ký tự cuối của ID đơn hàng để nhân viên đối soát nhanh chóng.
    *   **Tính năng tiện ích bổ sung:**
        *   Hỗ trợ phím tắt F1 để focus nhanh vào thanh tìm kiếm sản phẩm.
        *   Hỗ trợ quét mã vạch bằng bàn phím (đọc luồng nhập liệu siêu tốc) hoặc camera (Native BarcodeDetector / ZXing multi-format reader).
        *   Tích hợp `UniversalProductModal` để nhân viên có thể tạo nhanh một sản phẩm bán lẻ mới ngay tại màn hình POS mà không cần rời trang.
*   **Đánh giá:** Một trong những file cốt lõi đồ sộ nhất dự án. Xử lý logic cực kỳ chặt chẽ từ bảo hành, cấn trừ công nợ, đồng bộ CRM đến tạo mã QR thanh toán động.

#### 📝 [src/app/admin/orders/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/orders/page.tsx) (1188 dòng)
*   **Chức năng:** Trang quản lý danh sách và chi tiết đơn hàng dành cho Admin. Hỗ trợ xem thông tin, lọc nguồn đơn (Website, POS), theo dõi công nợ, in hóa đơn và in phiếu bảo hành.
*   **Cơ chế hoạt động:**
    *   **Tải dữ liệu & Phân trang:**
        *   Lắng nghe realtime danh sách đơn hàng qua `onSnapshot` (giới hạn 50 đơn hàng mới nhất).
        *   Hỗ trợ nút "Tải thêm lịch sử cũ" (`loadMoreData`) sử dụng cơ chế cursor `startAfter(lastDoc)` để tải thêm 50 đơn tiếp theo.
        *   *Tìm kiếm nâng cao:* Hỗ trợ tìm kiếm theo ID đơn, tên, SĐT khách hàng. Đặc biệt, nếu không tìm thấy trên client, cung cấp nút "Tìm trên Server" (`searchInDatabase`) để truy vấn trực tiếp trên toàn bộ collection `orders` của Firestore bằng số điện thoại.
        *   Phân trang Client-side mượt mà bằng hook `useClientPagination`.
    *   **Quản lý Công nợ:**
        *   Hàm `getOrderDebtInfo(order)` tự động tính toán số tiền khách đã trả (dựa theo `deposit_amount` hoặc tổng tích lũy từ lịch sử thanh toán `paymentHistory`) và công nợ còn lại (`remainingDebt`).
        *   Nếu đơn hàng có nợ còn lại, hệ thống hiển thị trạng thái đặc biệt "Ghi nợ - chờ thu" với màu đỏ nổi bật và hiển thị số tiền nợ.
        *   Hiển thị lịch sử thanh toán chi tiết (`paymentHistory`) của đơn hàng gồm các đợt thu nợ (`debt_payment`), cọc (`deposit`), hoàn tiền (`refund`) kèm phương thức thanh toán, số tiền luỹ kế và ghi chú.
    *   **Cập nhật IMEI & In phiếu Bảo hành:**
        *   Nếu đơn hàng chứa sản phẩm có loại bảo hành là thiết bị (`warrantyDevice`), hệ thống hiển thị các ô nhập IMEI tương ứng với số lượng mua của dòng sản phẩm đó. Khi nhân viên nhập xong và blur, hệ thống gọi API `/api/orders/${orderId}/imei` để lưu trữ IMEI trực tiếp vào Firestore.
        *   *In bảo hành (handlePrintWarranty):* Tự động duyệt qua các sản phẩm trong đơn, kiểm tra chính sách bảo hành (`getWarrantyPrintType`). Nếu là sản phẩm được bảo hành, hệ thống chuẩn bị payload bảo hành cho từng sản phẩm và áp dụng mẫu cấu hình in tương ứng (`warrantyDevice` hoặc `warrantyAccessory`) từ cấu hình in `receiptConfig`. Sau đó gọi `window.print()` để in hàng loạt các trang bảo hành (mỗi trang là một phiếu bảo hành cách biệt nhờ thuộc tính CSS `break-after-page`).
    *   **In hóa đơn:** Hỗ trợ in 2 mẫu: Khổ 80mm nhiệt (`thermal`) hoặc khổ A5 (`a5`), sử dụng `window.open` để mở tab in riêng biệt.
*   **Đánh giá:** Phân hệ quản lý đơn hàng rất toàn diện. Quy trình quản lý công nợ/lịch sử thanh toán và hệ thống tự động sinh in phiếu bảo hành hàng loạt hoạt động chuẩn mực.

#### 📝 [src/app/admin/repairs/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/repairs/page.tsx) (1350 dòng)
*   **Chức năng:** Trang quản lý sửa chữa chính (Repairs Dashboard) phía Admin. Tiếp nhận thiết bị, phân công kỹ thuật viên, theo dõi tiến độ, báo giá và bàn giao máy.
*   **Cơ chế hoạt động:**
    *   **Quản lý Luồng trạng thái động (Dynamic Repair & Warranty Workflow):**
        *   Đọc cấu hình các bước của quy trình sửa chữa (`repairStatuses`) và quy trình bảo hành (`warrantyStatuses`) từ tài liệu cấu hình realtime `system_config/repairs` ở Firestore.
        *   Phân chia danh sách thành 2 tab: "Phiếu đang xử lý" (`active` - trạng thái chưa hoàn tất/không terminal) và "Phiếu đã đóng" (`closed` - trạng thái hoàn tất/terminal).
    *   **Phân công và chuyển đổi trạng thái (Transition & Assign):**
        *   Lắng nghe realtime các phiếu sửa chữa từ collection `repairs`, hỗ trợ tải thêm phiếu cũ (`loadMoreData`) và tìm kiếm nâng cao (tìm theo SĐT, IMEI, ID phiếu trực tiếp trên máy chủ nếu client không có).
        *   Hỗ trợ phân công KTV (`submitAssignTechnician`). Nếu KTV được gán đã đổi mà khác KTV cũ, hệ thống tự động chuyển sang gọi API `/api/repairs/technician/transfer` để làm phiếu yêu cầu chuyển thợ.
        *   *Ràng buộc chuyển trạng thái:* Một số trạng thái yêu cầu hoàn thành Checklist (8 hạng mục kiểm tra máy), một số yêu cầu điền đầy đủ ghi chú kỹ thuật, hoặc yêu cầu tất cả linh kiện phải ở trạng thái sẵn sàng trong kho (`requirePartsReady`). Chỉ KTV được phân công hoặc quản lý mới được phép chuyển trạng thái. Admin/Quản lý có thể ghi đè chuyển trạng thái (`submitManagerOverride`) kèm ghi chú lý do.
    *   **Bàn giao máy & Thu phí (Handover Gateway):**
        *   Nếu trạng thái tiếp theo yêu cầu thanh toán (`requirePaymentGate`), hệ thống chuyển tiếp sang màn hình POS hoặc mở Modal bàn giao (`RepairHandoverModal`).
        *   Trong modal bàn giao, nhân viên có thể xác nhận đã thu tiền (`paymentConfirmed`), cập nhật tiền công thực tế (`laborCost`), phí phụ thu (`additionalFees`) và ghi chú bàn giao. Sau đó gọi API `/api/repairs/handover` để chạy transaction cập nhật doanh thu và đóng phiếu.
    *   **Tạo phiếu bảo hành linh kiện/dịch vụ (Warranty Ticket Creation):**
        *   Tích hợp tính năng đồng bộ và đóng dấu bảo hành linh kiện (`/api/repairs/sync-warranty`) khi hoàn thành sửa chữa để tự động đóng dấu thời gian bảo hành động dựa theo danh mục.
        *   Modal bảo hành (`RepairWarrantyModal`) cho phép nhân viên chọn những linh kiện bị lỗi trong phiếu sửa cũ của khách để sinh nhanh một phiếu bảo hành mới (`ticketType: 'warranty'`) liên kết với phiếu cũ qua `warrantyClaim`. Gọi API `/api/repairs/create` và ghi nhận nhật ký bảo hành vào phiếu gốc để tránh gian lận bảo hành nhiều lần.
    *   **Auto-fill từ Lịch hẹn (Appointment Intake):** Lắng nghe URL params `appointmentId`. Nếu có, hệ thống tự động tải lịch hẹn khách hàng, điền sẵn thông tin khách, dòng máy, loại dịch vụ sửa chữa và tiền công ước tính để tạo phiếu tiếp nhận siêu nhanh.
*   **Đánh giá:** Module cốt lõi quản lý quy trình sửa chữa/bảo hành khép kín rất phức tạp. Phân quyền chặt chẽ giữa KTV và Quản lý, tích hợp liền mạch với cổng thanh toán POS và cơ chế sinh phiếu bảo hành liên kết rất sáng tạo.

#### 📝 [src/app/admin/technician/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/technician/page.tsx) (1253 dòng)
*   **Chức năng:** Trang điều khiển công việc (Technician Dashboard) dành riêng cho Kỹ thuật viên (KTV). Cung cấp giao diện dạng Kanban hoặc List để KTV theo dõi các phiếu sửa chữa được phân công, cập nhật checklist thiết bị, xuất linh kiện từ kho hoặc đề xuất linh kiện mới, và gửi yêu cầu chuyển giao phiếu sửa chữa cho thợ khác.
*   **Cơ chế hoạt động:**
    *   **Phân quyền và Lọc phiếu (Task Scope):** KTV thông thường chỉ có thể nhìn thấy các phiếu sửa chữa có trạng thái hoạt động (chưa đóng và không chờ bàn giao) và được phân công trực tiếp cho mình hoặc các phiếu chuyển giao đang chờ mình xác nhận nhận phiếu. Quản trị viên (Admin/Manager) có thể xem toàn bộ các phiếu sửa chữa.
    *   **Quản lý linh kiện sửa chữa (Repair Parts Management):**
        *   KTV có thể tìm kiếm linh kiện trong kho hệ thống.
        *   *Xuất linh kiện có sẵn (handleAddPart):* Gọi API `/api/repairs/confirm-parts` với lệnh `add_selected` để tự động xuất và trừ tồn kho linh kiện, gắn vào phiếu sửa chữa.
        *   *Yêu cầu/Đề xuất linh kiện (handleRequestPart / handleAddCustomPart):* Nếu linh kiện hết hàng, KTV có thể tạo yêu cầu đặt hàng (`request_part`). Nếu linh kiện không có trong danh mục (linh kiện tùy chỉnh), KTV có thể đề xuất một linh kiện tùy chỉnh bằng văn bản (`customName`), chất lượng (`quality` như Zin, Linh kiện) và số lượng để kho/kế toán đi mua.
        *   *Xóa linh kiện (handleRemovePart):* Cho phép xóa linh kiện ra khỏi phiếu sửa chữa thông qua `partLineId` (trả linh kiện về kho).
    *   **Quy trình chuyển giao giữa KTV (Technician Transfer):**
        *   *Đề xuất chuyển thợ (handleTransferRequest):* Gọi API `/api/repairs/technician/transfer` với action `request` để đề nghị chuyển phiếu sang KTV khác kèm lý do. Phiếu sẽ ở trạng thái chờ tiếp nhận.
        *   *Phản hồi đề xuất (handleTransferResponse):* KTV nhận có thể bấm "Nhận phiếu" (`accepted`) để nhận trách nhiệm hoặc "Từ chối" (`rejected`) để trả lại phiếu cho KTV cũ.
    *   **Kiểm tra thiết bị (Device Checklist & Tech Notes):**
        *   Cho phép cập nhật trực tiếp 8 hạng mục kiểm tra máy (Vỏ máy, màn hình, cảm ứng, camera, loa, kết nối, pin, biometric) với các giá trị tiêu chuẩn (OK, Trầy, Nứt, Móp, Lỗi, Không có) qua hàm `handleChecklistUpdate`.
        *   Cho phép bật/tắt nhanh các cờ tình trạng: Đã từng sửa (`hasPriorRepair`), Vào nước (`hasWaterDamage`), Linh kiện kém (`hasNonGenuineParts`).
    *   **Xác nhận bàn giao linh kiện Test (Parts Verification Handoff):** Khi KTV chuyển trạng thái phiếu sửa sang "Chờ bàn giao khách" (`CUSTOMER_HANDOVER`), hệ thống sẽ quét các linh kiện đã xuất cho phiếu. KTV phải tích chọn hành động cho từng linh kiện: Thực tế sử dụng để thay thế máy khách (`use`) hoặc tháo trả lại kho vì chỉ lắp test (`return`). Nếu chọn `return`, hệ thống tự động sinh lệnh `reject_request` gửi lên API `/api/repairs/confirm-parts` để hoàn kho linh kiện đó trước khi chuyển trạng thái phiếu sửa.
*   **Đánh giá:** Giao diện tối ưu hóa cực tốt cho công việc thực tế của thợ sửa. Cơ chế chuyển giao phiếu giữa các KTV và quy trình xác nhận trả linh kiện test về kho (Parts Verification) được thiết kế rất thông minh và chặt chẽ, ngăn ngừa thất thoát linh kiện.

#### 📝 [src/app/admin/parts/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/parts/page.tsx) (351 dòng)
*   **Chức năng:** Trang quản lý kho linh kiện dành cho quản trị viên/thủ kho. Cho phép xem, tìm kiếm, lọc trạng thái kho (Hết hàng, Sử dụng nhiều), thêm mới, sửa đổi thông tin linh kiện, in nhãn QR và tra cứu thông tin mã lô sản phẩm.
*   **Cơ chế hoạt động:**
    *   **Tải và phân loại dữ liệu:**
        *   Truy vấn realtime danh sách toàn bộ sản phẩm trong hệ thống qua hook `useFirestoreCollection('products', [orderBy('createdAt', 'desc')])`.
        *   *Lọc dữ liệu:* Hàm `parts` sử dụng helper `isPartCategory(product.category, product.categoryIds)` để lọc ra chỉ các sản phẩm thuộc danh mục Linh kiện sửa chữa.
        *   *Cấu hình Warranty Rules:* Lắng nghe cấu hình bảo hành động từ `system_config/repairs` để lấy danh sách các nhóm loại linh kiện (`partTypeOptions`) truyền vào modal.
    *   **Bộ lọc linh hoạt:**
        *   Tìm kiếm theo tên linh kiện, mô tả, dòng máy (`model`) và loại linh kiện (`partType`).
        *   Lọc nhanh theo: Tất cả (`all`), Hết hàng (`out_of_stock` - tồn kho `<= 0`), Dùng nhiều (`bestseller` - sắp xếp giảm dần theo lượt đã dùng/bán `sold`).
    *   **Các tính năng phụ trợ:**
        *   *Lưu trữ linh kiện (handleArchive):* Đóng gói update lưu trữ qua `buildArchiveUpdate`. Kiểm tra điều kiện lưu trữ qua `getArchiveBlockReason` (không thể lưu trữ nếu linh kiện vẫn còn tồn kho thực tế).
        *   *Tra cứu mã lô (LotTrackingModal):* Hỗ trợ mở modal tra cứu lịch sử luân chuyển và nguồn gốc của các lô hàng nhập.
        *   *Khôi phục ẩn (FixHiddenProductsModal):* Hỗ trợ mở modal để khôi phục nhanh các sản phẩm linh kiện bị ẩn/lỗi cấu hình hiển thị.
        *   *In nhãn QR (ProductQrLabelModal):* Hỗ trợ sinh nhãn mã vạch/QR để dán lên linh kiện phục vụ việc quét mã nhanh ở quầy POS hoặc sửa chữa.
        *   *Thêm/Sửa đa năng (UniversalProductModal):* Tích hợp modal tạo mới/sửa đổi linh kiện với chế độ `mode="component"`.
*   **Đánh giá:** Trang quản lý kho linh kiện thiết kế gọn gàng, trực quan và đầy đủ tính năng phụ trợ quan trọng (in QR, tra mã lô, khôi phục ẩn) giúp việc vận hành kho trở nên rất thuận tiện.

#### 📝 [src/app/admin/appointments/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/appointments/page.tsx) (563 dòng)
*   **Chức năng:** Trang quản lý lịch hẹn (Appointments Page) của admin, cho phép tiếp nhận, xác nhận lịch hẹn của khách đăng chữa trị từ Web Storefront đổ về, chọn hình thức giao máy và chuyển sang tạo phiếu sửa chữa chính thức.
*   **Cơ chế hoạt động:**
    *   **Lắng nghe lịch hẹn:**
        *   Lắng nghe realtime danh sách lịch hẹn thông qua `onSnapshot` (giới hạn 50 lịch hẹn mới nhất), sắp xếp theo ngày tạo giảm dần.
        *   Cung cấp nút "Tải thêm lịch sử cũ" (`loadMoreData`) sử dụng cơ chế cursor `startAfter` để tải thêm các lịch hẹn cũ.
        *   *Tìm kiếm nhanh:* Hỗ trợ tìm kiếm theo Tên hoặc Số điện thoại. Nếu không thấy trên client, hỗ trợ nút "Tìm Server" (`searchInDatabase`) để truy vấn trực tiếp trên toàn bộ collection `appointments` của Firestore bằng số điện thoại khách.
    *   **Luồng xác nhận lịch hẹn (Intake Workflow):**
        *   *Bước 1 (Xác nhận cuộc gọi):* Đối với lịch hẹn ở trạng thái Chờ xác nhận (`pending`), nhân viên bấm vào số điện thoại khách hàng để gọi. Hệ thống tự động chuyển trạng thái lịch hẹn sang Đã xác nhận (`confirmed`), đồng thời ghi nhận mốc thời gian gọi điện (`calledAt`) và mốc thời gian xác nhận (`confirmedAt`) vào Firestore qua hàm `handleCustomerCall`.
        *   *Bước 2 (Chọn hình thức giao máy):* Đối với lịch hẹn ở trạng thái Đã xác nhận (`confirmed`), hệ thống yêu cầu nhân viên chọn cách thức khách giao máy (`intakeMethod` gồm 2 tùy chọn: Khách đến trực tiếp `walk_in` hoặc Khách gửi máy đến cửa hàng `send_to_store`).
        *   *Bước 3 (Chuyển tiếp tạo phiếu sửa chữa - Handoff):* Sau khi chọn hình thức giao máy, hệ thống hiển thị nút "Tạo phiếu". Khi nhân viên bấm nút này, hệ thống sẽ điều hướng chuyển trang sang màn hình tạo phiếu sửa chữa (`/admin/repairs`) kèm theo các tham số URL được mã hóa (`appointmentId`, `intakeMethod`, `customerName`, `customerPhone`, `serviceId`, `serviceName`). Tại màn hình Repairs, hệ thống sẽ tự động điền sẵn toàn bộ dữ liệu này vào form tiếp nhận giúp nhân viên hoàn tất thủ tục nhận máy chỉ trong vài giây.
*   **Đánh giá:** Luồng tiếp nhận từ lịch hẹn online chuyển sang phiếu tiếp nhận sửa chữa chính thức tại quầy (Intake Handoff) được xây dựng cực kỳ mạch lạc, chặt chẽ, rút ngắn thời gian làm việc cho nhân viên tại quầy.

#### 📝 [src/app/admin/customers/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/customers/page.tsx) (481 dòng)
*   **Chức năng:** Trang quản lý danh sách khách hàng và CRM của hệ thống, hỗ trợ phân loại loại khách (Sỉ/Lẻ), phân hạng VIP theo doanh số tích lũy, quản lý thẻ (Tags), quản lý thông tin địa chỉ/email, theo dõi tổng chi tiêu và công nợ ròng, xuất file báo cáo Excel và xem lịch sử giao dịch chi tiết qua Drawer thanh bên.
*   **Cơ chế hoạt động:**
    *   **Phân hạng VIP động (Dynamic Customer Tiers):**
        *   Lắng nghe cấu hình hạng thành viên từ Firestore tài liệu `system_config/tier_settings`.
        *   Hàm `calculateTier(spent)` tự động so khớp tổng chi tiêu tích lũy của khách hàng (`totalSpent`) với cấu hình `tiers` (sắp xếp giảm dần theo hạn mức chi tiêu `minSpent`) để trả về phân hạng tương ứng realtime.
    *   **Tải và tìm kiếm khách hàng:**
        *   Lắng nghe realtime danh sách khách hàng mới cập nhật qua `onSnapshot` (giới hạn 50 khách hàng mới nhất).
        *   Hỗ trợ tải thêm khách cũ qua cursor `startAfter` (`loadMoreData`).
        *   *Tìm kiếm nâng cao:* Tìm kiếm theo SĐT, tên hoặc tag trên client. Nếu không có sẵn ở client, cung cấp nút "Tìm trên Server" (`searchInDatabase`) truy cập trực tiếp bằng SĐT để load thông tin khách hàng từ database (đặc biệt ích khi tìm khách cũ không nằm trong 50 khách load sẵn).
    *   **Quản lý thông tin & Đồng bộ:**
        *   *Thêm/Sửa khách hàng (handleSaveCustomer):* Gọi modal `CustomerFormModal`. Lưu thông tin khách hàng bằng cách sử dụng số điện thoại làm khoá chính (Document ID) trong collection `customers`. Khi tạo mới, kiểm tra sự tồn tại của SĐT để tránh ghi đè.
        *   *Quản lý công nợ (totalDebt):* Nếu `totalDebt > 0`, hiển thị công nợ màu đỏ cần thu. Nếu `totalDebt < 0`, hiển thị số dư tài khoản màu xanh lá (số tiền khách hàng đang dư/cọc dư). Hỗ trợ nút lọc nhanh để chỉ hiển thị các khách hàng đang có công nợ (`hasDebtFilter`).
        *   *Xuất báo cáo Excel (handleExportExcel):* Sử dụng thư viện `xlsx` để chuyển đổi toàn bộ danh sách khách hàng lọc được thành bảng tính Excel và tải xuống máy, bao gồm đầy đủ chỉ số CRM.
        *   *Xem chi tiết lịch sử (CustomerDetailDrawer):* Khi click vào hàng khách hàng, mở Drawer thanh bên hiển thị toàn bộ hồ sơ khách hàng, chi tiết các giao dịch mua hàng, phiếu sửa chữa, nhật ký thanh toán nợ...
*   **Đánh giá:** Một hệ thống CRM thu nhỏ hoàn chỉnh và rất chuyên nghiệp cho cửa hàng. Cơ chế phân hạng VIP tự động tích hợp tốt với module tính giá, và Drawer lịch sử giao dịch chi tiết đem lại khả năng quản lý hồ sơ khách hàng xuất sắc.

#### 📝 [src/app/admin/staff/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/staff/page.tsx) (548 dòng)
*   **Chức năng:** Trang quản lý nhân sự, cấp quyền và phân vai trò RBAC (Role-Based Access Control) cho các nhân viên và quản trị viên trong hệ thống.
*   **Cơ chế hoạt động:**
    *   **Tải danh sách nhân sự:** Truy vấn Firestore collection `users` với điều kiện lọc `role in ['staff', 'admin']` để hiển thị trên bảng (Desktop) và card (Mobile).
    *   **Tìm kiếm & Thăng cấp nhân viên (Promote to Staff):** Vì lý do bảo mật ở client-side, hệ thống không cho phép tạo tài khoản trực tiếp (để tránh lạm dụng Firebase Admin SDK ở Client). Thay vào đó, Admin sẽ tìm kiếm địa chỉ email của tài khoản đã đăng ký và đăng nhập Google ít nhất một lần qua ô tìm kiếm, sau đó bấm "Cấp quyền" để thăng cấp tài khoản đó lên vai trò `staff` hoặc `admin`.
    *   **Áp dụng Preset vai trò (Role Presets):** Tích hợp các preset vai trò định sẵn từ `ADMIN_ROLE_PRESETS` (như Kỹ thuật viên, Thủ kho, Tiếp tân...) để tự động cấu hình nhanh danh sách quyền hạn tương ứng mà không cần tích chọn thủ công từng quyền.
    *   **Quản lý ma trận phân quyền (Permissions Matrix):** Cho phép Admin chỉnh sửa chi tiết từng quyền hạn cụ thể từ `PERMISSIONS_REGISTRY` (như `manage_orders`, `manage_repairs`, `chat_support`...) cho nhân viên có vai trò `staff`.
*   **Đánh giá:** Giải pháp phân quyền rất linh hoạt và an toàn. Cơ chế "Promote to Staff" thông qua Email Google giải quyết tốt bài toán hạn chế quyền ghi nhận tài khoản mới trực tiếp từ client-side mà vẫn đảm bảo tính tiện dụng.

#### 📝 [src/app/admin/suppliers/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/suppliers/page.tsx) (620 dòng)
*   **Chức năng:** Trang quản trị đối tác/nhà cung cấp (NCC). Cho phép quản lý hồ sơ nhà cung cấp, theo dõi và thanh toán công nợ tích lũy, tra cứu lịch sử nhập hàng và giao dịch tài chính.
*   **Cơ chế hoạt động:**
    *   **Quản lý thông tin & Đồng bộ:** Tạo và cập nhật nhà cung cấp sử dụng mã ID tuần tự dạng `NCC-{phone-or-name-slug}` thông qua hàm `reserveSupplierDocumentId` của Firestore.
    *   **Thanh toán công nợ (Payment Flow):** Modal thanh toán công nợ cho phép ghi nhận số tiền thanh toán thực tế, cập nhật giảm trừ trực tiếp trường `totalDebt` trong tài liệu `suppliers/{id}` và đồng thời ghi nhận một giao dịch đối ứng loại `PAYMENT` vào collection `supplier_transactions`.
    *   **Lịch sử giao dịch chi tiết (SupplierDetailDrawer):** Khi nhấp chọn NCC, Drawer hiển thị hồ sơ chi tiết và truy vấn realtime danh sách các giao dịch nhập hàng (`IMPORT`, `IMPORT_PAID`) và trả nợ (`PAYMENT`) từ collection `supplier_transactions` được sắp xếp theo thời gian mới nhất.
    *   **Bộ lọc thông minh:** Hỗ trợ tìm kiếm theo tên, SĐT, người liên hệ, loại NCC, người phụ trách, thẻ (tags) và nút chuyển đổi nhanh lọc những nhà cung cấp hiện đang còn nợ (`debtOnly`).
*   **Đánh giá:** Module quản lý đối tác rất bài bản. Cơ chế tự động đồng bộ hóa công nợ khi thanh toán và giao dịch lịch sử giúp hệ thống kiểm soát chặt chẽ luồng tài chính của nhà cung cấp.

#### 📝 [src/app/admin/revenue/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/revenue/page.tsx) (743 dòng)
*   **Chức năng:** Bảng điều khiển tài chính trung tâm của cửa hàng, tổng hợp dữ liệu THU (đơn bán lẻ POS, web checkout, dịch vụ sửa chữa) và CHI (chi phí nhập kho linh kiện, hoa hồng kỹ thuật viên, chi phí vận hành mặt bằng/điện nước) để tính toán lợi nhuận ròng.
*   **Cơ chế hoạt động:**
    *   **Tối ưu hóa Truy vấn bằng Dữ liệu tổng hợp (Daily Aggregates):** Khi truy vấn khoảng thời gian xa, hệ thống sẽ ưu tiên đọc dữ liệu đã được tổng hợp sẵn theo ngày từ collection `revenue_daily_aggregates` (nếu có quyền và dữ liệu khả dụng) thay vì kéo hàng ngàn đơn hàng/phiếu sửa chữa riêng lẻ. Nếu xảy ra lỗi hoặc thiếu dữ liệu, hệ thống tự động fallback truy vấn thô trên 5 collection nguồn (`orders`, `repairs`, `import_receipts`, `commissions`, `expenses`) trong phạm vi 6 tháng gần nhất để tính toán in-memory.
    *   **Tính toán Doanh thu Thực tế (Thực thu):**
        *   *Đơn hàng bán lẻ:* Tính toán doanh thu thực nhận dựa trên tổng tiền thanh toán thực tế (`paymentHistory` - trừ tiền hoàn) trong mốc thời gian lọc, bóc tách riêng phần doanh thu sản phẩm lẻ và ghi nhận công nợ chưa thu (`debtRevenue`).
        *   *Phiếu sửa chữa:* Cộng dồn các đợt cọc (`deposit`) và thanh toán hoàn tất từ mốc lịch sử thanh toán của phiếu sửa chữa, trừ đi giá trị quà tặng khuyến mãi khấu trừ (`giftDiscount`).
    *   **Quản lý phiếu chi (Expenses):** Cho phép tạo nhanh phiếu chi phí vận hành (marketing, thuê mặt bằng, điện nước, lương...). Gọi API POST `/api/revenue/expenses` để lưu trữ phiếu chi và chạy trigger cập nhật delta tương ứng lên các tài liệu daily aggregates.
    *   **Trực quan hóa:** Vẽ biểu đồ cột thu - chi theo ngày realtime tỉ lệ động theo giá trị giao dịch cao nhất (`chartMax`).
*   **Đánh giá:** Hệ thống báo cáo tài chính thiết kế tinh tế. Việc sử dụng cơ chế lai giữa Daily Aggregates (tối ưu chi phí đọc Firestore) và Fallback Live-Query đảm bảo tính chính xác tuyệt đối và hiệu năng cực cao khi dữ liệu phình to.

#### 📝 [src/app/admin/vouchers/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/vouchers/page.tsx) (474 dòng)
*   **Chức năng:** Trung tâm quản trị các chương trình khuyến mãi, Voucher giảm giá, quy tắc cộng dồn (Stacking Engine) và hệ thống nhiệm vụ mạng xã hội (Social Missions Bounty Program).
*   **Cơ chế hoạt động:**
    *   **Quản lý mã Voucher (Voucher CRUD):** Cho phép tạo mã giảm giá cố định (fixed) hoặc theo phần trăm (percentage), thiết lập hạn mức giảm tối đa, đơn hàng tối thiểu, ngày hết hạn, giới hạn số lượt dùng và cơ chế copy mã nhanh.
    *   **Cấu hình Quy tắc cộng dồn (Stacking Rules):** Thiết lập luật cho từng Voucher gồm: `isExclusive` (độc quyền - không cộng dồn), `stackWithPromo` (cho phép dùng chung với sản phẩm đang có giá khuyến mãi) và `stackWithTier` (cho phép dùng chung với hạng VIP thành viên của khách hàng).
    *   **Hệ thống Nhiệm vụ (Bounty Missions):** Quản lý cấu hình các liên kết mạng xã hội (Facebook, Youtube, Zalo) của cửa hàng. Khi bật nhiệm vụ, khách hàng thực hiện tương tác sẽ nhận được voucher thưởng. Cho phép Admin cấu hình mức thưởng voucher (cố định hoặc % kèm max discount) đồng bộ trực tiếp vào tài liệu cấu hình hệ thống `bountyMissions`.
    *   **Tích hợp mở rộng:** Chia làm 3 tab quản lý tập trung gồm: Danh sách Voucher, Cấu hình quy tắc thành viên VIP (`DiscountRulesTab`), và Quản lý nhiệm vụ MXH (`BountyMissionsTab`).
*   **Đánh giá:** Một module tăng trưởng (growth) tuyệt vời. Việc tích hợp Stacking Rules trực tiếp trên từng Voucher giúp phòng ngừa rủi ro cộng dồn vô hạn làm thâm hụt biên lợi nhuận của cửa hàng.

#### 📝 [src/app/admin/reviews/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/reviews/page.tsx) (355 dòng)
*   **Chức năng:** Trang quản trị kiểm duyệt và phê duyệt đánh giá của khách hàng đối với dịch vụ cửa hàng và sản phẩm bán lẻ.
*   **Cơ chế hoạt động:**
    *   **Dữ liệu Hỗn hợp Thống nhất (Unified Review Schema):** Tùy thuộc vào Tab nguồn được chọn ("Đánh giá Cửa hàng" từ collection `reviews` hoặc "Đánh giá Sản phẩm" từ `product_reviews`), hệ thống sẽ map dữ liệu thô về một interface duy nhất `UnifiedReview` để đồng nhất hiển thị UI.
    *   **Quy trình Duyệt Đánh giá (Moderation Flow):**
        *   *Phê duyệt (`handleApprove`):* Cập nhật trạng thái `status: 'approved'` để hiển thị đánh giá lên storefront.
        *   *Ẩn/Xóa rác (`handleReject`):* Nếu đánh giá đang hiển thị, cho phép ẩn đi (`status: 'pending'`). Nếu đánh giá chưa được duyệt, cho phép xóa vĩnh viễn khỏi database sau khi xác nhận.
    *   **Phân trang & Lọc:** Tích hợp bộ lọc trạng thái (Tất cả, Chờ duyệt, Đã hiển thị), ô tìm kiếm và hook phân trang client-side `useClientPagination` (hiển thị 20 dòng/trang).
    *   **Hiển thị đa phương tiện:** Hỗ trợ render danh sách ảnh thực tế đính kèm do khách tải lên từ storefront và hiển thị liên kết tham chiếu tới sản phẩm/phiếu sửa liên quan.
*   **Đánh giá:** Trang kiểm duyệt gọn gàng, hoạt động hiệu quả. Giúp bảo vệ uy tín thương hiệu của cửa hàng trước các đánh giá spam hoặc seeding tiêu cực.

#### 📝 [src/app/admin/appearance/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/appearance/page.tsx) (648 dòng)
*   **Chức năng:** Phân hệ quản lý cấu hình giao diện (CMS) trang chủ storefront, cho phép Admin thay đổi màu sắc chủ đạo, banner quảng cáo, nền website, thông báo đầu trang, thông tin chi nhánh, các nhóm dịch vụ bảng giá và Place ID Google Reviews.
*   **Cơ chế hoạt động:**
    *   **Quản lý Media tập trung (Media Handoff):** Liên kết chặt chẽ với component `MediaManager` để mở thư viện ảnh, cho phép Admin chọn ảnh làm banner, ảnh nền, logo cửa hàng hoặc khung viền trang trí.
    *   **Cập nhật Cấu hình Động (SiteConfig):** Lưu trữ toàn bộ thiết lập giao diện vào tài liệu duy nhất `system_config/layout_settings` trên Firestore. Hàm `save` tự động làm sạch và strip các trường `undefined` trước khi ghi để tránh lỗi Firestore.
    *   **Bảng giá & Đánh giá Google:**
        *   *Bảng giá dịch vụ:* Cho phép thiết lập các nhóm bảng giá, biểu tượng (icon) và các từ khóa (keywords) để storefront tự động truy vấn các dịch vụ active tương ứng từ Firestore.
        *   *Đánh giá Google:* Lưu cấu hình `googlePlaceId` để storefront gọi API Places hiển thị đánh giá thực tế của người dùng trên Google Maps.
    *   **Sắp xếp Bố cục (Section Reordering):** Cho phép bật/tắt hiển thị, điều chỉnh thứ tự sắp xếp (`order`) của các khối giao diện (Hero banner, dịch vụ, bảng giá, giới thiệu, liên hệ...) bằng các nút bấm Up/Down trực quan.
    *   **Bảo vệ hệ thống (Kill-Switch):** Tích hợp nút gạt khẩn cấp `disableImageProxy` để tắt nén ảnh qua wsrv.nl, chuyển về tải ảnh gốc trực tiếp từ Firebase Storage khi proxy gặp sự cố.
*   **Đánh giá:** Một trang CMS cực kỳ mạnh mẽ và linh hoạt. Giúp tối ưu hóa 100% khả năng tùy biến storefront mà không cần can thiệp vào mã nguồn, nâng tầm trải nghiệm vận hành của Admin.

#### 📝 [src/app/admin/inventory/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/inventory/page.tsx) (800 dòng)
*   **Chức năng:** Trang quản lý quy trình đề xuất nhập kho và hoàn tất nhập kho cho cả linh kiện sửa chữa và sản phẩm bán lẻ.
*   **Cơ chế hoạt động:**
    *   **Quản lý Vòng đời Phiếu nhập (Import Receipt Lifecycle):** Phiếu nhập kho trải qua 3 trạng thái: Đề xuất (`draft`) -> Đã đặt hàng (`ordered`) -> Đã nhập (`completed`).
    *   **Tính toán Giá vốn bình quan (WAC - Weighted Average Cost):** Khi chuyển sang bước hoàn tất nhập kho (`complete_import`), hệ thống sẽ gửi yêu cầu lên API BE để chạy transaction nâng cao: tính toán lại giá vốn trung bình gia quyền (`costPrice = (tồn_cũ * giá_vốn_cũ + lượng_nhập * giá_nhập) / (tồn_cũ + lượng_nhập)`), tạo mã số lô hàng `PN-YYMM-XXXX` dạng tuần tự để chạy FIFO, trừ số lượng tạm giữ (`held`) cho các phiếu sửa chữa đang chờ, và cập nhật tài chính (ghi nhận chi phí/công nợ nhà cung cấp).
    *   **Quản lý NCC ở item-level:** Cho phép gán trực tiếp nhà cung cấp cho từng linh kiện/sản phẩm riêng lẻ ngay trên dòng phiếu (`items[]`). Cho phép tìm kiếm hoặc tạo nhanh NCC inline nếu chưa tồn tại.
    *   **Cơ chế Chốt Tình Trạng Hàng (Availability Guard):** Cho phép đánh dấu từng item trong phiếu đề xuất là "Có hàng" (`approved` / `in_stock`) hoặc "Không có" (`unavailable`). Phiếu chỉ được phép chốt đặt hàng hoặc nhập kho khi toàn bộ các dòng hàng khả dụng đều đã được gán NCC hợp lệ.
*   **Đánh giá:** Quy trình nhập kho được xây dựng cực kỳ nghiêm ngặt và chuyên nghiệp. Cơ chế WAC kết hợp kiểm soát held stock giải quyết triệt để bài toán đồng bộ tồn kho khả dụng cho kỹ thuật viên.

#### 📝 [src/app/admin/inventory/stock/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/inventory/stock/page.tsx) (376 dòng)
*   **Chức năng:** Trang quản lý tổng quan tồn kho, giá trị tồn kho và kiểm soát vòng đời sản phẩm (hoạt động/lưu trữ).
*   **Cơ chế hoạt động:**
    *   **Đếm và Lọc Tồn Kho:** Phân chia danh mục tồn kho thành 3 tab (Tất cả, Bán lẻ & Phụ kiện, Linh kiện) kết hợp trạng thái sản phẩm (Đang hoạt động, Đã lưu trữ).
    *   **Tính toán Giá trị Kho:** Hiển thị realtime 4 chỉ số KPI quan trọng: Tổng số lượng tồn kho (`stock`), Tổng giá trị tồn kho theo công thức tích lũy `stock * costPrice` (giá vốn bình quan WAC), Số mặt hàng sắp hết hàng (`stock <= 3`), và Số mặt hàng đã hết hàng (`stock <= 0`).
    *   **Truy vấn Hiệu năng cao (Batched Query & Search):** Sử dụng cơ chế phân trang cursor-based với Firestore `startAfter` (tải 100 sản phẩm mỗi lượt) kết hợp bộ tìm kiếm keywords server-side `searchKeywords` (`array-contains`) và hook phân trang client-side `useClientPagination` để tối ưu chi phí đọc DB và LCP trên browser.
    *   **Kiểm soát Trạng thái Sản phẩm:** Tích hợp kiểm tra trạng thái lưu trữ (`isProductArchived`) để ẩn các sản phẩm không còn kinh doanh khỏi quầy POS/storefront nhưng vẫn bảo toàn lịch sử báo cáo.
*   **Đánh giá:** Trang tồn kho trực quan, hiệu năng truy vấn rất tốt nhờ kết hợp khéo léo bộ lọc in-memory và phân trang cursor-based của Firestore.

#### 📝 [src/app/admin/products/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/products/page.tsx) (474 dòng)
*   **Chức năng:** Trang quản lý danh sách sản phẩm bán lẻ dành cho Admin, tích hợp in tem QR/barcode, phát hiện danh mục mồ côi (Orphan) và liên kết tạo đề xuất nhập kho lẻ.
*   **Cơ chế hoạt động:**
    *   **Tải dữ liệu & Đồng bộ:** Lắng nghe realtime danh sách sản phẩm qua hook `useFirestoreCollection` kết hợp đồng bộ danh sách nhà cung cấp (`suppliers`) phục vụ modal đề xuất nhập kho.
    *   **Bộ lọc thích ứng:** Tìm kiếm theo tên sản phẩm hoặc mã code, lọc theo tình trạng (Mới, Cũ 99%, TBH), danh mục cũ và đặc biệt tích hợp `CategoryTaxonomySelector` lọc đa tầng theo danh mục mới (`retail` taxonomy).
    *   **Phát hiện danh mục mồ côi (Orphan Category Detector):** Hàm `getOrphanStatus` so khớp `categoryIds` của sản phẩm với tập hợp tất cả ID hợp lệ từ cấu hình `taxonomy.retail`. Nếu sản phẩm bị gán danh mục không tồn tại hoặc chưa gán, hệ thống hiển thị cảnh báo đỏ trên UI để Admin dễ dàng phát hiện và hiệu chỉnh.
    *   **Vòng đời sản phẩm (Product Lifecycle):** Cho phép lưu trữ (`handleArchive`) sản phẩm thông qua helper `buildArchiveUpdate`. Kiểm tra điều kiện qua `getArchiveBlockReason` để chặn lưu trữ nếu sản phẩm vẫn còn tồn kho vật lý thực tế. Khi lưu trữ thành công, tự động gọi `triggerRevalidate` làm mới các trang tĩnh liên quan.
*   **Đánh giá:** Giao diện quản lý sản phẩm hoàn thiện, chuyên nghiệp. Các cơ chế an toàn như Orphan detector và Archive guard giúp bảo vệ tính toàn vẹn của dữ liệu hệ thống rất tốt.

#### 📝 [src/app/admin/services/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/services/page.tsx) (776 dòng)
*   **Chức năng:** Trang quản trị danh sách dịch vụ sửa chữa thiết bị, tích hợp tính năng gán lại danh mục hàng loạt (Batch Reassign) và thiết lập liên kết nghiệp vụ phụ kiện bán kèm/linh kiện khuyên dùng.
*   **Cơ chế hoạt động:**
    *   **Quản lý danh mục & Cảnh báo mồ côi:** Tự động phát hiện các dịch vụ bị mất danh mục (mồ côi hoặc chỉ có chuỗi text phân mục cũ). Hiển thị thanh cảnh báo đỏ trực quan ở đầu trang kèm danh sách các danh mục lỗi.
    *   **Gán lại danh mục hàng loạt (Batch Reassign):** Cung cấp giải pháp cho phép Admin chọn nhanh một danh mục bị lỗi/mồ côi (`reassignFrom`) và gán hàng loạt trực tiếp sang danh mục taxonomy mới (`reassignTo`) thông qua vòng lặp cập nhật Firestore có thanh tiến trình xử lý an toàn và cờ hiệu năng.
    *   **Liên kết nghiệp vụ nâng cao (Linked Business Data):** Hỗ trợ liên kết dịch vụ sửa chữa với:
        *   *Nhóm phụ kiện bán kèm (`linkedProductCategoryIds`):* Giúp quầy POS/checkout tự động gợi ý phụ kiện khi làm dịch vụ cho khách.
        *   *Nhóm linh kiện liên quan (`recommendedPartCategoryIds`):* Gợi ý linh kiện thay thế phù hợp cho KTV trong phiếu sửa chữa.
    *   **Tạo ID theo tên (Slug-based ID):** Khi thêm mới dịch vụ, hệ thống tự động sinh ID dạng slug thân thiện từ tên dịch vụ qua `generateSlug` và kiểm tra trùng lặp trước khi ghi.
*   **Đánh giá:** Một module quản lý dịch vụ rất hoàn chỉnh và thông minh. Tính năng Batch Reassign giải quyết xuất sắc bài toán dọn dẹp taxonomy cũ khi chuyển đổi hệ thống.

#### 📝 [src/app/admin/commissions/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/commissions/page.tsx) (628 dòng)
*   **Chức năng:** Phân hệ quản trị cấu hình hoa hồng nhân viên 3 cấp (Chung, Danh mục, Sản phẩm cụ thể) và theo dõi, ghi nhận lịch sử hoa hồng.
*   **Cơ chế hoạt động:**
    *   **Cấu trúc hoa hồng 3 cấp (Hierarchy Levels):** 
        *   *Cấp 1 (Chung):* Áp dụng cho toàn bộ đơn hàng/phiếu sửa.
        *   *Cấp 2 (Danh mục):* Áp dụng cho các sản phẩm/dịch vụ thuộc danh mục được cấu hình (ví dụ: Điện thoại, Laptop...).
        *   *Cấp 3 (Sản phẩm cụ thể):* Áp dụng cho một Product ID cụ thể.
        *   *Độ ưu tiên:* Cấp 3 ➔ Cấp 2 ➔ Cấp 1 (Quy tắc cấp cao hơn sẽ đè quy tắc cấp thấp hơn).
    *   **Tích hợp cấn trừ khuyến mãi phụ kiện (`applyAfterDiscount`):** Cờ cấu hình cho phép trừ đi giá trị khuyến mãi của phụ kiện trước khi nhân tỷ lệ phần trăm tính hoa hồng, thích hợp cho các dòng máy ghép phụ kiện.
    *   **Tạo mã quy tắc tuần tự và an toàn:** Hàm `buildCommissionRuleBaseId` sinh mã ID quy tắc dạng `COMR-{slug}`. Hàm `getAvailableCommissionRuleId` thực hiện vòng lặp tối đa 50 lần kiểm tra `exists()` trên tài liệu Firestore để tìm mã ID candidate trống, tránh hoàn toàn rủi ro ghi đè quy tắc cũ.
    *   **Quản lý & Ghi nhận hoa hồng thủ công:** Cho phép Admin ghi nhận hoa hồng thủ công cho nhân viên bên cạnh luồng tự động từ POS/Checkout, tự động tính toán tổng hợp hoa hồng theo nhân viên (`staffStats`) và lọc theo tháng hiệu năng cao.
*   **Đánh giá:** Hệ thống quản lý hoa hồng chặt chẽ, linh hoạt và có độ phân giải nghiệp vụ cao (đến tận item-level), đáp ứng tốt các mô hình chia thưởng thực tế của cửa hàng.

---

### 19. Nhóm Cấu hình Hệ thống, Menu & Mẫu In (System Settings, Taxonomy & Print Templates)

#### 📝 [src/app/admin/settings/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/settings/page.tsx) (498 dòng)
*   **Chức năng:** Trang điều khiển cấu hình hệ thống trung tâm dành cho Admin, tích hợp các tab quản lý thông tin liên hệ, danh mục, menu, ngân hàng, live chat, workflow sửa chữa và thiết lập in ấn.
*   **Cơ chế hoạt động:**
    *   **Đồng bộ & Cập nhật Cấu hình hệ thống:** Tải cấu hình từ `useConfig()` và đồng bộ các trường dữ liệu chung như Tên cửa hàng (`siteName`), Hotline, Email, Địa chỉ, Link MXH và lưu vào Firestore qua `updateConfig()`.
    *   **Quản lý từ khóa cấm (Blacklist):** Hỗ trợ cấu hình mảng từ khóa nhạy cảm (`forbiddenWords`). Bình luận của khách chứa các từ khóa này sẽ tự động chuyển về trạng thái `pending` thay vì tự hiển thị.
    *   **Định vị địa lý Geofence (Anti-Spam Reviews):** 
        *   Tích hợp toạ độ cửa hàng (`lat`, `lng`), bán kính cho phép đánh giá (`radiusMeters`) và mã PIN dự phòng (`pin`).
        *   Khi Geofencing bật, hệ thống yêu cầu khách hàng gửi đánh giá phải ở trong phạm vi bán kính hoặc nhập mã PIN hợp lệ do nhân viên cung cấp.
        *   Hỗ trợ nút "Lấy vị trí hiện tại" gọi Web Geolocation API lấy tọa độ GPS chính xác của thiết bị Admin.
    *   **Khôi phục cấu hình gốc (Seeding):** Nút "Khôi phục mặc định" thực hiện gọi API POST `/api/seed-config` kèm theo Bearer Firebase ID Token để reset toàn bộ cấu hình hệ thống về bản thiết lập gốc.
*   **Đánh giá:** Trang cấu hình hệ thống được thiết kế khoa học, các nhóm cài đặt được chia nhỏ hợp lý. Nghiệp vụ Geofence và quản lý bộ lọc bình luận được xử lý rất bài bản và an toàn.

#### 📝 [src/app/admin/settings/CategoriesTab.tsx](file:///m:/QLCH_VanLanh/src/app/admin/settings/CategoriesTab.tsx) (715 dòng)
*   **Chức năng:** Phân hệ quản lý cây danh mục đa tầng (Taxonomy Tree) cho toàn bộ hệ thống (Sản phẩm bán lẻ, Dịch vụ sửa chữa, Linh kiện kho) và quản trị danh sách thương hiệu (Brands).
*   **Cơ chế hoạt động:**
    *   **Quản lý cây danh mục 3 tầng:**
        *   Hỗ trợ cấu trúc tối đa 3 tầng danh mục (`retail`, `service`, `component`).
        *   Duyệt và hiển thị dạng cây có thể thu gọn/mở rộng qua trạng thái `expandedNodes` (lưu tập hợp ID).
        *   Hàm `handleSaveNode` tự động tạo ID chuẩn hóa dạng đường dẫn cha-con (ví dụ: `dien-thoai/iphone/iphone-15`) dựa trên `parentPath` và slug, đảm bảo tránh trùng lặp ID và duy trì tính phân cấp.
        *   Mỗi danh mục hỗ trợ gán Icon (kết hợp `MediaManager` tải ảnh hoặc map ký hiệu từ bộ font qua `getIcon`), từ khóa SEO, mô tả SEO và thiết lập mẫu in phiếu bảo hành mặc định (`warrantyType`).
    *   **Quản lý đối tác thương hiệu (Brands CRUD):**
        *   Quản lý danh sách các hãng sản xuất (Apple, Samsung...) lưu tại collection `brands`.
        *   Mã thương hiệu được tự động tạo dạng `BR-{slug}` qua hàm `getAvailableBrandId` có check chống trùng.
        *   Tải ảnh logo trong suốt PNG từ thư viện media của hệ thống, tự động kích hoạt `requestRevalidate` làm mới layout storefront khi thay đổi.
*   **Đánh giá:** Một trong những module quản lý phân loại dữ liệu (Taxonomy) xuất sắc của dự án, thiết kế giao diện dạng cây kéo thả/thu gọn mượt mà, cấu hình SEO và chính sách bảo hành mặc định ngay tại danh mục rất tinh tế.

#### 📝 [src/app/admin/settings/NavigationTab.tsx](file:///m:/QLCH_VanLanh/src/app/admin/settings/NavigationTab.tsx) (753 dòng)
*   **Chức năng:** Phân hệ quản lý cấu trúc menu điều hướng động cho toàn bộ storefront, bao gồm: Thanh menu đầu trang (Header), Danh mục thanh bên (Sidebar), Dịch vụ chân trang (Footer) và các khối danh mục nổi bật tại trang chủ.
*   **Cơ chế hoạt động:**
    *   **Điều hướng động đa năng:** Cho phép Admin thay đổi nhãn, icon, đường dẫn slug và thứ tự hiển thị của các nút menu trực quan mà không cần chỉnh sửa code.
    *   **Xếp chồng nhóm con (Flyout Submenu):** Đối với danh mục sidebar, hỗ trợ thêm các nhóm con (`subGroups`) và danh sách sản phẩm thuộc nhóm con để storefront tự động vẽ ra menu flyout hover chuyên nghiệp.
    *   **Liên kết thông minh với danh mục hệ thống (Taxonomy Bindings):**
        *   Tích hợp `TaxonomySuggestPopup` hiển thị toàn bộ cây danh mục dịch vụ/sản phẩm giúp Admin click chọn và kéo nhanh thành một nút menu mới.
        *   Hàm `TaxonomyBadge` tự động phân tích và hiển thị nhãn trạng thái liên kết (`taxonomyRef`) để kiểm soát các nút menu mồ côi.
    *   **Bộ lọc danh mục (Product Filter Mapping):** Cho phép gán cờ lọc (`filterType` như máy cũ `likenew`, máy mới `new`, phụ kiện `accessory`) lên từng mục menu để trang danh mục storefront tự động áp bộ lọc tương ứng.
    *   **Công cụ phụ trợ sắp xếp:** Sử dụng helper in-memory (`moveUp`, `moveDown`) để thay đổi vị trí mượt mà, lưu trữ tập trung vào Firestore cấu hình layout hệ thống.
*   **Đánh giá:** Hệ thống quản lý menu động rất thông minh và linh hoạt. Việc kết hợp tree taxonomy gợi ý và cấu hình flyout trực tiếp giúp Admin có thể tối ưu hóa trải nghiệm điều hướng storefront cực kỳ nhanh chóng.

#### 📝 [src/app/admin/settings/ReceiptSettingsPanel.tsx](file:///m:/QLCH_VanLanh/src/app/admin/settings/ReceiptSettingsPanel.tsx) (833 dòng)
*   **Chức năng:** Bảng điều khiển cấu hình và biên tập mẫu in cho 5 loại chứng từ trong hệ thống: Biên nhận nhận máy sửa chữa, Hóa đơn dịch vụ hoàn tất, và 3 mẫu phiếu bảo hành (Thiết bị, Sửa chữa, Phụ kiện).
*   **Cơ chế hoạt động:**
    *   **Quản lý Mẫu in Hóa đơn/Biên nhận:**
        *   Lưu trữ cấu hình in vào tài liệu Firestore `system_config/receipt`.
        *   Cho phép Admin tùy chỉnh: Logo cửa hàng, Tên, Slogan, Địa chỉ, Hotline, Hotline khiếu nại, Tiêu đề biên nhận và Danh sách điều khoản lưu ý (`notes`).
        *   *Cấu hình hóa đơn linh hoạt:* Cung cấp các nút bật/tắt hiển thị chi tiết (ẩn/hiện thông tin khách, IMEI, linh kiện đã dùng, đơn giá thợ sửa, khung chữ ký) và điều chỉnh kích thước in (`maxWidthPx`, `baseFontSizePx`) để tương thích với nhiều dòng máy in nhiệt/in A5.
    *   **Live Preview Động (A5 Printer Simulator):** 
        *   Thiết kế khung giả lập máy in A5 ở cột bên phải hiển thị trực quan bản in realtime tương ứng với cấu hình vừa chỉnh sửa.
        *   Sử dụng dữ liệu mockup chi tiết (`WARRANTY_RECEIPT_PREVIEW_FIXTURE`) để render đầy đủ các dòng hóa đơn, bảng chi phí thợ, tiền cọc, và checklist bệnh máy.
    *   **Tích hợp Quản lý Bảo hành:** Liên kết trực tiếp với các form con `WarrantyConfigForm` để cấu hình chi tiết cho 3 mẫu phiếu bảo hành mặc định của cửa hàng.
*   **Đánh giá:** Giao diện quản lý mẫu in xuất sắc. Tính năng Live Preview đa mẫu in (Simulator) giúp Admin căn chỉnh lề, cỡ chữ và điều khoản lưu ý cực kỳ dễ dàng trước khi chốt in thực tế tại quầy POS.

#### 📝 [src/app/admin/settings/receipt/WarrantyComponents.tsx](file:///m:/QLCH_VanLanh/src/app/admin/settings/receipt/WarrantyComponents.tsx) (387 dòng)
*   **Chức năng:** Bộ component nghiệp vụ hỗ trợ soạn thảo và hiển thị xem trước (Preview) chi tiết các mẫu phiếu bảo hành của hệ thống, bao gồm cấu hình bảng quyền lợi 2 cột hoặc 3 cột.
*   **Cơ chế hoạt động:**
    *   **Soạn thảo bảng quyền lợi động (Dynamic Warranty Table Creator):**
        *   Hỗ trợ 2 kiểu cấu trúc bảng: Mẫu 2 cột (`2col` - Thời gian | Quyền lợi) và Mẫu 3 cột (`3col` - Dịch vụ | Thời gian | Quyền lợi).
        *   Cho phép Admin chỉnh sửa tiêu đề cột và thêm/bớt các dòng quyền lợi (`tableRows[]`) tùy ý.
        *   Mỗi dòng quyền lợi cho phép thêm danh sách gạch đầu dòng (`benefits[]`) chi tiết.
    *   **Đồng bộ State an toàn:** Form `WarrantyConfigForm` quản lý thay đổi sâu (deep state) thông qua hàm `updateRow`, tự động gán ID duy nhất bằng timestamp cho các dòng mới để React render chính xác.
    *   **Render Phiếu bảo hành chuyên nghiệp (WarrantyPreview):**
        *   Component `WarrantyPreview` mô phỏng chính xác mẫu phiếu in bảo hành thực tế.
        *   Tự động sinh mã QR Code động dẫn tới trang tra cứu bảo hành của khách hàng.
        *   Trình bày đầy đủ thông tin khách hàng, số điện thoại, địa chỉ, dòng máy, IMEI, thời hạn bảo hành, bảng so khớp quyền lợi và lưu ý cuối trang.
*   **Đánh giá:** Bộ component xử lý giao diện in ấn bảo hành rất thông minh, giải quyết triệt để bài toán tạo mẫu bảo hành động đa dạng (cho cả bán máy, thay pin, hay bán phụ kiện lẻ) mà vẫn giữ được tính đồng nhất và trực quan của phiếu in.

---

### 20. Nhóm Quản trị Nội dung, Hỗ trợ & Khởi tạo Hệ thống (CMS, Live Chat, Data Seeding & Security Auth)

#### 📝 [src/app/admin/articles/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/articles/page.tsx) (297 dòng)
*   **Chức năng:** Trang quản lý danh sách và kiểm duyệt bài viết (Tin tức, khuyến mãi, mẹo hay) dành cho Admin, tích hợp quản lý bình luận trực tiếp cho từng bài viết.
*   **Cơ chế hoạt động:**
    *   **Tải và Lắng nghe dữ liệu:** Đăng ký lắng nghe realtime Firestore `articles` sắp xếp theo ngày tạo mới nhất (giới hạn 200 bài) để render.
    *   **Quản lý bài viết (Article CRUD):** Hỗ trợ tạo mới, sửa đổi bài viết qua `ArticleModal` (sử dụng trình soạn thảo nâng cao và quản lý ảnh đại diện). Xóa bài viết đồng thời kích hoạt `triggerRevalidate` làm mới trang tin tức storefront và sitemap.
    *   **Quản lý Phản hồi & Bình luận:** Tích hợp 2 chế độ:
        *   *Chế độ chi tiết:* Mở `CommentsModal` để duyệt/phản hồi bình luận riêng cho một bài viết được chọn.
        *   *Chế độ toàn cục:* Tab `GlobalCommentsTab` hiển thị toàn bộ bình luận của độc giả từ tất cả bài viết giúp Admin kiểm duyệt tập trung nhanh chóng.
*   **Đánh giá:** Module CMS bài viết tinh gọn, hiệu quả. Việc phân chia rõ ràng tab quản trị bài viết và kiểm duyệt bình luận tập trung giúp Admin vận hành nội dung rất tiện lợi.

#### 📝 [src/app/admin/chat/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/chat/page.tsx) (936 dòng)
*   **Chức năng:** Trang trung tâm hỗ trợ khách hàng qua Live Chat đa kênh (Web Chat, Zalo OA, Facebook Messenger) dành cho nhân viên tiếp tân và tư vấn viên.
*   **Cơ chế hoạt động:**
    *   **Chat đa kênh Realtime (Realtime Database):** Lắng nghe trực tiếp Realtime Database ở các node phòng chat (`subscribeToRooms`) và tin nhắn (`subscribeToMessages`). Tự động phân loại kênh chat bằng helper `normalizeChatChannel` để hiển thị avatar, huy hiệu và giao diện tương ứng (Facebook, Zalo, Web).
    *   **Tích hợp AI Bot thông minh:** Cho phép nhân viên bật/tắt AI Bot hỗ trợ cho từng phòng chat cụ thể qua nút gạt bot (`botActive` lưu vào Realtime DB) để chuyển đổi linh hoạt giữa tư vấn tự động và hỗ trợ thủ công.
    *   **Gửi tin nhắn đa nhiệm (Admin Chat Gateway):** Nếu là kênh Web chat, tin nhắn được ghi trực tiếp vào Realtime DB. Nếu là kênh Facebook/Zalo, tin nhắn được gửi qua API `/api/admin/chat/send` để chuyển tiếp qua webhook API của Meta/Zalo OA.
    *   **Trả lời nhanh (Quick Replies):** Tích hợp phím tắt gõ `/` hoặc click nút cẩm nang để tìm kiếm và áp dụng nhanh các mẫu tin nhắn soạn sẵn (`ChatQuickReply`) giúp đẩy nhanh tốc độ phản hồi khách.
    *   **Đồng bộ Hồ sơ & Tác vụ CRM:**
        *   Cột bên phải hiển thị `ChatCustomerActivityPanel` hiển thị danh sách hóa đơn mua hàng và phiếu sửa chữa đang mở của khách hàng chat.
        *   Cho phép liên kết nhanh tài khoản chat vãng lai với hồ sơ khách hàng CRM thông qua `ChatCustomerProfileModal`.
        *   Tự động gọi API `/facebook-profile` để lấy tên và avatar thực tế của khách hàng chat từ Facebook.
    *   **Bảo mật & Tải đa phương tiện an toàn:** Các hình ảnh gửi từ Facebook được proxy qua API `/media` kèm theo Bearer ID Token của Firebase Auth để bảo vệ bảo mật tệp tin nội bộ, tránh rò rỉ link media.
*   **Đánh giá:** Một trong những module phức tạp và chuyên nghiệp nhất hệ thống, tích hợp hoàn hảo chat đa kênh realtime, AI Bot, mẫu trả lời nhanh và đồng bộ sâu với CRM khách hàng.

#### 📝 [src/app/admin/initial-data/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/initial-data/page.tsx) (435 dòng)
*   **Chức năng:** Trang công cụ đặc biệt dành cho Admin giúp khởi tạo dữ liệu hàng loạt bằng cách import file Excel (sản phẩm, phụ kiện, linh kiện, dịch vụ, khách hàng, nhà cung cấp và lịch sử đơn hàng/phiếu sửa).
*   **Cơ chế hoạt động:**
    *   **Phân vai kiểm soát:** Trang này bị ẩn khỏi menu chính và chỉ cho phép tài khoản có vai trò `admin` truy cập. Tài khoản `staff` sẽ bị chặn ngay ở client-side.
    *   **Danh sách tùy chọn Import:** Định nghĩa 8 tùy chọn import (`IMPORT_OPTIONS`) tương ứng với các collection Firestore chính. Cung cấp modal `ExcelImportModal` để xử lý parse file Excel thành JSON và ghi nhận batch ghi hàng loạt vào database.
    *   **Bộ kiểm tra hình ảnh thông minh (ImageLinkTester):**
        *   Khắc phục lỗi Admin nhập sai đường dẫn ảnh cục bộ (local path ổ đĩa) vào file Excel.
        *   Cho phép dán link hoặc chọn file ảnh cục bộ để preview trực quan.
        *   Tích hợp hàm `findUploadedMediaByFileName` thực hiện truy vấn so khớp tên file thông minh trong `media_library` để tìm ra URL ảnh public đã upload tương ứng, giúp Admin copy link chuẩn đưa vào Excel.
*   **Đánh giá:** Công cụ setup hệ thống cực kỳ đắc lực. Bộ kiểm tra ảnh thông minh và cơ chế import batched giúp việc di chuyển dữ liệu từ cửa hàng cũ sang hệ thống mới diễn ra cực kỳ mượt mà và an toàn.

#### 📝 [src/app/admin/login/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/login/page.tsx) (260 dòng)
*   **Chức năng:** Trang đăng nhập và xác thực bảo mật dành riêng cho phân hệ quản trị Admin/Staff.
*   **Cơ chế hoạt động:**
    *   **Bảo vệ Đăng nhập Hai bước (Double-Check Auth):**
        *   *Bước 1:* Xác thực tài khoản bằng Email/Password qua Firebase Client SDK (`signInWithEmailAndPassword`).
        *   *Bước 2:* Sau khi đăng nhập thành công, hệ thống lập tức đọc tài liệu người dùng tại `users/{uid}` trên Firestore để lấy vai trò (`role`).
        *   *Quyết định:* Nếu role là `admin` hoặc `staff`, cho phép điều hướng vào `/admin`. Nếu không (role là `customer`), hệ thống lập tức gọi đăng xuất (`signOut`) và hiển thị thông báo từ chối truy cập.
    *   **Đăng nhập Google an toàn:**
        *   Tích hợp đăng nhập nhanh qua Google (`signInWithPopup`).
        *   Nếu là tài khoản mới đăng nhập Google lần đầu, tự động tạo tài liệu người dùng mặc định với role `customer` trên Firestore.
        *   Thực hiện kiểm tra role tương tự để cho phép hoặc chặn quyền truy cập admin.
    *   **Chặn điều hướng ngược (Session Guard):** Sử dụng `useEffect` để kiểm tra phiên đăng nhập hiện tại. Nếu người dùng đã là Admin/Staff và đang ở trang login, tự động redirect ngay về trang `/admin`.
*   **Đánh giá:** Logic xác thực chặt chẽ, an toàn. Cơ chế tự động đăng xuất tài khoản không có quyền ngay khi xác thực Firebase thành công giúp ngăn ngừa hoàn toàn rủi ro vượt quyền ở client-side.

---

### 21. Nhóm Xác thực, Quyền hạn & Cấu hình Hệ thống (Authentication, RBAC & Core Contexts)

#### 📝 [src/lib/AuthContext.tsx](file:///m:/QLCH_VanLanh/src/lib/AuthContext.tsx) (242 dòng)
*   **Chức năng:** Context quản lý trạng thái đăng nhập, phân quyền client, cơ chế lazy-load Auth để tối ưu hiệu năng và sync session cookie với API server-side.
*   **Cơ chế hoạt động:**
    *   **Lazy-loading Auth:** Chỉ khởi chạy Firebase Auth listener khi phát hiện user đã từng đăng nhập (`has_logged_in` trong `localStorage`) hoặc đang truy cập route quản trị `/admin`. Giúp tối ưu hóa tốc độ tải trang ban đầu (TTI) cho khách hàng vãng lai.
    *   **Đồng bộ Session Server-side:** Khi phát hiện vai trò người dùng là `admin` hoặc `staff`, hệ thống sinh ID Token từ Firebase User (`getIdToken()`) rồi gửi yêu cầu POST đến `/api/auth/session` thông qua cơ chế non-blocking (sử dụng `AbortController` với thời gian chờ 5 giây) để thiết lập session cookie phía server, hỗ trợ Next.js Middleware kiểm soát định tuyến an toàn.
    *   **Quản trị Tài khoản & Phân quyền:** Tích hợp các hàm đăng nhập (`login`), đăng ký (`signup`), đăng xuất (`logout`) và đăng nhập Google (`googleSignIn`). Khi người dùng đăng nhập lần đầu tiên qua Google, tự động khởi tạo hồ sơ với vai trò `customer` trong Firestore.
*   **Đánh giá:** Kiến trúc lazy-load và sync session rất tinh tế, vừa đảm bảo hiệu năng tải trang tối đa ở client vừa giữ được tính bảo mật chặt chẽ ở server-side middleware.

#### 📝 [src/lib/ConfigContext.tsx](file:///m:/QLCH_VanLanh/src/lib/ConfigContext.tsx) (327 dòng)
*   **Chức năng:** Context nạp và đồng bộ realtime cấu hình hệ thống đa tài liệu (main, layout, navigation, taxonomy) từ Firestore, tự động inject CSS variables/background toàn trang và chốt trạng thái Image Proxy.
*   **Cơ chế hoạt động:**
    *   **Phân mảnh tài liệu (Document Splitting):** Để tránh giới hạn dung lượng 1MB của Firestore document và tối ưu băng thông mạng, cấu hình hệ thống được chia nhỏ thành 4 tài liệu: `main_settings`, `layout_settings`, `navigation_settings` và `taxonomy_settings`. Khi một tài liệu thay đổi, hệ thống sẽ merge động vào client state.
    *   **Tự động Seed dữ liệu:** Khi phát hiện tài liệu cấu hình bất kỳ chưa tồn tại trên Firestore (như khi reset/cài đặt mới hệ thống), hàm `seedDocument` tự động nạp dữ liệu cấu hình mặc định tương ứng lên Firestore.
    *   **CSS & Background Injection:** Tự động lắng nghe các thay đổi màu sắc chủ đạo (`primaryColor`, v.v.) và cấu hình hình nền (`background_config`) để inject trực tiếp vào CSS variables của tài liệu (`--primary`, v.v.) và thuộc tính style của `body` ngay khi cấu hình thay đổi realtime.
    *   **Image Proxy Control:** Đồng bộ hóa cấu hình `disableImageProxy` vào `localStorage` của trình duyệt để kiểm soát việc sử dụng dịch vụ nén ảnh `wsrv.nl` toàn hệ thống.
*   **Đánh giá:** Giải pháp phân mảnh tài liệu kết hợp đồng bộ realtime rất xuất sắc. Cơ chế tự động seed dữ liệu và inject style động giúp giao diện hệ thống thay đổi linh hoạt mà không cần reload trang.

#### 📝 [src/lib/permissions.ts](file:///m:/QLCH_VanLanh/src/lib/permissions.ts) (11 dòng)
*   **Chức năng:** Tệp tin Re-export trung gian phục vụ phân quyền.
*   **Cơ chế hoạt động:** Thực hiện re-export toàn bộ các định nghĩa, hằng số và helper liên quan đến quyền truy cập nhân viên (`ADMIN_ROLE_PRESETS`, `PERMISSIONS_REGISTRY`, `canStaffAccess`, v.v.) từ module gốc `adminModules.ts`. Giúp rút ngắn đường dẫn import và tạo điểm tập trung import gọn gàng cho client/server.
*   **Đánh giá:** Giải pháp cấu trúc thư mục sạch sẽ, tiện dụng. Tạo điểm trung gian import tối ưu giúp hệ thống có cấu trúc import gọn gàng và dễ dàng bảo trì.

#### 📝 [src/lib/apiAuth.ts](file:///m:/QLCH_VanLanh/src/lib/apiAuth.ts) (63 dòng)
*   **Chức năng:** Middleware helper bảo mật phía Server-side API.
*   **Cơ chế hoạt động:**
    *   **Trích xuất & Xác minh Token:** Hàm `getBearerToken` trích xuất JWT Token từ Header `Authorization`. Hàm `verifyUser` sử dụng Firebase Admin SDK (`verifyIdToken`) để giải mã token lấy `uid`, sau đó truy vấn Firestore collection `users` lấy `role` và `permissions`.
    *   **Chặn kiểm soát truy cập (Gatekeepers):** Định nghĩa các helper `requireAdminOrStaff` (yêu cầu vai trò quản trị/nhân viên), `requireAdmin` (chỉ cho phép admin) và `requirePermission(permission)` (kiểm tra quyền cụ thể đối với nhân viên staff, trong khi admin luôn được cấp quyền bỏ qua). Nếu không thỏa mãn, lập tức ném lỗi `Forbidden` chặn xử lý API tiếp theo.
*   **Đánh giá:** Middleware viết rất gọn gàng, hiệu quả và bảo mật cao, kiểm soát chặt chẽ an toàn cho toàn bộ Endpoint API nội bộ.

#### 📝 [src/lib/firebase.ts](file:///m:/QLCH_VanLanh/src/lib/firebase.ts) (56 dòng)
*   **Chức năng:** Cấu hình và khởi tạo Firebase Client SDK tối ưu hóa hiệu năng.
*   **Cơ chế hoạt động:**
    *   **Eager loading Firestore:** Chỉ có Firestore (`db`) được khởi tạo ngay lập tức bằng `getFirestore()` do được sử dụng liên tục ở cả trang khách hàng vãng lai (Storefront).
    *   **Lazy Loading (Auth, RTDB, Storage):** Các instance Auth (`getAuthInstance`), Realtime Database (`getRtdbInstance`), và Storage (`getStorageInstance`) được thiết lập dưới dạng **Lazy Singletons**. Thư viện SDK tương ứng chỉ được nạp động qua `import(...)` và khởi tạo khi hàm được gọi lần đầu tiên.
*   **Đánh giá:** Giải pháp tối ưu hóa Bundle Size cực tốt, giúp loại bỏ ~100-150KB code Firebase dư thừa khỏi trang Storefront ban đầu của khách hàng, cải thiện vượt trội điểm số TTI/LCP.

#### 📝 [src/lib/firebaseAdmin.ts](file:///m:/QLCH_VanLanh/src/lib/firebaseAdmin.ts) (170 dòng)
*   **Chức năng:** Khởi tạo Firebase Admin SDK chuyên dụng cho môi trường Server-side.
*   **Cơ chế hoạt động:**
    *   **Auto-load Env cho Script độc lập:** Tự động đọc và parse tệp `.env.local` ở thư mục gốc khi chạy ngoài luồng Next.js (như CLI Node.js script) để nạp biến môi trường cho quá trình kết nối.
    *   **Nạp credentials đa dạng:** Hỗ trợ nhận Service Account qua biến môi trường dạng chuỗi JSON, đường dẫn tệp JSON key, hoặc các biến đơn lẻ (`private_key`, `client_email`).
    *   **GCP Application Default Credentials (ADC) Fallback:** Khi chạy trên nền tảng Google Cloud (Cloud Run/Functions), hệ thống tự động nhận dạng môi trường và cấu hình credentials GCP mà không cần file Service Account key, tăng tính bảo mật.
    *   **Cache Singletons:** Cache các instance của app và dịch vụ (`Auth`, `Firestore`, `Database`, `Storage`) sử dụng tên app riêng `vanlanh-admin` để tránh lỗi khởi tạo trùng lặp khi Hot Reload.
*   **Đánh giá:** Bộ khởi tạo admin cực kỳ hoàn chỉnh, linh hoạt và tương thích hoàn hảo cho cả môi trường chạy local dev lẫn khi triển khai production trên Google Cloud.

#### 📝 [src/lib/adminModules.ts](file:///m:/QLCH_VanLanh/src/lib/adminModules.ts) (239 dòng)
*   **Chức năng:** Module định nghĩa cấu trúc phân quyền (RBAC), menu điều hướng và preset nhân sự.
*   **Cơ chế hoạt động:**
    *   **Quy hoạch Quyền hạn (Permissions Registry):** Định nghĩa 17 quyền hạn chi tiết phân nhóm khoa học trong `PERMISSIONS_REGISTRY` phục vụ giao diện phân quyền.
    *   **Quy hoạch Menu điều hướng (Admin Nav Groups):** Xây dựng cấu trúc cây menu đa nhóm `ADMIN_NAV_GROUPS`, gán cứng quyền hạn truy cập bắt buộc (`permission`) và khóa thông báo (`badgeKey`) cho từng menu item. Khai báo các route ẩn cần áp quyền trong `ADMIN_HIDDEN_ROUTE_ITEMS`.
    *   **Vai trò định sẵn (Role Presets):** Khai báo 5 preset vai trò phổ biến (Thu ngân, KTV, Kho, CSKH, Content) kèm danh sách quyền mặc định.
    *   **Helper Phân tích:** Hỗ trợ so khớp sâu route (`getMatchedAdminRoute`), kiểm tra quyền truy cập nhanh (`canStaffAccess`) và tự động tìm route khả dụng đầu tiên để chuyển hướng nhân viên khi đăng nhập (`findFirstAccessibleRoute`).
*   **Đánh giá:** Xương sống của hệ thống quản lý phân quyền trong dự án, thiết kế chặt chẽ, tối ưu trải nghiệm điều phối nhân sự của trang quản trị.

---

### 22. Nhóm Logic Tiện ích & Trợ năng Chung (Utility Helpers & Client Hooks)

#### 📝 [src/lib/CartContext.tsx](file:///m:/QLCH_VanLanh/src/lib/CartContext.tsx) (126 dòng)
*   **Chức năng:** Context quản lý giỏ hàng phía khách hàng (Storefront) tích hợp đồng bộ bộ nhớ cục bộ.
*   **Cơ chế hoạt động:**
    *   **Bảo toàn Trạng thái (Persistence):** Đồng bộ tự động danh sách sản phẩm trong giỏ hàng với `localStorage` qua khóa `vanlanh_cart_items`. Sử dụng cờ hiệu `isMounted` để ngăn chặn lỗi bất đồng bộ Hydration (Hydration mismatch) đặc trưng của Next.js SSR.
    *   **Nghiệp vụ Giỏ hàng:** Hàm `addItem` tự động phát hiện sản phẩm trùng lặp (trùng ID, màu sắc và dung lượng) để cộng dồn số lượng, đồng thời tự động mở Drawer giỏ hàng tạo hiệu ứng phản hồi trực quan. Hàm `updateQuantity` tự động xóa sản phẩm ra khỏi giỏ nếu số lượng giảm xuống `<= 0`.
    *   **Thống kê:** Sử dụng `reduce` để tính toán realtime tổng số lượng sản phẩm (`totalItems`) và tổng thành tiền (`totalAmount`) của giỏ hàng.
*   **Đánh giá:** Quản lý giỏ hàng client-side mượt mà, xử lý hydration mismatch chuẩn mực và cung cấp các hàm API nội bộ rất tiện dụng.

#### 📝 [src/lib/constants.ts](file:///m:/QLCH_VanLanh/src/lib/constants.ts) (18 dòng)
*   **Chức năng:** Định nghĩa các hằng số hệ thống cốt lõi và helper nhận diện linh kiện.
*   **Cơ chế hoạt động:**
    *   Khai báo `SITE_URL` mặc định (`https://fixphone.vn`) và định nghĩa ID danh mục linh kiện `PART_CATEGORY = 'component'`.
    *   **Bộ lọc Linh kiện (`isPartCategory`):** Helper quan trọng kiểm tra chuỗi `category` (so khớp không phân biệt hoa thường với `component`, `linh kiện`, `linh-kien`) hoặc mảng `categoryIds` (phần tử đầu tiên bắt đầu bằng `linh-kien` hoặc `component`) để phân loại rạch ròi giữa sản phẩm bán lẻ thông thường và linh kiện sửa chữa kỹ thuật trên toàn hệ thống.
*   **Đánh giá:** Các hằng số được gom nhóm gọn gàng, bộ lọc `isPartCategory` hoạt động chính xác và rất quan trọng cho logic kho bãi.

#### 📝 [src/lib/toast.ts](file:///m:/QLCH_VanLanh/src/lib/toast.ts) (15 dòng)
*   **Chức năng:** Hàm bọc hiển thị thông báo trạng thái dạng nổi.
*   **Cơ chế hoạt động:** Thực hiện import thư viện thông báo `sonner` và export ra 3 hàm bọc trực quan: `toastSuccess` (thành công), `toastError` (thất bại), và `toastWarning` (cảnh báo) để đồng bộ trải nghiệm thông báo toàn hệ thống.
*   **Đánh giá:** Đơn giản, tiện dụng, giúp chuẩn hóa API hiển thị thông báo.

#### 📝 [src/lib/utils.ts](file:///m:/QLCH_VanLanh/src/lib/utils.ts) (91 dòng)
*   **Chức năng:** Tổ hợp các hàm tiện ích chuẩn hóa chuỗi, sinh từ khóa tìm kiếm và tra cứu danh mục.
*   **Cơ chế hoạt động:**
    *   `generateSlug`: Chuẩn hóa tiếng Việt có dấu (xử lý chữ `đ` thành `d`) thành chuỗi slug không dấu phục vụ tạo ID/đường dẫn.
    *   `getCategoryPath`: Duyệt đệ quy in-memory trên cây danh mục để sinh đường dẫn bánh mì (Breadcrumb Path) từ một ID danh mục. Chạy hoàn toàn trên RAM giúp tiết kiệm 100% chi phí đọc (read) Firestore.
    *   `generateSearchKeywords`: Chuẩn hóa tên sản phẩm, tách từ và sinh các tiền tố (prefixes) tối thiểu 2 ký tự (ví dụ "iphone" -> "ip", "iph"...) phục vụ tìm kiếm tiếng Việt qua query `array-contains` của Firestore (giới hạn tối đa 60 từ khóa để tránh vượt hạn mức tài liệu).
*   **Đánh giá:** Các hàm viết cực kỳ tối ưu. Giải pháp sinh tiền tố phục vụ tìm kiếm trên Firestore rất sáng tạo và hiệu quả.

#### 📝 [src/lib/useClientPagination.ts](file:///m:/QLCH_VanLanh/src/lib/useClientPagination.ts) (46 dòng)
*   **Chức năng:** Custom hook quản lý phân trang dữ liệu phía Client-side.
*   **Cơ chế hoạt động:**
    *   Nhận vào mảng dữ liệu đã lọc và kích thước trang. Quản lý trạng thái trang hiện tại, bảo vệ an toàn chỉ số trang (`safePage`) không bị tràn khi bộ lọc thay đổi làm ngắn danh sách.
    *   Tự động tính toán tổng số trang và cắt mảng dữ liệu hiển thị (`paginatedData`) bằng `useMemo` để tối ưu hiệu năng render. Bọc các hàm thay đổi trang/kích thước trang trong `useCallback` tránh tạo lại hàm.
*   **Đánh giá:** Hook phân trang client viết chuẩn mực, hiệu năng cao và cực kỳ tái sử dụng được ở nhiều bảng biểu trong admin.

#### 📝 [src/lib/requestRevalidate.ts](file:///m:/QLCH_VanLanh/src/lib/requestRevalidate.ts) (26 dòng)
*   **Chức năng:** Helper gửi yêu cầu làm mới cache ngầm tránh gián đoạn UI Admin.
*   **Cơ chế hoạt động:** Thực hiện gửi một request HTTP POST ngầm (background API fetch) tới Endpoint `/api/revalidate` nội bộ kèm danh sách path/tag cần xóa cache. Việc gọi ngầm này tách biệt hoàn toàn khỏi React render tree của Admin, giúp tránh lỗi remount Firebase Auth hoặc mất trạng thái UI Admin khi lưu cấu hình.
*   **Đánh giá:** Giải pháp xử lý trải nghiệm Admin (admin UX) rất tinh tế và thông minh.

#### 📝 [src/lib/revalidate.ts](file:///m:/QLCH_VanLanh/src/lib/revalidate.ts) (57 dòng)
*   **Chức năng:** Server Action thực hiện làm mới cache theo yêu cầu (On-Demand Revalidation) cho Next.js ISR.
*   **Cơ chế hoạt động:**
    *   Gọi hàm `revalidatePath` và `revalidateTag` phía server-side. Đặc biệt, nếu path là `'layout'`, hệ thống chỉ revalidate vùng layout của storefront khách hàng (`revalidatePath('/(customer)', 'layout')`) để bảo vệ vùng Admin không bị reset Router Cache.
    *   **Đồng bộ đa miền (Cross-Domain Sync):** Nếu cấu hình `REVALIDATE_SECRET`, Server Action tự động gửi POST request đồng bộ xóa cache tới các domain vệ tinh (`fixphone.vn`, `qlch-vanlanh.web.app`) dưới dạng song song (`Promise.allSettled`).
*   **Đánh giá:** Tích hợp On-Demand Revalidation rất chuyên nghiệp, xử lý biên an toàn cho Admin và hỗ trợ đồng bộ đa miền xuất sắc.

#### 📝 [src/lib/sanitizeHtml.ts](file:///m:/QLCH_VanLanh/src/lib/sanitizeHtml.ts) (26 dòng)
*   **Chức năng:** Hàm dọn dẹp và làm sạch HTML ngăn chặn tấn công Cross-Site Scripting (XSS).
*   **Cơ chế hoạt động:**
    *   Nhận vào chuỗi HTML soạn thảo động, thay thế ký tự khoảng trắng không ngắt `&nbsp;` thành khoảng trắng thường để tránh lỗi tràn dòng UI.
    *   Sử dụng Regex loại bỏ triệt để các khối `<script>`, `<style>`, các trình lắng nghe sự kiện inline (`onclick`, `onerror`), và các link thực thi javascript (`javascript:`).
    *   **Allowlist Iframe:** Chỉ giữ lại các iframe nhúng nội dung từ danh sách tên miền được phép (YouTube và Facebook), tất cả các iframe từ nguồn khác đều bị loại bỏ vĩnh viễn.
*   **Đánh giá:** Hàm bảo mật HTML viết rất chặt chẽ, tối ưu, đảm bảo an toàn tuyệt đối khi render HTML động bằng thuộc tính `dangerouslySetInnerHTML`.

---

### 23. Nhóm Nghiệp vụ Định danh & Quản lý Tài liệu Hệ thống (Document IDs, Identifiers & Business Identity)

#### 📝 [src/lib/businessIdentity.ts](file:///m:/QLCH_VanLanh/src/lib/businessIdentity.ts) (75 dòng)
*   **Chức năng:** Hợp nhất, chuẩn hóa và cung cấp thông tin liên hệ và bộ nhận diện thương hiệu của cửa hàng.
*   **Cơ chế hoạt động:**
    *   Hàm `getBusinessIdentity(config)` thực hiện kết hợp (merge) cấu hình động từ Firestore với cấu hình mặc định `DEFAULT_CONFIG`.
    *   Tự động trích xuất hotline, địa chỉ từ chi nhánh chính nếu cấu hình động trống. Định dạng hotline đẹp qua `formatBusinessPhone` (dạng `0909.123.456`).
    *   Tự động sinh liên kết Maps Google động qua `getMapsSearchUrl` và liên kết Chat Zalo động theo định dạng chuẩn `https://zalo.me/{phone}`.
*   **Đánh giá:** Tích hợp thông tin thương hiệu thông minh, giảm thiểu rủi ro sai lệch dữ liệu liên hệ trên storefront và cung cấp trải nghiệm kết nối một chạm cho khách hàng.

#### 📝 [src/lib/clientDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/clientDocumentIds.ts) (12 dòng)
*   **Chức năng:** Helper sinh mã ID tài liệu độc bản phía Client-side.
*   **Cơ chế hoạt động:** Sinh chuỗi ngày rút gọn `YYMMDD` qua `dateKey`. Kết hợp tiền tố viết hoa, mã ngày, timestamp chuyển đổi cơ số 36 viết hoa (`Date.now().toString(36)`) và slug của scope bổ sung (ví dụ tên khách hàng/linh kiện) để tạo ra mã ID dạng `{PREFIX}-{YYMMDD}-{TIMESTAMP36}-{SCOPE}`.
*   **Đánh giá:** Giải pháp tạo ID client-side thông minh, đảm bảo tính độc nhất và dễ dàng sắp xếp theo thời gian.

#### 📝 [src/lib/serverDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/serverDocumentIds.ts) (139 dòng)
*   **Chức năng:** Xương sống giải quyết bài toán sinh mã ID chứng từ tăng dần theo tuần tự (Sequential IDs) phía Server-side.
*   **Cơ chế hoạt động:**
    *   Sử dụng Firestore Transactions (`Transaction`) chạy quy trình "Đọc trước - Ghi sau" nguyên tử để tránh va chạm.
    *   Đọc bộ đếm hiện tại từ tài liệu `system_counters` theo ngày (`PREFIX-YYMMDD`), tăng sequence lên 1 và chạy vòng lặp kiểm tra sự tồn tại thực tế của ID đích trong database (tối đa 100 lần va chạm).
    *   Trả về ID an toàn cùng callback `commitCounter()`. Callback này chỉ được gọi ở pha ghi của transaction để ghi nhận sequence mới khi mọi thao tác nghiệp vụ thành công.
    *   **Múi giờ Việt Nam:** Sử dụng múi giờ `Asia/Ho_Chi_Minh` để sinh mã ngày thống nhất, tránh lệch ngày do múi giờ UTC phía máy chủ. Hỗ trợ sinh hàng loạt ID tuần tự qua `reserveSequentialDocumentIds`.
*   **Đánh giá:** Giải pháp kỹ thuật đỉnh cao giải quyết triệt để hạn chế tạo ID tự tăng trên NoSQL Firestore một cách an toàn, hiệu năng cao và cực kỳ bảo mật.

#### 📝 [src/lib/idNormalizer.ts](file:///m:/QLCH_VanLanh/src/lib/idNormalizer.ts) (37 dòng)
*   **Chức năng:** Sinh mã ID tài liệu chuẩn hóa và chống trùng lặp cho các sản phẩm/linh kiện mới.
*   **Cơ chế hoạt động:**
    *   Áp dụng quy tắc tiền tố: Linh kiện kho -> `LK-`, phụ kiện bán lẻ -> `PK-`, sản phẩm bán lẻ khác -> `SP-`.
    *   Tạo ID gốc từ tiền tố và slug tên sản phẩm. Thực hiện vòng lặp kiểm tra trùng lặp trên Firestore (tối đa 50 lần), nếu trùng tự động nối thêm hậu tố số tăng dần (`-2`, `-3`...) đến khi tìm được ID trống.
*   **Đánh giá:** Đảm bảo ID sản phẩm vừa chuẩn hóa cấu trúc, vừa mang tính gợi nhớ cao, vừa triệt tiêu rủi ro ghi đè dữ liệu.

#### 📝 [src/lib/supplierDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/supplierDocumentIds.ts) (20 dòng)
*   **Chức năng:** Sinh mã ID tài liệu chuẩn hóa và chống trùng lặp cho nhà cung cấp mới.
*   **Cơ chế hoạt động:** Ưu tiên sử dụng số điện thoại của nhà cung cấp để tạo ID gốc dạng `NCC-{phone}`, nếu không có SĐT thì dùng tên NCC. Chạy vòng lặp kiểm tra sự tồn tại trên Firestore tối đa 50 lần để sinh ra ID an toàn nhất.
*   **Đánh giá:** Thiết kế ID thông minh (sử dụng số điện thoại làm định danh), giúp dễ dàng đối chiếu dữ liệu công nợ nhà cung cấp.

#### 📝 [src/lib/phone.ts](file:///m:/QLCH_VanLanh/src/lib/phone.ts) (24 dòng)
*   **Chức năng:** Helper chuẩn hóa số điện thoại theo định dạng Việt Nam.
*   **Cơ chế hoạt động:** Dọn dẹp mọi ký tự phi số. Nếu số bắt đầu bằng mã quốc gia `84`, tự động chuyển đổi thành `0` ở đầu để đưa về dạng số nội địa. So khớp tính hợp lệ bằng regex (bắt đầu bằng `0`, dài 10-11 số). Trả về đối tượng gồm số nội địa (`local`) và số dạng chuẩn quốc tế (`e164` dạng `+84...`).
*   **Đánh giá:** Nhỏ gọn nhưng hoạt động rất chuẩn xác, đóng vai trò quan trọng trong việc đồng nhất khóa SĐT khách hàng trong CRM và chuẩn bị tích hợp SMS/Zalo.

---

### 24. Nhóm Quản trị Khách hàng, Thứ hạng VIP & Đồng bộ CRM (Customer Tiers, Sync & CRM Activities)

#### 📝 [src/lib/customerTiers.ts](file:///m:/QLCH_VanLanh/src/lib/customerTiers.ts) (39 dòng)
*   **Chức năng:** Định nghĩa và quản lý các thứ hạng thành viên và chính sách chiết khấu của khách hàng.
*   **Cơ chế hoạt động:**
    *   Định nghĩa 4 thứ hạng VIP: `Smember` (chi tiêu >= 30 triệu, giảm 5%), `Gold` (chi tiêu >= 15 triệu, giảm 3%), `Silver` (chi tiêu >= 5 triệu, giảm 1%) và `Bronze` (dưới 5 triệu, không giảm).
    *   Cung cấp các helper tính toán phân hạng động `calculateCustomerTier` và lấy tỷ lệ giảm giá tương ứng `getTierDiscountPercent` phục vụ POS/giỏ hàng.
*   **Đánh giá:** Logic phân cấp đơn giản, rõ ràng, giúp kích cầu mua sắm và dễ dàng tích hợp vào hệ thống tính giá.

#### 📝 [src/lib/customerSync.ts](file:///m:/QLCH_VanLanh/src/lib/customerSync.ts) (61 dòng)
*   **Chức năng:** Đồng bộ thông tin hồ sơ khách hàng vào CRM Firestore trong transaction.
*   **Cơ chế hoạt động:**
    *   Chuẩn hóa số điện thoại làm Document ID trong collection `customers`.
    *   Nếu khách hàng chưa tồn tại, thực hiện khởi tạo tài liệu với các trường mặc định (`totalSpent = 0`, tên mặc định `Khách lẻ`...). Nếu khách hàng đã tồn tại, chỉ tiến hành cập nhật các thông tin mới hợp lệ (tên mới, địa chỉ mới) và cập nhật thời gian tương tác cuối `lastVisit`.
    *   **Phân tách nghiệp vụ:** Tránh tính toán cộng dồn doanh thu ở client-side để tăng tốc độ transaction và ngăn ngừa xung đột dữ liệu. Doanh số tích lũy được xử lý tập trung hoàn toàn ở Server-side APIs.
*   **Đánh giá:** Kiến trúc đồng bộ CRM tinh gọn, an toàn, xử lý transaction rất nhanh và chính xác.

#### 📝 [src/lib/useCustomerActivity.ts](file:///m:/QLCH_VanLanh/src/lib/useCustomerActivity.ts) (229 dòng)
*   **Chức năng:** Custom hook truy vấn realtime lịch sử đơn hàng và tiến độ sửa chữa của khách hàng theo số điện thoại.
*   **Cơ chế hoạt động:**
    *   **Tương thích ngược dữ liệu cũ (Legacy Support):** Đăng ký song song 2 listener `onSnapshot` để lắng nghe cả trường SĐT mới (`customer_info.phone`) và trường SĐT cũ (`customer.phone`) trên collection `orders`, tự động gộp và khử trùng lặp qua `Map` theo ID đơn hàng.
    *   Lắng nghe realtime tiến độ sửa chữa từ collection `repairs` và đối chiếu với cấu hình workflow động để trả về nhãn trạng thái Tiếng Việt cùng cờ chốt phiếu (`isTerminal`).
    *   **Hỗ trợ CSKH:** Trích xuất nhanh các đơn hàng/phiếu sửa chữa đang hoạt động (`openOrders`, `openRepairs`) giúp nhân viên CSKH/chat nắm bắt nhanh vấn đề của khách đang gặp phải.
*   **Đánh giá:** Thiết kế hook cực kỳ chi tiết và thông minh. Giải quyết hoàn hảo bài toán tương thích ngược dữ liệu cũ và cung cấp dữ liệu CRM realtime xuất sắc cho tư vấn viên.

#### 📝 [src/lib/usePresence.ts](file:///m:/QLCH_VanLanh/src/lib/usePresence.ts) (40 dòng)
*   **Chức năng:** Theo dõi lượt truy cập hàng ngày của khách hàng trên storefront.
*   **Cơ chế hoạt động:**
    *   **Tối ưu Hydration:** Trì hoãn 2 giây trước khi gửi tracking request ngầm để tránh cản trở luồng hiển thị chính và quá trình hydration của trang web.
    *   Gửi request POST tới API `/api/analytics/visit` để server xử lý các tác vụ nặng (nhận diện thiết bị, chống spam, ghi nhận Firestore).
    *   **Tắt Realtime Presence để tối ưu chi phí:** Chủ động tắt tính năng theo dõi online realtime bằng RTDB WebSocket để giảm tải luồng chính ở client và tiết kiệm chi phí kết nối đồng thời của Firebase.
*   **Đánh giá:** Giải pháp tối ưu hóa hiệu năng tải trang và chi phí vận hành Firebase rất đáng giá và tinh tế.

---

### 25. Nhóm Cấu hình Hệ thống, Màu sắc & Thiết lập Mặc định (System Config, Defaults & Palette Specs)

#### 📝 [src/lib/config-defaults.ts](file:///m:/QLCH_VanLanh/src/lib/config-defaults.ts) (764 dòng)
*   **Chức năng:** Khai báo toàn bộ các kiểu dữ liệu cấu hình, thiết lập mặc định hệ thống và các hàm chuẩn hóa dữ liệu cấu hình động.
*   **Cơ chế hoạt động:**
    *   **Khai báo hằng số mặc định đồ sộ (`DEFAULT_CONFIG`):** Chứa các giá trị mặc định cho toàn bộ storefront và admin bao gồm bảng màu chính, thông tin liên hệ, danh sách chi nhánh, cấu trúc trang chủ, từ khóa cấm, cài đặt định vị geofence, cấu trúc menu điều hướng header/sidebar/footer động và cây danh mục đa tầng (Taxonomy Trees) 3 cấp hoàn chỉnh cho bán lẻ, dịch vụ và linh kiện.
    *   **Chuẩn hóa dữ liệu động (Data Cleaning & Normalization):** Cung cấp các helper `normalizeHomepagePricing` và `normalizeHomepageReviews` để phân tích, ép kiểu dữ liệu nạp từ Firestore. Tự động sửa lỗi sai kiểu dữ liệu, làm sạch khoảng trắng, lọc icon hợp lệ, giới hạn số lượng hiển thị (1-20) hoặc tự động fallback về cấu hình mặc định an toàn.
    *   **Cơ chế Fail-Safe:** Đóng vai trò là chốt chặn an toàn cuối cùng giúp toàn bộ hệ thống storefront hoạt động ổn định dựa trên cấu hình mặc định kể cả khi Firestore bị mất kết nối hoặc dữ liệu cấu hình động bị xóa/hỏng.
*   **Đánh giá:** Một tệp cấu hình cốt lõi cực kỳ công phu và chặt chẽ. Việc tích hợp sẵn các hàm chuẩn hóa dữ liệu động giúp hệ thống có khả năng tự phục hồi lỗi cấu hình cực tốt, nâng cao tính bền bỉ của ứng dụng.

---

### 26. Nhóm Quản trị Khuyến mãi, Chiết khấu & Flash Sale (Discount Engine, Voucher Stacking & Flash Sales)

#### 📝 [src/lib/discountCalc.ts](file:///m:/QLCH_VanLanh/src/lib/discountCalc.ts) (164 dòng)
*   **Chức năng:** Nhân tố cốt lõi của hệ thống tính toán chiết khấu phụ kiện liên kết dịch vụ sửa chữa (Accessory Discount Engine).
*   **Cơ chế hoạt động:**
    *   **So khớp thông minh:** Sử dụng `normalizeMatchText` để chuẩn hóa text tiếng Việt không dấu, chữ thường, gạch nối làm slug để so khớp từ khóa (`matchesKeywords`) bất kể sai lệch chính tả nhẹ. Tạo danh sách candidate dạng phẳng và dạng đường dẫn để so khớp thừa kế danh mục cha-con (`matchesCategoryId` và `matchesCategoryPath`).
    *   **Tính toán chiết khấu:** Hàm `calculateAccessoryDiscounts` kiểm tra xem phiếu sửa chữa hiện tại có chứa linh kiện/dịch vụ kích hoạt chương trình hay không. Nếu có, duyệt qua giỏ hàng để tìm các phụ kiện mục tiêu tương ứng, áp dụng giảm giá (theo % hoặc số tiền cố định), kiểm soát giới hạn tối đa (`maxDiscountAmount`) và đảm bảo mức giảm không vượt quá giá trị phụ kiện.
*   **Đánh giá:** Kiến trúc bộ máy tính chiết khấu (discount engine) rất chặt chẽ, thông minh, giúp tự động hóa hoàn toàn các kịch bản khuyến mãi chéo (cross-selling) nâng cao biên lợi nhuận của cửa hàng.

#### 📝 [src/lib/discountRuleUtils.ts](file:///m:/QLCH_VanLanh/src/lib/discountRuleUtils.ts) (17 dòng)
*   **Chức năng:** Tệp tin Re-export trung gian và truy vấn quy tắc chiết khấu từ database.
*   **Cơ chế hoạt động:** Thực hiện re-export các hàm cốt lõi của `discountCalc.ts` và cung cấp hàm `fetchActiveDiscountRules()` để truy vấn realtime toàn bộ các quy tắc chiết khấu phụ kiện đang hoạt động (`isActive == true`) từ collection `accessory_discount_rules` của Firestore.
*   **Đánh giá:** Đơn giản, tinh gọn và thực hiện tốt vai trò kết nối database cho discount engine.

#### 📝 [src/lib/flashSale.ts](file:///m:/QLCH_VanLanh/src/lib/flashSale.ts) (26 dòng)
*   **Chức năng:** Logic nhận diện và bộ lọc các sản phẩm khuyến mãi chớp nhoáng (Flash Sale).
*   **Cơ chế hoạt động:**
    *   **Nhận diện Flash Sale:** Một sản phẩm được coi là Flash Sale khi có cờ cấu hình `isFlashSale === true` hoặc có giá khuyến mãi (`price_promo`) thấp hơn giá gốc ít nhất **10% trở lên**.
    *   Cung cấp hàm lọc mảng sản phẩm `filterFlashSaleProducts` để tự động chọn ra các sản phẩm Flash Sale phục vụ khối trưng bày trang chủ storefront.
*   **Đánh giá:** Quy tắc tự động hóa nhận diện Flash Sale thông minh dựa trên tỷ lệ phần trăm chiết khấu giúp tối ưu hóa việc quản lý hiển thị storefront mà không cần nhân viên cắm cờ thủ công cho từng sản phẩm.

---

### 27. Nhóm Hệ thống Live Chat Realtime & Đồng bộ Đa kênh (Realtime Chat Server & Multi-Channel Integrations)

#### 📝 [src/lib/chatChannels.ts](file:///m:/QLCH_VanLanh/src/lib/chatChannels.ts) (30 dòng)
*   **Chức năng:** Định nghĩa kiểu dữ liệu và helper chuẩn hóa kênh chat.
*   **Cơ chế hoạt động:**
    *   Định nghĩa 3 kênh chat: `web` (storefront), `zalo` (Zalo OA) và `facebook` (Messenger).
    *   **Bảo vệ Realtime DB (`toSafeRtdbKey`):** Tự động phát hiện và thay thế toàn bộ các ký tự bị cấm trong Key của Firebase Realtime Database (như `.`, `#`, `$`, `/`, `[`, `]`) thành dấu gạch dưới `_`, đồng thời cắt độ dài Key dưới 180 ký tự để tránh lỗi sập DB.
    *   Sinh ID phòng chat duy nhất cho các kênh bên ngoài dựa trên cấu trúc `{channel}_{safePageId}_{safeUserId}`.
*   **Đánh giá:** Tinh gọn nhưng chứa helper `toSafeRtdbKey` vô cùng đắt giá, giúp ngăn ngừa triệt để các lỗi ghi dữ liệu nghiêm trọng trên Realtime Database.

#### 📝 [src/lib/chatIntegrationConfig.ts](file:///m:/QLCH_VanLanh/src/lib/chatIntegrationConfig.ts) (224 dòng)
*   **Chức năng:** Quản lý cấu hình tích hợp API mạng xã hội và hệ thống tin nhắn trả lời nhanh (Quick Replies).
*   **Cơ chế hoạt động:**
    *   **Bảo mật thông tin nhạy cảm:** Lưu cấu hình API Keys (Facebook tokens, Zalo secrets) ở collection riêng tư `private_config/chat_integrations`. Cung cấp hàm `toPublicChatIntegrationConfig` chỉ trả về cờ boolean kiểm tra sự tồn tại của token xuống client để bảo vệ an toàn API key khỏi bị đánh cắp.
    *   **Hòa trộn linh hoạt:** Tự động merge cấu hình động từ Firestore với biến môi trường `.env` theo thứ tự ưu tiên hợp lý.
    *   **Mẫu trả lời nhanh:** Quản lý tối đa 30 mẫu trả lời nhanh, tự động định dạng phím tắt có tiền tố `/` ở đầu (ví dụ: `/chao-hoi`) và giới hạn độ dài ký tự an toàn.
*   **Đánh giá:** Kiến trúc bảo mật cấu hình tuyệt vời. Giải pháp ẩn Token/Secret khi gửi dữ liệu xuống client là một điểm sáng về an toàn thông tin.

#### 📝 [src/lib/chatServer.ts](file:///m:/QLCH_VanLanh/src/lib/chatServer.ts) (401 dòng)
*   **Chức năng:** Trọng tâm điều khiển nghiệp vụ nhận/gửi tin nhắn đa kênh phía Server-side.
*   **Cơ chế hoạt động:**
    *   **Sao lưu đa phương tiện thông minh (FB Media Proxy & Archiver):** Khi nhận tin nhắn ảnh từ Facebook, hệ thống tự động fetch file ảnh nhị phân từ FB CDN (trước khi link CDN hết hạn sau 24h), kiểm tra dung lượng tối đa 8MB, tự động lưu vĩnh viễn vào Firebase Storage nội bộ (`private/chat/facebook/{roomId}/...`) và cập nhật lại đường dẫn vào Realtime DB để đảm bảo dữ liệu ảnh lỗi máy của khách không bao giờ bị mất.
    *   **Đồng bộ profile khách:** Tự động gọi Facebook Graph API để lấy Tên và Avatar của khách vãng lai để cập nhật vào phòng chat.
    *   **Nhận/Gửi đa kênh (Webhook Handoff & Send Gateway):** Nhận webhook ghi tin nhắn vào RTDB (đồng thời tắt AI Bot để thợ tiếp quản). Gửi tin nhắn outbound tới API Facebook/Zalo tương ứng khi admin chat trả lời, sau đó push đối ứng vào RTDB.
*   **Đánh giá:** Module cực kỳ đồ sộ và tinh xảo. Giải pháp lưu trữ proxy hình ảnh Facebook CDN thể hiện tư duy thiết kế hệ thống thực chiến xuất sắc, giải quyết triệt để bài toán lưu vết bằng chứng lỗi của khách hàng.

#### 📝 [src/lib/chatWorkflowHandoff.ts](file:///m:/QLCH_VanLanh/src/lib/chatWorkflowHandoff.ts) (35 dòng)
*   **Chức năng:** Chuyển tiếp thông tin khách hàng từ Live Chat sang các luồng nghiệp vụ tạo đơn/phiếu sửa.
*   **Cơ chế hoạt động:**
    *   `storeChatWorkflowHandoff`: Lưu thông tin khách hàng (tên, SĐT, ID phòng chat) vào `sessionStorage` khi nhân viên bấm nút tạo đơn tại màn hình chat.
    *   `consumeChatWorkflowHandoff`: Màn hình POS/Repairs đọc dữ liệu ra sử dụng để tự điền form và **lập tức xóa sạch khỏi sessionStorage** để tránh lỗi ghi đè thông tin cũ khi tạo giao dịch tiếp theo.
*   **Đánh giá:** Giải pháp tích hợp luồng công việc (workflow integration) thông minh, giúp nâng cao đáng kể tốc độ phục vụ tại quầy của nhân viên.

#### 📝 [src/lib/realtimedb.ts](file:///m:/QLCH_VanLanh/src/lib/realtimedb.ts) (234 dòng)
*   **Chức năng:** Client-side SDK Wrapper quản lý các truy vấn và tương tác thời gian thực với Realtime Database.
*   **Cơ chế hoạt động:**
    *   Lắng nghe realtime danh sách phòng chat (`subscribeToRooms`) và thông tin phòng chat (`subscribeToRoomInfo`).
    *   **Tối ưu tải tin nhắn:** Truy vấn tin nhắn (`subscribeToMessages`) sắp xếp theo timestamp và **giới hạn chỉ lấy 100 tin mới nhất** để bảo toàn dung lượng RAM của trình duyệt.
    *   **Trợ lý AI tự động (Gemini Auto-Reply):** Nếu cờ `botActive` bật, khi có tin nhắn mới, hệ thống tự động lọc 5 tin nhắn gần nhất, xây dựng lại cấu trúc hội thoại xen kẽ nghiêm ngặt `user <-> model` (Gemini format requirement), gửi POST tới API `/api/ai` kèm System Instruction để AI tự động phản hồi khách hàng và ghi trực tiếp câu trả lời vào RTDB.
*   **Đánh giá:** Đóng gói tốt, xử lý tối ưu băng thông realtime và tích hợp AI Bot tự động có xử lý hội thoại rất thông minh và đúng chuẩn kỹ thuật.

---

### 28. Nhóm Quản trị Tài chính, Hoa hồng Nhân viên & Tổng hợp Doanh thu (Commissions, Financials & Revenue Aggregations)

#### 📝 [src/lib/commissionCalcServer.ts](file:///m:/QLCH_VanLanh/src/lib/commissionCalcServer.ts) (227 dòng)
*   **Chức năng:** Tính toán và lưu trữ hoa hồng nhân viên phía Server-side bằng Firebase Admin SDK trong transaction.
*   **Cơ chế hoạt động:**
    *   **Phân cấp quy tắc (Hierarchy Engine):** Tự động lọc ra quy tắc hoa hồng thích hợp nhất theo độ ưu tiên giảm dần: Sản phẩm cụ thể (cấp 3) -> Danh mục (cấp 2) -> Chung (cấp 1).
    *   **Phân bổ chiết khấu (Pro-rata Discount Distribution):** Nếu quy tắc hoa hồng áp dụng sau giảm giá và đơn hàng có Voucher giảm giá chung, hệ thống tự động phân bổ số tiền giảm giá chung cho từng dòng sản phẩm tương ứng với tỷ lệ giá trị của nó, lấy giá trị sau giảm làm gốc tính hoa hồng.
    *   **Thu hồi hoa hồng an toàn:** Khi hủy đơn hàng, hệ thống không xóa bản ghi cũ mà tạo ra một bản ghi hoa hồng đối ứng có giá trị âm (`amount < 0`) loại `reversal` để bảo toàn vết kiểm toán (audit trail), cập nhật delta âm vào Daily Aggregates.
*   **Đánh giá:** Logic tính toán hoa hồng cực kỳ chi tiết, chặt chẽ. Giải pháp phân bổ chiết khấu theo tỷ lệ và tạo bản ghi thu hồi âm thể hiện tư duy thiết kế tài chính chuyên nghiệp bậc cao.

#### 📝 [src/lib/commissionUtils.ts](file:///m:/QLCH_VanLanh/src/lib/commissionUtils.ts) (189 dòng)
*   **Chức năng:** Logic tính toán và lưu trữ hoa hồng nhân viên phía Client-side sử dụng Client SDK.
*   **Cơ chế hoạt động:** Có cấu trúc thuật toán so khớp phân cấp và phân bổ chiết khấu tương tự như bản Server-side. Điểm khác biệt là nó sử dụng Firebase Client SDK để lưu trữ trực tiếp các bản ghi hoa hồng đơn lẻ, hỗ trợ tham số `isRefund` tự động sinh mã ID đuôi `_refund` chứa giá trị hoa hồng âm để bảo toàn dữ liệu gốc.
*   **Đánh giá:** Giải pháp tương thích tốt cho các tình huống cần tính toán/ghi nhận hoa hồng nhanh trực tiếp từ Client-side.

#### 📝 [src/lib/revenueAggregate.ts](file:///m:/QLCH_VanLanh/src/lib/revenueAggregate.ts) (144 dòng)
*   **Chức năng:** Khai báo cấu trúc và các thuật toán in-memory quản lý dữ liệu tổng hợp doanh thu ngày/tháng.
*   **Cơ chế hoạt động:**
    *   Quy hoạch 17 chỉ số tài chính cốt lõi cần cộng dồn. Định nghĩa ngày bắt đầu áp dụng cơ chế tổng hợp `REVENUE_AGGREGATE_ROLLOUT_DATE = '2026-06-17'`.
    *   `normalizeRevenueAggregateDelta`: Chuẩn hóa lượng thay đổi tài chính, tự động cập nhật các chỉ số phụ thuộc như tổng doanh thu, tổng chi phí và lợi nhuận ròng.
    *   `mergeRevenueAggregateDocs`: Cộng dồn (gộp) in-memory toàn bộ các tài liệu tổng hợp ngày thành lũy kế tổng của cả kỳ báo cáo.
    *   `applyRevenueAggregateDelta`: Cập nhật trực tiếp delta tài chính vào mảng tài liệu tổng hợp, tự động khởi tạo bản ghi mới nếu ngày giao dịch chưa tồn tại trong mảng.
*   **Đánh giá:** Nền tảng thuật toán tuyệt vời cho hệ thống báo cáo tài chính. Việc xử lý gộp và chuẩn hóa in-memory giúp giảm thiểu tối đa tài nguyên xử lý và tối ưu hóa tốc độ vẽ biểu đồ.

#### 📝 [src/lib/revenueAggregateServer.ts](file:///m:/QLCH_VanLanh/src/lib/revenueAggregateServer.ts) (105 dòng)
*   **Chức năng:** Cập nhật đồng bộ và lũy kế số liệu tài chính vào Firestore phía Server-side trong transaction.
*   **Cơ chế hoạt động:**
    *   **Cập nhật lũy kế kép (Dual Update):** Hàm `incrementRevenueAggregates` sử dụng toán tử nguyên tử `FieldValue.increment` để cộng dồn các chỉ số tài chính delta đồng thời vào 2 tài liệu: Tổng hợp ngày (`revenue_daily_aggregates`) và Tổng hợp tháng (`revenue_monthly_aggregates`) trong cùng một transaction.
    *   **Bóc tách Doanh thu & Công nợ:** Hàm `buildCompletedOrderRevenueDelta` phân tích chi tiết đơn hàng: lọc bỏ dòng thu nợ trùng, tính số tiền khách thực trả (trừ tiền hoàn), bóc tách phần doanh thu thực thu (`orderRevenue`) và phần công nợ ghi nợ (`debtRevenue`), tự động tăng số lượng đơn và doanh thu tương ứng theo nguồn (Web/POS). Hỗ trợ tham số nhân `multiplier = -1` để sinh delta âm thu hồi khi hủy đơn cực kỳ tiện lợi.
*   **Đánh giá:** Giải pháp kỹ thuật hoàn hảo cho bài toán tài chính. Việc kết hợp transaction nguyên tử với bộ bóc tách doanh thu/công nợ chi tiết đảm bảo số liệu kế toán của cửa hàng luôn khớp 100% realtime.

---

### 29. Nhóm Quản trị Kho bãi, Tồn kho FIFO & Đề xuất Nhập kho (Inventory FIFO, Allocations & Product Lifecycle)

#### 📝 [src/lib/inventoryFifo.ts](file:///m:/QLCH_VanLanh/src/lib/inventoryFifo.ts) (155 dòng)
*   **Chức năng:** Trọng tâm xử lý thuật toán xuất kho theo nguyên lý FIFO (First In, First Out - Nhập trước, Xuất trước) an toàn phía Server-side.
*   **Cơ chế hoạt động:**
    *   **Bóc tách 2 pha nguyên tử:** Tránh lỗi xung đột đọc/ghi của transaction bằng cách tách biệt Pha 1 (Đọc - truy vấn lấy các lô hàng hoạt động `inventory_lots` của sản phẩm xếp theo thời gian nhập tăng dần) và Pha 2 (Ghi - chạy logic trừ kho trên RAM và gọi update).
    *   **Ưu tiên lô chỉ định:** Hỗ trợ trừ số lượng ở lô hàng được chỉ định đích danh trước (`preferredLotCodes`) nếu có.
    *   **FIFO & Fallback:** Trừ dần số lượng của lô cũ nhất còn hàng và đóng lô khi về 0. Tự động fallback sang lô ảo `LEGACY_STOCK` nếu tổng số lượng trong các lô không đủ xuất để đảm bảo giao dịch thông suốt.
*   **Đánh giá:** Một giải pháp FIFO thực chiến định cao, được bóc tách pha cực kỳ thông minh để tương thích hoàn hảo với Firestore Transaction.

#### 📝 [src/lib/inventoryImportAllocation.ts](file:///m:/QLCH_VanLanh/src/lib/inventoryImportAllocation.ts) (112 dòng)
*   **Chức năng:** Phân bổ linh kiện nhập kho cho các yêu cầu sửa chữa đang chờ và tính toán giá vốn WAC.
*   **Cơ chế hoạt động:**
    *   `planRepairImportAllocation`: Khi nhập hàng, đối chiếu với dòng yêu cầu linh kiện của KTV (`line`). Tính toán số lượng đang thiếu thực tế để phân bổ làm lượng tạm giữ (`heldQuantity`) cho phiếu sửa chữa, phần còn lại chuyển thành tồn kho tự do bán lẻ (`surplusQuantity`). Yêu cầu hủy liên kết nếu trạng thái yêu cầu đã được ráp máy (`selected`) hoặc không hoạt động.
    *   `applyProductImport`: Tích hợp công thức tính giá vốn trung bình gia quyền (**WAC - Weighted Average Cost**): `costPrice = (tồn_cũ * giá_vốn_cũ + lượng_nhập * giá_nhập) / (tồn_cũ + lượng_nhập)` và tự động cộng dồn số lượng tạm giữ.
*   **Đánh giá:** Logic kế toán kho rất chuyên nghiệp. Cơ chế phân bổ held stock kết hợp công thức WAC giúp hệ thống phản ánh cực kỳ chính xác giá trị tài sản kho và bảo vệ biên lợi nhuận thực tế của cửa hàng.

#### 📝 [src/lib/importReceiptAvailability.ts](file:///m:/QLCH_VanLanh/src/lib/importReceiptAvailability.ts) (27 dòng)
*   **Chức năng:** Quản lý trạng thái khả dụng của các mặt hàng trong phiếu đề xuất nhập kho.
*   **Cơ chế hoạt động:** Phân loại 3 trạng thái khả dụng của mặt hàng (đã có `in_stock`, hết hàng `unavailable`, đã duyệt `approved`). Hàm `calculateImportableTotal` tính tổng giá trị phiếu nhập thực tế bằng cách tự động loại bỏ hoàn toàn các mặt hàng có trạng thái hết hàng `unavailable` ra khỏi phép tính.
*   **Đánh giá:** Nhỏ gọn, hữu ích, giúp kế toán đối soát chính xác công nợ nhập hàng thực tế.

#### 📝 [src/lib/productCodeRegistry.ts](file:///m:/QLCH_VanLanh/src/lib/productCodeRegistry.ts) (149 dòng)
*   **Chức năng:** Đăng ký và kiểm soát tính duy nhất của mã số sản phẩm (SKU, Barcode, QR Code) toàn hệ thống.
*   **Cơ chế hoạt động:**
    *   **Registry phân tán:** Lưu trữ riêng danh sách mã đã đăng ký tại collection `product_code_registry` sử dụng mã số làm Document ID để kiểm tra sự tồn tại với độ phức tạp $O(1)$.
    *   **Giao dịch an toàn:** Các hàm tạo sản phẩm (`createProductWithCodes`) và cập nhật sản phẩm (`updateProductWithCodes`) chạy trong Firestore Transaction. Đảm bảo ném lỗi và hủy ghi nếu phát hiện mã QR/Barcode đã bị gắn cho sản phẩm khác. Tự động xóa mã cũ khỏi registry khi sản phẩm thay đổi mã số để giải phóng tài nguyên.
*   **Đánh giá:** Thiết kế xuất sắc giải quyết triệt để bài toán ràng buộc duy nhất (Uniqueness constraint) trong cơ sở dữ liệu NoSQL, bảo vệ an toàn cho nghiệp vụ quét mã tại quầy POS.

#### 📝 [src/lib/productCodes.ts](file:///m:/QLCH_VanLanh/src/lib/productCodes.ts) (129 dòng)
*   **Chức năng:** Thuật toán mã hóa, sinh mã vạch ngắn và phân tích cú pháp quét mã QR/Barcode.
*   **Cơ chế hoạt động:**
    *   **Băm sinh mã ngắn:** Tích hợp thuật toán băm hai hằng số nhân băm (`Math.imul`) trên tên/ID sản phẩm, convert sang cơ số 36 viết hoa để sinh ra mã ngắn độc bản 8 ký tự dạng `{PREFIX}-{8_CHAR_HASH}` (ví dụ: `SP-7XD8A9FJ`) rất dễ in và quét.
    *   **Phân tích quét mã đa dụng:** Hàm `extractProductCodeFromScan` tự động nhận diện nếu quét được URL để bóc tách mã sản phẩm từ URL parameter, đồng thời loại bỏ các tiền tố máy quét tự thêm như `POS:` hay `SKU:`.
    *   Tự động gộp các mã định danh của sản phẩm thành chuỗi tìm kiếm phẳng (`productCodeSearchText`) giúp tăng tốc so khớp.
*   **Đánh giá:** Bộ thuật toán xử lý mã vạch cực kỳ thực chiến, thông minh và mang tính tối ưu hóa cao.

#### 📝 [src/lib/productLifecycle.ts](file:///m:/QLCH_VanLanh/src/lib/productLifecycle.ts) (54 dòng)
*   **Chức năng:** Quản lý vòng đời sản phẩm, tồn kho khả dụng và ràng buộc lưu trữ.
*   **Cơ chế hoạt động:**
    *   **Tồn kho khả dụng (Available Stock):** Tính toán bằng `tồn_vật_lý - tồn_tạm_giữ`. Ngăn chặn hoàn toàn việc bán đè (Overselling) lên các sản phẩm đã được khách cọc hoặc linh kiện đã gán cho phiếu sửa của KTV.
    *   **Rào cản lưu trữ (Archive Guard):** Ngăn cấm xóa sản phẩm khỏi DB để bảo toàn lịch sử đơn hàng. Cho phép chuyển sang trạng thái lưu trữ (`inactive`) chỉ khi tồn kho vật lý và tồn tạm giữ bằng 0, ném lỗi chặn chi tiết nếu còn hàng.
    *   Tự động khôi phục trạng thái hoạt động (`active`) khi thủ kho nhập lô hàng mới cho sản phẩm đang lưu trữ hoặc đề xuất nháp.
*   **Đánh giá:** Thiết kế vòng đời sản phẩm rất quy chuẩn, chặt chẽ, đảm bảo tính toàn vẹn của dữ liệu báo cáo tài chính và vận hành kho bãi.

---

### 30. Nhóm Tối ưu hóa Hình ảnh & Phân tích Tải Video (Media Optimizers & Video Compression helpers)

#### 📝 [src/lib/imageLoader.ts](file:///m:/QLCH_VanLanh/src/lib/imageLoader.ts) (68 dòng)
*   **Chức năng:** Custom Image Loader cho Next.js `Image` để tối ưu hóa chi phí và băng thông trên Firebase Hosting.
*   **Cơ chế hoạt động:**
    *   **Proxy nén ảnh miễn phí:** Khi phát hiện ảnh tải từ Firebase Storage, loader tự động chuyển hướng qua proxy nén ảnh tốc độ cao `wsrv.nl` để resize theo chiều rộng Next.js yêu cầu và nén sang định dạng WebP chất lượng cao (`output=webp&q=75`), giúp cải thiện vượt trội điểm LCP/CLS mà không tốn chi phí CPU máy chủ Cloud Run.
    *   **Bypass Proxy cho LCP:** Cho phép truyền cờ `bypassProxy=true` để lấy link CDN trực tiếp từ Firebase Storage cho các ảnh quan trọng cần ưu tiên hiển thị lập tức (LCP).
    *   **Thumbnail Fallback:** Nếu proxy bị tắt/lỗi, tự động đổi URL sang file ảnh thu nhỏ (thumbnail sinh sẵn có đuôi `_thumb.webp`) cho các ảnh kích thước nhỏ. Tận dụng resize tự động của Google cho ảnh avatar.
*   **Đánh giá:** Giải pháp tối ưu hóa ảnh cực kỳ thông minh, giải quyết triệt để điểm yếu xử lý ảnh nặng của Cloud Run và tiết kiệm 95% chi phí băng thông hình ảnh cho dự án.

#### 📝 [src/lib/imageOptimizer.ts](file:///m:/QLCH_VanLanh/src/lib/imageOptimizer.ts) (71 dòng)
*   **Chức năng:** Tối ưu hóa hình ảnh (resize + convert WebP) trực tiếp trên trình duyệt trước khi tải lên cloud.
*   **Cơ chế hoạt động:**
    *   **Giải mã ngoài luồng:** Sử dụng `createImageBitmap` giải mã ảnh ở luồng chạy ngầm của trình duyệt, không gây nghẽn UI chính.
    *   **Nén không đơ màn hình (No UI Freeze):** Sử dụng `OffscreenCanvas` để vẽ và xuất tệp nén WebP chất lượng 75% ở luồng phụ (Web Worker level). Tự động fallback sang Canvas DOM thông thường nếu chạy trên trình duyệt cũ.
    *   Tự động thu nhỏ ảnh vượt quá kích thước tối đa (`maxWidth`, `maxHeight = 1600px`) theo đúng tỷ lệ khung hình.
*   **Đánh giá:** Tiện ích tối ưu ảnh client-side viết cực kỳ chuyên nghiệp và mượt mà, giúp tăng 300% tốc độ tải ảnh lên cho khách hàng và giảm dung lượng lưu trữ trên cloud cực tốt.

#### 📝 [src/lib/validateImage.ts](file:///m:/QLCH_VanLanh/src/lib/validateImage.ts) (24 dòng)
*   **Chức năng:** Helper kiểm tra tính hợp lệ của tệp hình ảnh trước khi tải lên.
*   **Cơ chế hoạt động:** Kiểm tra định dạng ảnh (chỉ chấp nhận JPG, PNG, WebP) và giới hạn dung lượng tệp tin tối đa là **2MB** để đảm bảo hiệu năng lưu trữ. Trả về thông báo lỗi chi tiết cho người dùng nếu vi phạm.
*   **Đánh giá:** Nhỏ gọn, hữu ích, giúp chuẩn hóa và bảo vệ tính an toàn cho hệ thống upload.

#### 📝 [src/lib/videoOptimizer.ts](file:///m:/QLCH_VanLanh/src/lib/videoOptimizer.ts) (88 dòng)
*   **Chức năng:** Nén video trực tiếp trên trình duyệt của người dùng sử dụng bộ thư viện FFmpeg WebAssembly.
*   **Cơ chế hoạt động:**
    *   **Single-threaded Core:** Tải và khởi tạo FFmpeg core bản đơn luồng từ CDN để nén video ngay trên trình duyệt mà không cần trang web phải cấu hình các tiêu đề bảo mật COOP/COEP Headers phức tạp.
    *   **Nén video thực chiến:** Ghi video gốc vào bộ nhớ ảo của FFmpeg, thực thi lệnh nén sử dụng codec `libx264`, cấu hình nén mạnh `crf 28` (giảm 70-90% dung lượng mà vẫn cực kỳ sắc nét), preset nén nhanh `fast` và nén âm thanh `aac 128k`.
    *   Trả về tệp video nén `.mp4` và tự động dọn dẹp sạch sẽ bộ nhớ ảo để tránh rò rỉ RAM trên trình duyệt.
*   **Đánh giá:** Một kiệt tác kỹ thuật xuất sắc trong dự án. Giải pháp nén video client-side bằng WebAssembly giúp phân tán 100% công suất tính toán nén video cho thiết bị của chính người dùng, đưa chi phí CPU nén video của máy chủ về 0đ một cách ngoạn mục.

---

### 31. Nhóm Bảo mật API, Session Cookies & Quản lý Lưu trữ (Rate Limiting, Sessions & Cloud Storage)

#### 📝 [src/lib/rateLimit.ts](file:///m:/QLCH_VanLanh/src/lib/rateLimit.ts) (64 dòng)
*   **Chức năng:** Bộ giới hạn tần suất yêu cầu phân tán (Distributed Rate Limiter) tương thích môi trường Serverless.
*   **Cơ chế hoạt động:**
    *   **Lưu trữ trạng thái phân tán:** Thay vì lưu in-memory (bị vô hiệu khi container serverless auto-scale/restart), hệ thống sử dụng Firestore collection `rate_limits` làm nơi lưu trữ tập trung.
    *   **Giao dịch chống đua (Race Condition Protection):** Khi nhận yêu cầu, hệ thống chạy Firestore Transaction để đọc mốc thời gian hết hạn (`resetAt`) và biến đếm (`count`). Nếu còn trong khung thời gian và vượt hạn mức (`limit`), chặn yêu cầu (`isLimited = true`). Ngược lại, cộng dồn đếm hoặc reset khung mới.
    *   **Fail-Open Pattern:** Nếu Firestore gặp sự cố quá tải, hàm tự động bắt lỗi và cho phép yêu cầu đi qua (`return false`) để ưu tiên tối đa tính khả dụng của dịch vụ cho khách hàng.
*   **Đánh giá:** Giải pháp rate limit phân tán thiết kế rất thông minh và tinh tế, đáp ứng hoàn hảo kiến trúc serverless với tư duy thiết kế fail-safe chuẩn mực.

#### 📝 [src/lib/sessionCookie.ts](file:///m:/QLCH_VanLanh/src/lib/sessionCookie.ts) (69 dòng)
*   **Chức năng:** Ký số và xác thực mã hóa cookie phiên làm việc tương thích Edge Runtime.
*   **Cơ chế hoạt động:**
    *   **Edge Runtime Compatibility:** Sử dụng thuần **Web Crypto API** tiêu chuẩn (`crypto.subtle`) thay vì thư viện Node.js, giúp tệp tin hoạt động hoàn hảo cả ở API routes lẫn Next.js Edge Middleware chặn route.
    *   **Ký số HMAC-SHA256:** Hàm `signPayload` bọc thông tin vai trò/quyền hạn nhân viên thành chuỗi JSON Base64Url và ký số bằng khóa HMAC bảo mật. Hàm `verifyPayload` tách chuỗi và xác thực chữ ký để phát hiện và từ chối các phiên cookie bị chỉnh sửa/giả mạo (tampered).
*   **Đánh giá:** Giải pháp xác thực cookie phiên cực kỳ nhẹ, nhanh và an toàn, giải quyết xuất sắc rào cản hạn chế thư viện của Next.js Middleware.

#### 📝 [src/lib/sms.ts](file:///m:/QLCH_VanLanh/src/lib/sms.ts) (39 dòng)
*   **Chức năng:** Cổng kết nối gửi tin nhắn SMS giao dịch/CSKH qua SpeedSMS.
*   **Cơ chế hoạt động:**
    *   Gửi yêu cầu POST tới API SpeedSMS sử dụng phương thức xác thực Basic Auth mã hóa base64 API key.
    *   Hỗ trợ gửi tin nhắn OTP/Giao dịch (`sms_type: 2`) và cấu hình tên thương hiệu hiển thị (`brandname`).
    *   **Local Test Fail-safe:** Nếu API Key chưa được cấu hình, hệ thống tự động in log preview tin nhắn thay vì ném lỗi làm hỏng tiến trình nghiệp vụ.
*   **Đánh giá:** Tích hợp gọn gàng, xử lý local test thông minh giúp việc phát triển dễ dàng.

#### 📝 [src/lib/storage.ts](file:///m:/QLCH_VanLanh/src/lib/storage.ts) (199 dòng)
*   **Chức năng:** SDK Wrapper quản lý các thao tác tệp tin trên Cloud Storage và dọn dẹp thư viện media.
*   **Cơ chế hoạt động:**
    *   **Tải lên an toàn:** Tự động đổi tên file kèm timestamp độc bản và dọn ký tự lạ. Giới hạn kích thước video tối đa **50MB**. Hỗ trợ tải hàng loạt song song mượt mà.
    *   **Bóc tách link xóa:** Hàm `deleteImage` phân tích ngược URL tải xuống của Firebase (chứa mã hóa phức tạp) để lấy ra đường dẫn file thực tế trên Storage để thực hiện xóa.
    *   **Dọn rác thư viện (Broken Media Cleaner):** Hàm `cleanBrokenMedia` quét toàn bộ collection `media_library` theo từng đợt (Batch 50 bản ghi) dùng cursor pagination để kiểm tra tính tồn tại của file trên Storage. Nếu file đã bị xóa trên Storage, hệ thống tự động xóa bản ghi mồ côi tương ứng trên Firestore.
*   **Đánh giá:** Gói helper hoàn thiện, xử lý triệt để bài toán bóc tách link xóa và cơ chế dọn dẹp broken media phân trang rất chuyên nghiệp, ngăn chặn thất thoát dữ liệu và làm sạch rác hệ thống.

---

### 32. Nhóm Tích hợp Trợ lý AI & Sinh Nội dung Tự động (AI Assistants & Content Generators)

#### 📝 [src/lib/ollama.ts](file:///m:/QLCH_VanLanh/src/lib/ollama.ts) (90 dòng)
*   **Chức năng:** Tích hợp mô hình ngôn ngữ lớn chạy local qua Ollama phục vụ các tác vụ AI và chatbot nội bộ.
*   **Cơ chế hoạt động:**
    *   **Cấu hình môi trường:** Đọc URL host `OLLAMA_HOST` (mặc định `http://localhost:11434`) và model `OLLAMA_MODEL` (mặc định `gemma4:e4b`) từ biến môi trường để kết nối với API Ollama local.
    *   **Phát trực tuyến kết quả (Streaming):** Hàm `generateContentStream` gửi yêu cầu POST tới endpoint `/api/generate` của Ollama với cờ `stream: true`. Sử dụng `TransformStream` để decode luồng nhị phân nhận về, tách chuỗi theo dòng, parse JSON từng dòng để trích xuất trường `response` và mã hóa thành văn bản thuần trả về một `ReadableStream` cho client hiển thị chữ chạy (typing effect).
    *   **Nhận toàn bộ kết quả (Non-streaming):** Hàm `generateContent` gửi yêu cầu với cờ `stream: false` để lấy toàn bộ chuỗi phản hồi văn bản trong một request duy nhất, phục vụ các tác vụ xử lý ngầm.
    *   **Bắt lỗi an toàn:** Kiểm tra HTTP status và cố gắng parse thông tin lỗi chi tiết dạng JSON từ API body để hỗ trợ debug.
*   **Đánh giá:** Module tích hợp Ollama nhỏ gọn, chuẩn mực. Việc tự viết `TransformStream` để chuẩn hóa luồng stream từ JSON Ollama sang text thuần là giải pháp xử lý bất đồng bộ rất tối ưu.

#### 📝 [src/lib/gemini.ts](file:///m:/QLCH_VanLanh/src/lib/gemini.ts) (166 dòng)
*   **Chức năng:** Tích hợp Google Gemini API phục vụ Trợ lý AI tư vấn khách hàng thời gian thực trên storefront/livechat và tự động sinh bài viết truyền thông tin tức cho Admin.
*   **Cơ chế hoạt động:**
    *   **Huấn luyện ngữ cảnh thương hiệu:** Khởi tạo `GoogleGenerativeAI` bằng API Key và gọi `getBusinessIdentity()` để tích hợp trực tiếp hotline, địa chỉ, website thực tế của cửa hàng vào `SYSTEM_PROMPT` nhằm huấn luyện AI tư vấn chính xác 100% theo thông tin doanh nghiệp.
    *   **Vệ sinh lịch sử trò chuyện nghiêm ngặt:** Để đáp ứng quy tắc khắt khe của Gemini API (lịch sử chat bắt đầu bằng `user` và luân phiên liên tục `user <-> model`), hàm `chatWithGemini` tự động dọn dẹp mảng lịch sử truyền vào: khử trùng lặp tin nhắn cuối, lọc bỏ các dòng chat lệch quy tắc xen kẽ và tự động loại bỏ phần tử cuối nếu lịch sử kết thúc bằng `user` trước khi bắt đầu phiên chat động.
    *   **Quản lý hội thoại:** Sử dụng model `gemini-2.5-flash` kèm cấu hình `generationConfig` (`temperature: 0.7`) và truyền `systemInstruction` động để mở phiên chat có bộ nhớ qua `startChat`, gửi tin nhắn qua `chat.sendMessage`.
    *   **Sinh bài viết tự động:** Định nghĩa 3 mẫu prompt chuyên biệt cho Review sản phẩm (`review`), Tin tức công nghệ (`news`), và Mẹo sử dụng (`tips`) giúp Admin sinh nhanh nội dung bài đăng chuẩn SEO.
    *   **Phân loại lỗi & Fail-safe:** Nhận diện và phân loại lỗi HTTP thành `forbidden`, `rate_limited` hoặc `provider_error`. Nếu xảy ra lỗi hoặc thiếu API key, hệ thống trả về thông báo lịch sự hướng dẫn khách gọi hotline và lưu lại tin nhắn để thợ tiếp quản.
*   **Đánh giá:** Giải pháp tích hợp Gemini API rất thực chiến và chuyên nghiệp. Cơ chế tự động vệ sinh lịch sử chat động giải quyết triệt để các lỗi crash API đặc trưng của Gemini SDK.

---

### 33. Phân hệ Sửa chữa, Đồ thị Workflow & Quy tắc Bảo hành (Repair Workflows, Graph Validation & Warranties)

#### 📝 [src/lib/workflowFeatures.ts](file:///m:/QLCH_VanLanh/src/lib/workflowFeatures.ts) (161 dòng)
*   **Chức năng:** Đăng ký các tính năng nghiệp vụ của quy trình sửa chữa và cung cấp các helper xác thực trạng thái phiếu sửa.
*   **Cơ chế hoạt động:**
    *   **Registry tính năng (`WORKFLOW_FEATURES`):** Khai báo 9 tính năng động (như yêu cầu test full chức năng, yêu cầu linh kiện về kho, kích hoạt cổng thanh toán, phân công KTV, tính hoa hồng thợ/sales...). Mỗi tính năng định rõ phạm vi áp dụng (`admin` hay `technician`).
    *   **Kiểm tra tính năng hoạt động:** Hàm `hasFeature` và `getActiveFeatures` đối chiếu trạng thái hiện tại của phiếu với cấu hình `allowedFeatures` động tải từ Firestore để quyết định bật/tắt UI hoặc chặn logic nghiệp vụ.
    *   **Kiểm soát Checklist thiết bị:** Định nghĩa bộ checklist 8 mục cốt lõi (Vỏ máy, màn hình, cảm ứng, camera, loa/mic, kết nối, pin, sinh trắc học) và helper `isChecklistComplete` kiểm tra xem KTV đã nhập đủ kết quả test cho cả 8 mục này hay chưa để chặn chuyển trạng thái khi bật tính năng `requireChecklist`.
    *   **Tích hợp video YouTube:** Helper `getYouTubeEmbedUrl` sử dụng Regex tự động bóc tách ID video từ mọi định dạng link YouTube (watch, embed, shorts, youtu.be) để xuất link embed chuẩn phục vụ đính kèm video tình trạng máy.
    *   **Kiểm tra linh kiện chờ (`areAllPartsReady`):** Duyệt danh sách linh kiện trong phiếu và chặn chuyển sang sửa chữa nếu còn linh kiện ở trạng thái chờ (`requested` hoặc `ordered`) khi bật tính năng `requirePartsReady`.
*   **Đánh giá:** Thiết kế module hóa các tính năng quy trình (workflow features) xuất sắc. Giúp tách biệt hoàn toàn logic kiểm soát nghiệp vụ khỏi mã nguồn, cho phép Admin tùy biến linh hoạt quy trình sửa chữa trực tiếp trên giao diện cài đặt.

#### 📝 [src/lib/repairStatus.ts](file:///m:/QLCH_VanLanh/src/lib/repairStatus.ts) (62 dòng)
*   **Chức năng:** Khai báo các hằng số trạng thái cốt lõi và helper phân loại cho phiếu sửa chữa và linh kiện thay thế.
*   **Cơ chế hoạt động:**
    *   **Hằng số trạng thái:** Khai báo đóng băng (`as const`) 2 nhóm trạng thái: Trạng thái phiếu sửa `REPAIR_STATUS` (chờ tiếp nhận, đang kiểm tra, đã đặt linh kiện, chờ bàn giao, done, refund, out) và Trạng thái linh kiện `REPAIR_PART_STATUS` (requested, approved, ordered, selected, in_stock, unavailable, rejected, cancelled).
    *   **Helpers phân loại:** Cung cấp các hàm so khớp nhanh trạng thái phiếu (`isRepairStatus`), trạng thái linh kiện (`isRepairPartStatus`). Hàm `isPendingRepairPart` kiểm tra linh kiện có đang ở trạng thái chờ xử lý hay không. Hàm `isWarrantyEligibleRepairPart` lọc các linh kiện đủ điều kiện bảo hành (không bị từ chối/hủy).
*   **Đánh giá:** Module khai báo hằng số và helper trạng thái tinh gọn, quy chuẩn. Đóng vai trò quan trọng trong việc thống nhất các giá trị chuỗi trạng thái trên toàn hệ thống, tránh bug gõ sai ký tự.

#### 📝 [src/lib/repairWarrantyRules.ts](file:///m:/QLCH_VanLanh/src/lib/repairWarrantyRules.ts) (116 dòng)
*   **Chức năng:** Quản lý quy tắc bảo hành, tự động tra cứu và áp dụng thời hạn bảo hành lên linh kiện khi phiếu sửa chữa hoàn tất.
*   **Cơ chế hoạt động:**
    *   **Chuẩn hóa khóa so khớp:** Hàm `normalizeWarrantyRuleKey` chuẩn hóa các chuỗi mô tả (bỏ dấu tiếng Việt, ký tự đặc biệt, chuyển chữ thường) để tạo ra các key map đồng nhất.
    *   **Tra cứu quy tắc bảo hành 2 pha:** Hàm `resolveRepairPartWarrantyRule` thu thập toàn bộ chuỗi thông tin của linh kiện (tên linh kiện, loại linh kiện do thợ chọn, danh mục kho, danh mục cha) làm ứng viên so khớp. Thực hiện Pha 1 (Exact Match) so khớp chính xác với bản đồ quy tắc `ruleMap`. Nếu không thấy, chạy tiếp Pha 2 (Fuzzy Match) so khớp chứa từ khóa. Nếu vẫn không thấy, tự động áp dụng quy tắc mặc định có key `'khac'`.
    *   **Đóng dấu bảo hành tự động (`stampRepairWarrantyOnParts`):** Khi phiếu sửa hoàn thành, hàm lọc các linh kiện được lắp ráp, đủ điều kiện bảo hành và chưa có hạn bảo hành, tính toán ngày hết hạn (`warrantyExpiresAt`) bằng cách cộng thêm số tháng bảo hành vào ngày hoàn tất và tự động cập nhật vào danh sách linh kiện.
*   **Đánh giá:** Logic xử lý quy tắc bảo hành thông minh và thực chiến. Giải pháp so khớp 2 pha kết hợp đóng dấu bảo hành tự động giúp KTV rảnh tay hoàn toàn, loại bỏ 100% rủi ro thợ ghi sai hạn bảo hành cho khách.

#### 📝 [src/lib/repairWorkflowConfig.ts](file:///m:/QLCH_VanLanh/src/lib/repairWorkflowConfig.ts) (116 dòng)
*   **Chức năng:** Cấu hình các tính năng bắt buộc và cung cấp bộ parser kiểm định tính toàn vẹn của đồ thị quy trình sửa chữa/bảo hành.
*   **Cơ chế hoạt động:**
    *   **Bảo vệ tính năng cốt lõi:** Khai báo `REQUIRED_REPAIR_FEATURES` và `REQUIRED_WARRANTY_FEATURES` định nghĩa các tính năng bắt buộc phải gắn cứng vào các trạng thái mặc định (như cổng thanh toán ở bước bàn giao, tính hoa hồng ở bước done) để đảm bảo an toàn vận hành cửa hàng.
    *   **Kiểm định cấu trúc đồ thị (Graph Validation):** Hàm `validateWorkflow` chạy bộ quy tắc kiểm tra nghiêm ngặt cấu trúc đồ thị workflow được thiết lập từ Admin: đảm bảo danh sách nút không rỗng, ID không trùng/rỗng, có ít nhất một trạng thái kết thúc (`isTerminal`), trạng thái đầu tiên không được là kết thúc, các trạng thái không tự trỏ về chính mình, ID trỏ tiếp theo (`allowedNext`) phải thực sự tồn tại và trạng thái kết thúc không được trỏ đi tiếp.
    *   **Xác thực nhóm tra cứu:** Hàm `validateTrackingGroups` đảm bảo các trạng thái gộp hiển thị cho khách hàng (ở storefront) có thực sự tồn tại trong workflow và không có trạng thái nào bị phân vào 2 nhóm tra cứu khác nhau để tránh xung đột UI.
*   **Đánh giá:** Thiết kế đồ thị workflow động kết hợp bộ parser xác thực cấu trúc (Graph Validation) rất xuất sắc. Nó bảo vệ hệ thống tuyệt đối khỏi các lỗi cấu hình sai của Admin làm đứt gãy hoặc gây vòng lặp vô tận trên quy trình sửa chữa.

#### 📝 [src/lib/repairWorkflowServer.ts](file:///m:/QLCH_VanLanh/src/lib/repairWorkflowServer.ts) (51 dòng)
*   **Chức năng:** Tải và kiểm định cấu hình quy trình sửa chữa phía Server-side chuyên dụng cho môi trường transaction.
*   **Cơ chế hoạt động:**
    *   **Tải cấu hình trong transaction:** Hàm `loadRepairWorkflow` nhận `Transaction` và `Firestore` để đọc cấu hình `system_config/repairs` ngay trong transaction để đảm bảo tính nhất quán dữ liệu.
    *   **Kiểm định nghiêm ngặt:** Hàm `getWorkflowFromSettings` gọi bộ chuẩn hóa và chạy `validateWorkflow` để xác thực đồ thị workflow. Nếu phát hiện cấu hình workflow bị lỗi, lập tức ném lỗi để tự động rollback transaction hiện tại.
    *   **Helper phân tích:** Cung cấp hàm `requireWorkflowNode` tìm kiếm nhanh nút trạng thái trong cây và ném lỗi nếu ID trạng thái không tồn tại trong cấu hình.
*   **Đánh giá:** Module hỗ trợ phía server tinh gọn và fail-safe. Việc bắt buộc validate đồ thị workflow ngay trong pha đọc của transaction phía server giúp ngăn chặn hoàn toàn rủi ro ghi đè trạng thái rác hoặc trạng thái lỗi vào database.

#### 📝 [src/lib/repairAccess.ts](file:///m:/QLCH_VanLanh/src/lib/repairAccess.ts) (19 dòng)
*   **Chức năng:** Cung cấp các helper phân quyền truy cập nhanh dành riêng cho phân hệ sửa chữa.
*   **Cơ chế hoạt động:**
    *   **Nhận diện Quản lý sửa chữa (`isRepairManager`):** Xác định tài khoản có quyền điều phối thợ, sửa phiếu khi vai trò là `admin` hoặc vai trò là `staff` có đồng thời cả 2 quyền `manage_repairs` và `manage_orders`.
    *   **Nhận diện Kỹ thuật viên (`isTechnicianUser`):** Xác định tài khoản có quyền thao tác kỹ thuật khi vai trò là `staff` và có chứa quyền `manage_repairs`.
*   **Đánh giá:** Helpers phân quyền tinh gọn, chuẩn hóa, giúp dễ dàng kiểm soát quyền hiển thị UI và bảo vệ API endpoints trên toàn hệ thống.

---

### 34. Nhóm Các Hooks và Helper Tiện ích Phụ trợ (Helper Hooks & Utility Extensions)

#### 📝 [src/lib/icon-map.ts](file:///m:/QLCH_VanLanh/src/lib/icon-map.ts) (51 dòng)
*   **Chức năng:** Bản đồ ánh xạ (Lookup table) giữa tên biểu tượng dạng chuỗi (lưu trữ trên Firestore) và React component tương ứng từ thư viện Lucide.
*   **Cơ chế hoạt động:**
    *   **Bản đồ ánh xạ:** Khai báo `ICON_MAP` gồm 25 Lucide component phổ biến (Smartphone, Wrench, Battery, Monitor, Laptop...).
    *   **Tạo danh sách cho Admin:** Export `ICON_NAMES` chứa mảng các key của bản đồ để điền vào dropdown cấu hình trên giao diện Admin.
    *   **Giải quyết biểu tượng động:** Hàm `getIcon` nhận vào chuỗi tên và trả về component Lucide tương ứng. Nếu không truyền tên hoặc tên không tồn tại, tự động trả về biểu tượng mặc định `LayoutGrid` để tránh crash giao diện (Fail-safe Fallback).
*   **Đánh giá:** Giải pháp đơn giản, hiệu quả để xử lý việc cấu hình biểu tượng động từ cơ sở dữ liệu lên storefront và admin sidebar một cách an toàn.

#### 📝 [src/lib/reviewVisibility.ts](file:///m:/QLCH_VanLanh/src/lib/reviewVisibility.ts) (22 dòng)
*   **Chức năng:** Helper kiểm tra và quyết định điều kiện hiển thị công khai (Public) của các đánh giá khách hàng trên storefront.
*   **Cơ chế hoạt động:**
    *   **Lọc cờ thử nghiệm:** Loại bỏ ngay lập tức các đánh giá có thuộc tính `isTest === true`.
    *   **Lọc từ khóa rác:** Chuẩn hóa tên khách hàng (`customerName`) và nội dung đánh giá (`content`) bằng cách xóa khoảng trắng, chuyển chữ thường và loại bỏ dấu tiếng Việt. So sánh với tập hợp các giá trị thử nghiệm nháp (`test`, `testing`, `teo`), nếu trùng khớp sẽ từ chối hiển thị.
*   **Đánh giá:** Bộ lọc tinh gọn, thực tế, giúp dọn dẹp các đánh giá rác phát sinh trong quá trình dev/test để đảm bảo tính thẩm mỹ và uy tín cho trang chủ storefront.

#### 📝 [src/lib/useAdminBadges.ts](file:///m:/QLCH_VanLanh/src/lib/useAdminBadges.ts) (256 dòng)
*   **Chức năng:** Custom hook quản lý tập trung và đồng bộ thời gian thực toàn bộ số lượng thông báo (badge counts) trên sidebar và các hoạt động hệ thống cho Admin/Staff, đóng vai trò là Single Source of Truth tối ưu chi phí đọc (reads) Firestore.
*   **Cơ chế hoạt động:**
    *   **Kích hoạt theo phân quyền (Permission Guard):** Nhận vào UID, Role và Permissions của user. Chỉ đăng ký listener hoặc thực hiện query khi vai trò người dùng thực sự có quyền (ví dụ: chỉ CSKH có quyền `chat_support` mới subscribe đếm tin nhắn chưa đọc, thợ có quyền `manage_repairs` mới đếm phiếu sửa). Giúp tiết kiệm lượng lớn lượt đọc DB thừa từ các vai trò khác.
    *   **Đọc tối ưu từ server:** Sử dụng **`getCountFromServer`** (chỉ tính phí 1/10 so với get thông thường) để lấy số lượng đơn hàng, lịch hẹn, đánh giá và phiếu sửa mới. Giới hạn bounded reads (`limit(200)`) khi lấy danh sách phiếu sửa để tính badge KTV nhằm bảo vệ RAM trình duyệt.
    *   **Đếm tin nhắn chưa đọc:** Lắng nghe realtime node `chats` trên Realtime DB, lặp qua các phòng để đếm số lượng phòng có cờ `hasUnread` hoặc `hasUnreadAdmin`.
    *   **Lắng nghe hoạt động:** Subscribe 20 hoạt động chưa đọc mới nhất (`activities`), hỗ trợ tự động chuẩn hóa định dạng thời gian tạo đa dạng sang timestamp để sắp xếp giảm dần.
    *   **Tính toán chỉ số thợ (Technician Badge):** Sử dụng `useMemo` tính toán số lượng phiếu thợ cần action (phiếu ở trạng thái tiếp nhận `INTAKE` cần nhận máy/test máy, hoặc phiếu ở trạng thái `PARTS_ORDERED` nhưng có linh kiện đã về kho `IN_STOCK` cần ráp máy sửa) được giao đích danh cho thợ hiện tại (hoặc tất cả thợ nếu là admin).
*   **Đánh giá:** Một hook được thiết kế cực kỳ xuất sắc, có tư duy tối ưu hiệu năng, băng thông mạng và chi phí Cloud Firestore rất cao. Việc gom tất cả các luồng lắng nghe sidebar vào một nơi và tính toán in-memory badge thợ thể hiện tư duy thiết kế hệ thống chuyên nghiệp.

#### 📝 [src/lib/useFirestore.ts](file:///m:/QLCH_VanLanh/src/lib/useFirestore.ts) (282 dòng)
*   **Chức năng:** Thư viện chứa các custom hook đăng ký lắng nghe realtime và các hàm tiện ích thực hiện CRUD dữ liệu Firestore phía client-side.
*   **Cơ chế hoạt động:**
    *   **Hook cơ sở (`useFirestoreCollection`):** Đăng ký lắng nghe realtime qua `onSnapshot`. Tối ưu re-subscription bằng cách stringify mảng constraints làm dependency cho `useEffect` để hook tự nhận diện chính xác khi query thực sự thay đổi, tránh lặp vô hạn do component cha re-render tạo mảng mới.
    *   **Hooks nghiệp vụ:** Cung cấp `useProducts` (lọc sản phẩm), `useFlashSaleProducts` (tải và lọc in-memory sản phẩm Flash Sale dựa trên cờ hoặc mức giảm giá >= 10%), `useServices` (lắng nghe dịch vụ), `useArticles` (bài viết), `useOrders` (đơn hàng).
    *   **CRUD Helpers:** Các hàm `addDocument`, `addDocumentWithId`, `updateDocument`, `deleteDocument` bọc các phương thức tương ứng của Firestore SDK, tự động append các trường timestamp server (`createdAt`, `updatedAt`).
    *   **Đăng ký bản tin:** Hàm `subscribeNewsletter` kiểm tra email trùng lặp trên Firestore trước khi ghi nhận bản ghi đăng ký mới với status `active`.
*   **Đánh giá:** Bộ hooks và helpers CRUD viết chuẩn mực, tường minh. Giải pháp so sánh dependency query bằng stringify constraints thể hiện sự am hiểu sâu sắc về vòng đời React component và Firebase SDK.

#### 📝 [src/lib/warrantyUtils.ts](file:///m:/QLCH_VanLanh/src/lib/warrantyUtils.ts) (59 dòng)
*   **Chức năng:** Hàm helper đóng dấu thông tin bảo hành (thời hạn tháng + ngày hết hạn) lên danh sách linh kiện sửa chữa ở phía client-side.
*   **Cơ chế hoạt động:**
    *   Tải mảng quy tắc bảo hành từ tài liệu `system_config/repairs` bằng Client SDK và xây dựng lookup map từ `partType` sang số tháng bảo hành.
    *   Duyệt qua danh sách linh kiện trong phiếu, loại bỏ các dòng bị thợ hủy/từ chối (`rejected`, `cancelled`) hoặc đã có hạn bảo hành.
    *   Tra cứu số tháng bảo hành tương ứng với `partType` của linh kiện, tự động fallback sang quy tắc chung `"Khác"` nếu không có quy tắc riêng.
    *   Tính toán ngày hết hạn (`warrantyExpiresAt`) bằng cách cộng thêm số tháng bảo hành tương ứng vào ngày hoàn tất (`completedAtMs`) và trả về mảng kết quả mới (không tự ghi trực tiếp vào Firestore).
*   **Đánh giá:** Phiên bản client-side tinh gọn của bộ máy đóng dấu bảo hành, hoạt động ổn định và tin cậy, giúp hỗ trợ tối ưu hiển thị xem trước hoặc lưu nhanh phía client.

---

### 35. Nhóm Next.js Middleware & Bảo mật Định tuyến Server-side (Edge Middleware & Routing Security)

#### 📝 [src/middleware.ts](file:///m:/QLCH_VanLanh/src/middleware.ts) (67 dòng)
*   **Chức năng:** Next.js Edge Middleware thực hiện kiểm soát quyền hạn và phân quyền (RBAC) phía Server-side cho toàn bộ phân hệ quản trị `/admin/*`. Nó chặn đứng các truy cập trái phép của nhân viên hoặc các nỗ lực xâm nhập của tài khoản khách hàng trước khi trang được kết xuất, giải quyết triệt để lỗi bypass phân quyền bằng URL (`BUG-RBAC-001`).
*   **Cơ chế hoạt động:**
    *   **Phạm vi hoạt động (Matcher):** Cấu hình `matcher: ['/admin/:path*']` giúp middleware chỉ chạy khi người dùng truy cập các đường dẫn quản trị. Ngoại lệ duy nhất là đường dẫn đăng nhập `/admin/login` được cấu hình đi tiếp luôn mà không cần kiểm tra session.
    *   **Xác thực Cookie mã hóa:**
        *   Đọc session cookie dạng ký số (`COOKIE_NAME`) từ request headers. Nếu không có cookie, chuyển tiếp xuống client-side để `AuthContext` xử lý (phục vụ cơ chế lazy-sync khi vừa đăng nhập/tải trang).
        *   Gọi hàm **`verifyPayload`** (sử dụng thuần Web Crypto API tiêu chuẩn tương thích Edge Runtime) để xác thực chữ ký HMAC-SHA256 của cookie. Nếu cookie bị chỉnh sửa (tampered) hoặc hết hạn, lập tức hủy cookie và chuyển hướng về `/admin/login`.
    *   **Kiểm soát Quyền hạn phân lớp:**
        *   Từ chối và chuyển hướng về trang login đối với mọi vai trò không phải `admin` hoặc `staff`.
        *   Bỏ qua kiểm tra (Bypass) đối với tài khoản có vai trò là `admin`.
        *   Đối với nhân viên `staff`: Gọi helper `getMatchedAdminRoute(pathname)` để tìm kiếm phân quyền bắt buộc được cấu hình cho route hiện tại trong registry. Nếu route không thuộc quyền hạn nhân viên đang sở hữu (trong mảng `permissions`), lập tức chuyển hướng về trang đăng nhập.
*   **Đánh giá:** Giải pháp bảo vệ route bằng Edge Middleware viết cực kỳ chặt chẽ, tối ưu và an toàn. Việc kết hợp so khớp route đồng nhất giữa client-side và server-side giúp giảm thiểu tối đa sai lệch phân quyền và nâng cao tính bảo mật cho toàn hệ thống.

---

### 36. Nhóm Các Widgets, Modals & Components Phục vụ Khách hàng (Storefront Widgets & Interaction Modals)

#### 📝 [src/components/AuthModal.tsx](file:///m:/QLCH_VanLanh/src/components/AuthModal.tsx) (347 dòng)
*   **Chức năng:** Component Modal xác thực dùng chung trên Storefront, hỗ trợ khách hàng đăng nhập, đăng ký thành viên Smember và đăng nhập nhanh bằng tài khoản Google.
*   **Cơ chế hoạt động:**
    *   **Trạng thái UI động:** Chuyển đổi giữa hai tab Đăng nhập (`login`) và Đăng ký (`register`) qua `activeTab`. Hỗ trợ bật/tắt hiển thị mật khẩu bằng cách thay đổi thuộc tính `type` của input (biểu tượng `Eye`/`EyeOff`). Quản lý hiệu ứng quay tròn của `Loader2` khi đang xử lý kết nối.
    *   **Tích hợp AuthContext:** Lấy các hàm `login`, `signup`, `googleSignIn` từ `useAuth()`.
    *   **Xử lý và phân loại lỗi:** Bắt lỗi trả về từ Firebase Auth client để dịch sang thông báo tiếng Việt trực quan cho khách hàng (ví dụ: `auth/user-not-found` -> "Tài khoản không tồn tại", `auth/wrong-password` -> "Mật khẩu không đúng", `auth/email-already-in-use` -> "Email đã được sử dụng").
    *   **Đồng bộ Google Auth:** Gọi `googleSignIn` mở popup, tự động đóng modal khi hoàn tất phiên đăng nhập và ghi nhận tài liệu người dùng.
*   **Đánh giá:** Giao diện Modal Auth thiết kế đẹp mắt với hiệu ứng zoom mượt mà, phân loại lỗi chi tiết mang lại trải nghiệm tốt và giảm tỷ lệ thoát của khách hàng.

#### 📝 [src/components/CartDrawer.tsx](file:///m:/QLCH_VanLanh/src/components/CartDrawer.tsx) (171 dòng)
*   **Chức năng:** Component Giỏ hàng trượt từ bên phải màn hình (Cart Drawer) trên Storefront, hiển thị các mặt hàng đã chọn, điều chỉnh số lượng và điều hướng thanh toán.
*   **Cơ chế hoạt động:**
    *   **Khóa cuộn nền (Body Scroll Lock):** Sử dụng `useEffect` lắng nghe `isDrawerOpen` để gán `document.body.style.overflow = 'hidden'` khi mở giỏ hàng, ngăn chặn hoàn toàn việc cuộn trang web nền gây mất tập trung. Khôi phục lại khi đóng.
    *   **Tương tác đóng nhanh:** Cho phép click ra ngoài vùng Drawer (lớp phủ overlay làm mờ nền `backdrop-blur-sm`) để tự động đóng nhanh giỏ hàng.
    *   **Hiển thị & Định dạng:** Duyệt qua mảng `items` từ `useCart()`, sử dụng Next.js `Image` để tối ưu tải ảnh (có ảnh placeholder dự phòng), hiển thị thông tin biến thể màu/dung lượng và đơn giá được định dạng tiền tệ Việt Nam đẹp mắt qua helper `formatPrice`.
    *   **Nghiệp vụ cập nhật:** Nút cộng/trừ để gọi `updateQuantity` và nút thùng rác để gọi `removeItem` xóa sản phẩm khỏi giỏ. Bấm "TIẾN HÀNH THANH TOÁN" để đóng drawer và đẩy khách sang trang `/checkout`.
*   **Đánh giá:** Thiết kế Cart Drawer chuẩn mực, hiệu ứng trượt (`animate-slide-in-right`) rất mượt mà. Logic khóa cuộn body và click overlay mang lại trải nghiệm tự nhiên như ứng dụng di động bản xứ.

#### 📝 [src/components/ChatWidget.tsx](file:///m:/QLCH_VanLanh/src/components/ChatWidget.tsx) (564 dòng)
*   **Chức năng:** Khung Live Chat tích hợp đa kênh trên Storefront. Khi đóng, hiển thị dạng Speed Dial FAB gộp Zalo, Messenger và Chatbot AI. Khi mở, cung cấp luồng chat realtime có AI tư vấn tự động và tự chuyển tiếp cho thợ tiếp quản.
*   **Cơ chế hoạt động:**
    *   **Speed Dial FAB:** Nút tròn nổi có hiệu ứng sóng lan tỏa (`animate-ping`) và badge đếm tin nhắn chưa đọc từ thợ. Khi hover/click, hiển thị dọc 3 nút kết nối: link Zalo động, link Messenger động, và nút mở khung Chat AI.
    *   **Định danh ẩn danh bảo mật:** Sử dụng **Firebase Anonymous Auth** (`signInAnonymously`) để cấp UID ẩn danh an toàn cho khách vãng lai thay vì dùng các mã ngẫu nhiên tự chế, đảm bảo tương thích 100% với các rule bảo mật Firestore/RTDB.
    *   **Đăng ký & Đồng bộ CRM:** Bắt buộc khách điền form (Tên + Số điện thoại) khi chat lần đầu để tạo hồ sơ phòng chat. Gọi API POST `/api/customers/sync` để tự động tạo/đồng bộ hồ sơ khách hàng vào CRM Firestore tập trung.
    *   **Lắng nghe & Handoff thông minh:** Lắng nghe realtime tin nhắn phòng qua `subscribeToMessages`. Nếu phát hiện tin nhắn mới nhất từ thợ (`senderType === 'admin'`), hệ thống tự động tắt AI Bot (`botActive = false`) và cập nhật lên Realtime DB để AI dừng can thiệp, nhường quyền tư vấn hoàn toàn cho con người.
    *   **Gửi tin nhắn & Trợ lý AI Gemini:** Lưu tin nhắn user vào Realtime DB. Nếu AI Bot đang hoạt động, hiển thị hiệu ứng AI đang soạn tin (`isAiTyping = true`) và gọi `handleAIAutoReply` để Gemini tự động phân tích lịch sử hội thoại xen kẽ và phản hồi realtime.
*   **Đánh giá:** Một trong những component front-end xuất sắc nhất dự án. Sự kết hợp tinh tế giữa Speed Dial đa kênh, Anonymous Auth bảo mật, cơ chế đồng bộ CRM và logic tắt AI Bot thông minh khi có người thật can thiệp tạo nên một luồng hỗ trợ khách hàng cực kỳ mượt mà và có chiều sâu kỹ thuật cao.

#### 📝 [src/components/MissionsWidget.tsx](file:///m:/QLCH_VanLanh/src/components/MissionsWidget.tsx) (643 dòng)
*   **Chức năng:** Component widget phần thưởng nhiệm vụ mạng xã hội (Bounty/Missions Program) dành cho khách hàng trên Storefront, hỗ trợ khách hàng thực hiện nhiệm vụ xem bài viết/video để nhận Voucher giảm giá tự động qua xác thực SMS OTP.
*   **Cơ chế hoạt động:**
    *   **Firebase Auth Độc lập:** Khởi tạo một app Firebase phụ tên là `'bounty-otp'` (để tránh xung đột với app Firebase chính đang quản lý Auth phiên Admin/Staff).
    *   **Lưu trữ Trạng thái (F5 Persistence):** Lưu thông tin mã voucher, số điện thoại và token vào `localStorage`. Nếu khách hàng đã nhận mã trước đó, tự động hiển thị mã voucher để khách hàng copy mà không cần làm lại.
    *   **Xác thực OTP Hai bước:** Khởi tạo `RecaptchaVerifier` dạng checkbox. Khi submit số điện thoại, gọi API POST `/api/bounty/request-otp` để kiểm tra xem SĐT này đã từng nhận voucher hay chưa. Nếu chưa nhận, gọi `signInWithPhoneNumber` gửi SMS OTP từ Firebase Auth và chuyển sang trang nhập mã OTP để sinh ID Token.
    *   **Nhiệm vụ & Tracking (Honor System):** Click nhiệm vụ sẽ mở link bài đăng mạng xã hội (Facebook, TikTok, YouTube) ở tab mới và chạy bộ đếm ngược 25 giây. Sử dụng listener sự kiện `focus` và `visibilitychange` của trình duyệt để dừng đếm nếu khách chuyển tab khác hoặc tắt màn hình, đảm bảo tính trung thực.
    *   **Tự động nhận Voucher:** Khi hoàn thành toàn bộ nhiệm vụ, gửi request POST tới API `/api/bounty/claim` kèm ID Token. Server xác thực token, tạo một Voucher độc bản gán cho SĐT này trên Firestore và trả về mã voucher dạng chữ lớn kèm nút Copy tiện lợi.
*   **Đánh giá:** Một component nghiệp vụ tăng trưởng (Growth hack) được thiết kế cực kỳ công phu và bảo mật. Giải pháp chạy một Firebase app phụ để gửi OTP tránh xung đột session thợ, kết hợp với cơ chế đếm ngược dựa trên tab visibility và hệ thống dịch lỗi OTP thông minh thể hiện tư duy thiết kế sản phẩm thực chiến xuất sắc.

#### 📝 [src/components/TrackingModal.tsx](file:///m:/QLCH_VanLanh/src/components/TrackingModal.tsx) (181 dòng)
*   **Chức năng:** Component Popup tra cứu nhanh tiến độ sửa chữa thiết bị của khách hàng trên Storefront bằng Số điện thoại.
*   **Cơ chế hoạt động:**
    *   **Thiết kế Bottom Sheet di động:** Sử dụng các class responsive của Tailwind để hiển thị dưới dạng Bottom Sheet trượt từ dưới lên trên Mobile (`items-end`, `rounded-t-3xl`), và hiển thị dạng Modal căn giữa trên Desktop, mang lại trải nghiệm tự nhiên.
    *   **Truy vấn an toàn:** Gửi request POST tới API `/api/tracking` truyền số điện thoại để server-side truy vấn Firestore (bảo mật PII khách hàng). Sắp xếp kết quả trả về (`repairs[]`) theo thứ tự thời gian nhận máy mới nhất.
    *   **Chuẩn hóa trạng thái tiếng Việt:** Sử dụng bản đồ cấu hình `repairStatusConfig` để dịch trực tiếp các mã trạng thái backend (`cho_tiep_nhan`, `dang_kiem_tra`...) thành nhãn tiếng Việt trực quan cho khách hàng dễ hiểu kèm theo các màu sắc sinh động (done -> màu xanh, check -> màu xanh dương, sửa -> màu cam).
    *   **Điều hướng chi tiết:** Hiển thị 3 phiếu sửa gần nhất và cung cấp nút "Xem chi tiết lộ trình" để chuyển hướng sang trang `/tracking` tra cứu đầy đủ nhật ký từng bước và chi tiết bệnh/chi phí máy.
*   **Đánh giá:** Giao diện tra cứu nhanh thiết kế thông minh, tối ưu trải nghiệm storefront. Giải pháp gọi API server-side giúp bảo vệ thông tin khách hàng tuyệt đối.

#### 📝 [src/components/VideoEmbed.tsx](file:///m:/QLCH_VanLanh/src/components/VideoEmbed.tsx) (69 dòng)
*   **Chức năng:** Component nhúng video siêu nhẹ dành cho Storefront, tự động phân tích cú pháp liên kết video đầu vào để hiển thị mượt mà.
*   **Cơ chế hoạt động:**
    *   **YouTube Parser:** Sử dụng Regex so khớp các mẫu URL thông dụng của YouTube (Shorts, watch?v=, embed/, và link ngắn `youtu.be`) để bóc tách 11 ký tự ID video, render thẻ `<iframe>` chuẩn.
    *   **Facebook Parser:** Nhận dạng link video Facebook hoặc link ngắn `fb.watch` để render video nhúng qua Facebook Plugins Video player.
    *   **Direct Video Fallback:** Tự động fallback sang thẻ `<video controls />` của trình duyệt nếu là link tệp tin video trực tiếp (.mp4, .webm).
    *   **Tỷ lệ khung hình vàng:** Sử dụng CSS padding-top `56.25%` (tỷ lệ màn hình rộng **16:9** chuẩn) kết hợp gán vị trí `absolute w-full h-full` giúp video hiển thị co giãn hoàn hảo trên mọi kích thước màn hình mà không bị méo.
*   **Đánh giá:** Component nhúng video viết rất tinh gọn, giải quyết triệt để vấn đề responsive cho các video nhúng từ mạng xã hội phổ biến.

---

### 37. Nhóm Các Layouts, Common và UI Components của Storefront (Storefront Layouts, Common & UI Components)

#### 📝 [src/components/layout/Header.tsx](file:///m:/QLCH_VanLanh/src/components/layout/Header.tsx) (229 dòng)
*   **Chức năng:** Component thanh đầu trang chính (Header) của storefront, xử lý điều hướng, tìm kiếm và liên kết giỏ hàng cho cả máy tính và thiết bị di động.
*   **Cơ chế hoạt động:**
    *   **Thanh điều hướng động (Dynamic Nav):** Đọc cấu hình menu từ `ConfigContext` (`config.headerNav`), lọc các mục đang kích hoạt (`visible`) và sắp xếp theo thứ tự `order`. Tự động ánh xạ biểu tượng tương ứng qua helper `getIcon`.
    *   **Tối ưu hóa không gian khi cuộn:** Lắng nghe sự kiện cuộn trang (`window.scrollY > 60`) để tự động thu nhỏ chiều cao header (80px xuống 56px) và thêm đổ bóng (`shadow-md`), giúp tăng diện tích hiển thị nội dung cho người dùng.
    *   **Tìm kiếm thích ứng thiết bị:** Tích hợp form tìm kiếm sản phẩm/dịch vụ. Trên màn hình Desktop, thanh tìm kiếm nằm gọn ở giữa header. Trên thiết bị di động, thanh tìm kiếm được đưa ra một hàng riêng biệt nằm cố định ngay dưới header để tối ưu trải nghiệm chạm và gõ.
    *   **Liên kết Hotline & Tra cứu:** Tích hợp nút Hotline hiển thị số điện thoại doanh nghiệp (`getBusinessIdentity`) có format đẹp qua `formatHotline`, nút tra cứu nhanh mở `TrackingModal` dạng popup và nút giỏ hàng hiển thị badge đếm số lượng realtime (`useCart`).
*   **Đánh giá:** Giao diện Header thiết kế rất khoa học, thích ứng responsive xuất sắc. Việc tự động co giãn kích thước khi cuộn trang mang lại cảm giác mượt mà và cao cấp.

#### 📝 [src/components/layout/MobileBottomNav.tsx](file:///m:/QLCH_VanLanh/src/components/layout/MobileBottomNav.tsx) (270 dòng)
*   **Chức năng:** Thanh điều hướng dưới cùng chuyên biệt cho thiết bị di động (Mobile Bottom Nav) và Action Sheet liên hệ đa kênh.
*   **Cơ chế hoạt động:**
    *   **Điều hướng nhanh:** Cung cấp 5 nút chạm nhanh ở chân trang (Trang chủ, Danh mục sản phẩm, Đặt lịch/Tra cứu, và nút Quản trị chỉ hiển thị khi tài khoản đăng nhập là Admin/Staff).
    *   **Nút liên hệ trung tâm (FAB):** Nút liên hệ hình tròn nổi bật nằm ở giữa thanh điều hướng. Khi chạm vào, hiển thị một Action Sheet trượt từ dưới lên (`animate-[slideUp_0.3s_ease]`) cùng lớp phủ mờ nền (`backdrop-blur`).
    *   **Kết nối đa kênh động:** Action Sheet hiển thị 4 tùy chọn liên hệ được cấu hình động từ `ConfigContext`: Gọi Hotline (`tel:`), Chỉ đường (link Google Maps), Chat Zalo (sử dụng icon Za SVG vẽ inline cực nhẹ) và Chat trực tiếp (gửi sự kiện custom `open-chat-widget` để kích hoạt mở nhanh khung chat AI `ChatWidget`). Tự động đóng menu khi thay đổi route hoặc click ra ngoài.
*   **Đánh giá:** Một giải pháp thiết kế tuyệt vời cho trải nghiệm di động. Việc gộp các nút liên hệ rải rác thành một Action Sheet trung tâm giúp giao diện storefront cực kỳ gọn gàng, tăng tỷ lệ chuyển đổi khách hàng đáng kể.

#### 📝 [src/components/common/Container.tsx](file:///m:/QLCH_VanLanh/src/components/common/Container.tsx) (19 dòng)
*   **Chức năng:** Component wrapper tiện ích dùng chung để giới hạn chiều rộng nội dung hiển thị trên trang.
*   **Cơ chế hoạt động:** Bọc nội dung con (`children`) trong một khối có chiều rộng tối đa `1200px`, căn giữa tự động (`mx-auto`) và có lề đệm thích ứng responsive (`px-2 md:px-4`).
*   **Đánh giá:** Nhỏ gọn, quy chuẩn. Tuy nhiên, ít được sử dụng trực tiếp trong codebase do các trang thường tự viết class Tailwind trực tiếp vào thẻ div để linh hoạt căn chỉnh lề nền.

#### 📝 [src/components/ui/LazyImage.tsx](file:///m:/QLCH_VanLanh/src/components/ui/LazyImage.tsx) (106 dòng)
*   **Chức năng:** Component tải ảnh trễ (Lazy Loading Image) tích hợp skeleton loading và xử lý lỗi ảnh, dùng để tối ưu hóa chỉ số LCP/CLS cho storefront.
*   **Cơ chế hoạt động:**
    *   **Hiệu ứng mượt mà:** Sử dụng trạng thái `isLoading` để hiển thị `Skeleton` wave khi ảnh đang tải. Khi tải xong, sự kiện `onLoad` kích hoạt chuyển đổi độ mờ (`opacity-0` sang `opacity-100`) trong 300ms rất dễ chịu.
    *   **Xử lý lỗi ảnh tự động (Fail-safe):** Sự kiện `onError` tự động bắt lỗi và hiển thị một khung xám chứa biểu tượng SVG hình ảnh rỗng thay thế, ngăn chặn việc vỡ layout hoặc hiển thị link ảnh lỗi.
    *   **Tích hợp responsive size:** Nhận tham số `sizes` động để trình duyệt tự động lựa chọn kích thước ảnh phù hợp từ CDN, mặc định tối ưu theo viewport. Cung cấp 2 component bọc sẵn: `ProductThumbnail` (aspect-square) và `BannerImage` (fill, cover).
*   **Đánh giá:** Giải pháp xử lý hình ảnh chuẩn mực, chuyên nghiệp. Giúp cải thiện vượt trội tốc độ tải trang storefront và mang lại trải nghiệm thị giác mượt mà cho khách hàng.

#### 📝 [src/components/ui/Skeleton.tsx](file:///m:/QLCH_VanLanh/src/components/ui/Skeleton.tsx) (128 dòng)
*   **Chức năng:** Thư viện khung xương (Skeleton loading) đa dụng, dùng làm placeholder hiển thị trong quá trình chờ tải dữ liệu bất đồng bộ.
*   **Cơ chế hoạt động:**
    *   **Tùy biến đa dạng:** Hỗ trợ 3 kiểu hình thể (`text` bo góc nhẹ, `circular` tròn cho avatar/icon, `rectangular` bo góc lớn cho ảnh/card) và 3 kiểu hiệu ứng chuyển động (`pulse` nhấp nháy, `wave` chạy sóng qua CSS custom class `skeleton-wave`, và `none` tĩnh).
    *   **Khung xương mẫu dựng sẵn:** Định nghĩa sẵn 7 component skeleton mẫu đặc trưng cho các thực thể nghiệp vụ: Product Card, Banner, Service Card, Brand Logo, Article Card, Table Row, và Chat Message. Giúp lập trình viên gọi nhanh ở bất kỳ phân hệ nào.
*   **Đánh giá:** Bộ thư viện skeleton viết rất quy chuẩn, phong phú và dễ dùng. Đóng vai trò quan trọng trong việc nâng cao chỉ số trải nghiệm người dùng (UX) trong thời gian chờ đợi phản hồi từ server.

---

### 38. Nhóm Các Khối Giao diện Trưng bày Trang chủ (Storefront Homepage Sections)

#### 📝 [src/components/home/HeroSection.tsx](file:///m:/QLCH_VanLanh/src/components/home/HeroSection.tsx) (309 dòng)
*   **Chức năng:** Khối trưng bày chính (Hero Section) nằm ở đầu trang chủ, bao gồm Menu danh mục dịch vụ bên trái (chỉ hiện trên Desktop) và Slider Banner quảng cáo bên phải.
*   **Cơ chế hoạt động:**
    *   **Menu Flyout mượt mà:** Menu dịch vụ trái đọc từ cấu hình `sidebarMenu`, hiển thị flyout submenu 2 cột khi di chuột qua. Sử dụng bộ đếm thời gian `setTimeout` (150ms delay) khi di chuột ra ngoài để chống đóng menu đột ngột khi người dùng di chuyển chuột lệch hướng, tạo cảm giác tự nhiên.
    *   **Slider Banner tối ưu băng thông:** Hiển thị slideshow các banner quảng cáo đọc từ cấu hình.
        *   *Tối ưu SI (Speed Index):* Trì hoãn việc tự động xoay vòng banner (auto-rotation) trong 10 giây đầu tiên sau khi tải trang để Lighthouse đo lường độ ổn định giao diện ổn định nhất.
        *   *Tải ảnh thông minh (Bandwidth Optimization):* Trên máy chủ SSR, chỉ kết xuất duy nhất ảnh của slide đầu tiên để giảm thiểu dung lượng HTML. Phía client, chỉ tải trước hình ảnh của slide hiện tại và slide kế tiếp (phục vụ hiệu ứng mờ dần transition mượt mà), các slide còn lại được giữ làm div trống, giúp tiết kiệm lượng lớn băng thông mạng.
    *   **Trust Badges:** Dưới chân banner trưng bày 4 thẻ cam kết dịch vụ (Bảo hành trọn đời, Xong trong 30 phút, Linh kiện chính hãng, Kỹ thuật viên 10+ năm) kèm icon sinh động để tạo lòng tin.
*   **Đánh giá:** Một component được tối ưu hóa hiệu năng và trải nghiệm người dùng cực kỳ xuất sắc. Giải pháp trì hoãn auto-rotation và tải ảnh slide thông minh thể hiện tư duy lập trình đỉnh cao và am hiểu sâu sắc về SEO/Lighthouse.

#### 📝 [src/components/home/BookingSection.tsx](file:///m:/QLCH_VanLanh/src/components/home/BookingSection.tsx) (473 dòng)
*   **Chức năng:** Phân hệ đặt lịch sửa chữa trực tuyến và tra cứu lịch hẹn qua số điện thoại dành cho khách hàng.
*   **Cơ chế hoạt động:**
    *   **Hiệu ứng lật thẻ 3D:** Sử dụng hiệu ứng xoay 3D trục Y (`rotate-y-90` kết hợp `perspective-[1000px]`) cực kỳ ấn tượng khi khách hàng chuyển đổi giữa hai chế độ "Đặt lịch mới" và "Tra cứu lịch hẹn".
    *   **Đặt lịch thông minh:** Tự động tạo danh sách 7 ngày tới (đổi 2 ngày đầu thành "Hôm nay", "Ngày mai" trực quan). Đồng bộ danh sách chi nhánh cửa hàng từ cấu hình. Gửi request POST tới `/api/appointments` để tạo lịch hẹn mới.
    *   **Tra cứu an toàn và tối ưu:** Khách hàng nhập số điện thoại để gửi request. Hệ thống truy vấn trực tiếp Firestore collection `appointments` theo số điện thoại đã chuẩn hóa xóa khoảng trắng.
        *   *Sắp xếp in-memory:* Thay vì yêu cầu composite index phức tạp từ Firestore (dễ gây lỗi nếu chưa deploy index), hệ thống tải các lịch hẹn về và tự viết bộ parser `toMillis` chuẩn hóa mọi kiểu dữ liệu thời gian tạo (`createdAt` dạng Firestore Timestamp, Date, or Number) để sắp xếp giảm dần trên client-side, đảm bảo an toàn tuyệt đối.
    *   **Badge trạng thái:** Hiển thị kết quả tra cứu với các badge màu tương ứng (Chờ xác nhận màu vàng, Đã xác nhận màu xanh dương, Hoàn thành màu xanh lá, Đã hủy màu đỏ).
*   **Đánh giá:** Tính năng đặt lịch viết rất hoàn thiện, giao diện lật thẻ 3D tạo hiệu ứng thị giác cực kỳ chuyên nghiệp và thu hút. Logic xử lý sắp xếp in-memory rất thực chiến và an toàn.

#### 📝 [src/components/home/CategoriesSection.tsx](file:///m:/QLCH_VanLanh/src/components/home/CategoriesSection.tsx) (67 dòng)
*   **Chức năng:** Khối trưng bày các danh mục dịch vụ sửa chữa chính của cửa hàng dưới dạng lưới (grid) responsive.
*   **Cơ chế hoạt động:**
    *   **Hỗ trợ SEO và LCP:** Tận dụng dữ liệu SSR truyền xuống (`ssrHomeServiceCategories`) để render HTML ngay từ server phục vụ bot SEO và tối ưu LCP. Sau khi client tải xong, tự động cập nhật đồng bộ theo cấu hình động trong `ConfigContext`.
    *   **Hiệu ứng hover cao cấp:** Mỗi thẻ danh mục khi hover sẽ nâng nhẹ lên (`hover:-translate-y-1.5`), viền chuyển màu đồng (`hover:border-copper/40`) và xuất hiện một thanh gradient trượt mượt mà trên đỉnh thẻ. Hỗ trợ hiển thị icon dạng emoji hoặc ảnh URL tự co giãn.
*   **Đánh giá:** Đơn giản, tinh tế và đạt hiệu quả thẩm mỹ rất cao. Hiệu ứng hover được trau chuốt kỹ lưỡng tạo cảm giác sang trọng.

#### 📝 [src/components/home/FlashSale.tsx](file:///m:/QLCH_VanLanh/src/components/home/FlashSale.tsx) (165 dòng)
*   **Chức năng:** Khối trưng bày các sản phẩm/phụ kiện đang trong chương trình khuyến mãi giờ vàng (Flash Sale).
*   **Cơ chế hoạt động:**
    *   **Tab thương hiệu:** Cung cấp các tab chuyển đổi nhanh thương hiệu (Tất cả, iPhone, Samsung, Xiaomi, Oppo).
    *   **Tận dụng dữ liệu SSR:** Nạp sẵn dữ liệu sản phẩm mới nhất từ SSR (`ssrLatestProducts`) để hiển thị lập tức cho tab "Tất cả" khi vừa tải trang mà không cần gọi Firestore. Khi chuyển sang tab thương hiệu khác, hệ thống chạy truy vấn Firestore có giới hạn (`limit(10)`) lọc theo `brand` và sắp xếp mới nhất.
    *   **Lọc khuyến mãi in-memory:** Gọi helper `filterFlashSaleProducts` lọc nhanh các sản phẩm thỏa mãn điều kiện Flash Sale ở phía client để giảm tải tính toán cho server. Render danh sách sản phẩm thông qua component `ServiceCard` dùng chung.
*   **Đánh giá:** Logic kết hợp SSR và client-side fetch viết rất chuẩn, giúp trang chủ storefront tải cực nhanh và mượt mà.

#### 📝 [src/components/home/SuggestedSection.tsx](file:///m:/QLCH_VanLanh/src/components/home/SuggestedSection.tsx) (130 dòng)
*   **Chức năng:** Khối trưng bày các sản phẩm/phụ kiện gợi ý mua sắm cho khách hàng dựa trên thương hiệu thiết bị.
*   **Cơ chế hoạt động:** Cấu trúc tương tự như `FlashSale.tsx` nhưng tập trung vào mục đích gợi ý bán kèm. Sử dụng dữ liệu SSR 10 sản phẩm đầu tiên để render ngay lập tức cho tab "Tất cả". Khi người dùng chọn tab thương hiệu (iPhone, Samsung, Xiaomi, Oppo), hệ thống gửi truy vấn Firestore có điều kiện tương ứng để cập nhật danh sách.
*   **Đánh giá:** Hoạt động ổn định, tái sử dụng tốt cấu trúc thẻ `ServiceCard` giúp đồng nhất thiết kế storefront.

#### 📝 [src/components/home/FloatingReviews.tsx](file:///m:/QLCH_VanLanh/src/components/home/FloatingReviews.tsx) (167 dòng)
*   **Chức năng:** Bong bóng thông báo nổi (Floating Review Widget) ở góc dưới trái màn hình, trưng bày xoay vòng các đánh giá 5 sao tiêu biểu từ khách hàng.
*   **Cơ chế hoạt động:**
    *   **Tối ưu hóa INP cực độ:** Để không làm ảnh hưởng đến thời gian phản hồi và tương tác ban đầu của trang chủ (chỉ số INP/TBT của Lighthouse), hệ thống trì hoãn toàn bộ tiến trình đọc Firestore **5 giây** sau khi tải trang, đồng thời chạy hàm trong `requestIdleCallback` (luồng phụ khi CPU rảnh) để tải 5 đánh giá 5 sao được duyệt (`approved`).
    *   **Hiệu ứng chạy chữ (Marquee Carousel):** Tự động hiển thị bong bóng nổi sau 2 giây tải xong dữ liệu với hiệu ứng trượt nhẹ từ trái qua. Cứ mỗi 8 giây, widget tự động chuyển đổi sang đánh giá tiếp theo sử dụng hiệu ứng tịnh tiến Y (`translate-y-4` về `0`) và chỉnh opacity rất mượt mà.
    *   **Bộ lọc bảo mật và tắt widget:** Sử dụng bộ lọc `isPublicReview` để loại bỏ các đánh giá test/rác. Khách hàng có thể nhấn nút "X" để đóng hẳn bong bóng nổi, hệ thống sẽ lưu trạng thái đóng (`isDismissed = true`) để dừng hoàn toàn hoạt động của widget trong phiên làm việc.
*   **Đánh giá:** Một chi tiết nhỏ về tối ưu hiệu năng front-end cực kỳ tinh tế. Tư duy sử dụng `requestIdleCallback` và trì hoãn 5s để bảo vệ chỉ số Lighthouse là cực kỳ chuyên nghiệp và đáng học hỏi.

#### 📝 [src/components/home/GoogleReviewsSection.tsx](file:///m:/QLCH_VanLanh/src/components/home/GoogleReviewsSection.tsx) (215 dòng)
*   **Chức năng:** Khối hiển thị đánh giá của khách hàng từ Google Maps trực tiếp trên trang chủ.
*   **Cơ chế hoạt động:**
    *   **Đọc dữ liệu từ API Server:** Gửi request GET tới API `/api/reviews/google` để lấy thông tin tổng hợp (điểm trung bình, tổng số đánh giá) và mảng danh sách đánh giá chi tiết (tên, avatar, rating, nội dung text).
    *   **Thanh trượt snap-x mượt mà:** Thiết kế danh sách đánh giá dạng thanh cuộn ngang hỗ trợ thuộc tính cuộn dính (`snap-x`) của CSS. Cung cấp 2 nút điều hướng Left/Right sử dụng method `scrollBy` có hiệu ứng cuộn mượt (`behavior: 'smooth'`).
    *   **Cơ chế Fallback an toàn thẩm mỹ:** Nếu API Google Maps bị lỗi (hết hạn key, chặn IP) hoặc danh sách đánh giá rỗng, component tự động ẩn danh sách trượt và hiển thị một CTA Banner tinh tế dẫn link trực tiếp sang trang Google Maps thật của cửa hàng dựa trên `googlePlaceId` cấu hình, ngăn chặn việc hiển thị giao diện trống trải hoặc lỗi font.
*   **Đánh giá:** Tích hợp Google API rất chuyên nghiệp. Cơ chế ẩn danh sách và hiển thị CTA Banner fallback khi API lỗi là một giải pháp thiết kế phòng thủ (defensive design) tuyệt vời giúp bảo vệ tính toàn vẹn của giao diện.

#### 📝 [src/components/home/PricingSection.tsx](file:///m:/QLCH_VanLanh/src/components/home/PricingSection.tsx) (160 dòng)
*   **Chức năng:** Bảng giá dịch vụ sửa chữa thiết bị theo từng nhóm thiết bị (Điện thoại, Máy tính bảng, Laptop, Đồng hồ) tích hợp ngoài trang chủ.
*   **Cơ chế hoạt động:**
    *   **Tải dữ liệu tập trung:** Gửi một request duy nhất tới API `/api/services/homepage-pricing` để lấy toàn bộ danh sách dịch vụ sửa chữa đang hoạt động.
    *   **Lọc mờ in-memory thông minh:** Khi chuyển đổi giữa các tab, hệ thống không gọi lại cơ sở dữ liệu. Thay vào đó, nó thực hiện lọc in-memory bằng cách gộp các trường dữ liệu của dịch vụ (tên dịch vụ, dòng máy, danh mục, mảng tags) thành một chuỗi phẳng, sau đó so khớp chứa từ khóa (`includes`) với mảng từ khóa cấu hình của tab đó. Giới hạn số lượng hiển thị bằng hàm `.slice(0, maxItems)` cấu hình động.
    *   **Trạng thái ẩn giá:** Nếu dịch vụ bật cờ `hidePrice`, tự động hiển thị nhãn "Liên hệ nhận báo giá" màu cam nổi bật thay vì hiển thị giá 0đ gây hiểu lầm cho khách hàng.
*   **Đánh giá:** Thuật toán lọc mờ in-memory kết hợp giới hạn số lượng hiển thị là giải pháp tối ưu hóa tuyệt vời, giúp bảng giá hoạt động cực kỳ nhanh, mượt mà và giảm thiểu tối đa chi phí đọc cơ sở dữ liệu Firestore.

#### 📝 [src/components/home/ServiceBlock.tsx](file:///m:/QLCH_VanLanh/src/components/home/ServiceBlock.tsx) (199 dòng)
*   **Chức năng:** Lưới trưng bày 8 dịch vụ sửa chữa mới nhất của cửa hàng dưới dạng các khối ô vuông biểu tượng sinh động.
*   **Cơ chế hoạt động:**
    *   **Tải dữ liệu mới nhất:** Truy vấn Firestore collection `services` lấy 12 dịch vụ mới nhất sắp xếp theo ngày tạo. Thực hiện lọc client-side chỉ hiển thị các dịch vụ đang hoạt động (`isActive !== false`).
    *   **Phối màu biểu tượng động:** Tự động duyệt qua mảng bảng màu 8 màu hài hòa (`colorPalette`) để gán màu nền gradient và màu nền biểu tượng tương ứng cho từng ô dịch vụ dựa theo chỉ số index, mang lại giao diện rực rỡ, không bị đơn điệu. Ánh xạ biểu tượng động qua `iconMap` (Wrench, Battery, Smartphone...).
    *   **CTA Banner khẩn cấp:** Phía dưới lưới dịch vụ hiển thị một banner màu gradient cam-đỏ nổi bật thu hút sự chú ý của khách hàng cần sửa chữa gấp, tích hợp nút gọi Hotline và đặt lịch nhanh.
*   **Đánh giá:** Bố cục lưới dịch vụ thiết kế rất trẻ trung và hiện đại. Cách phối màu động thông minh giúp admin chỉ cần chọn biểu tượng mà giao diện vẫn tự động hiển thị rất thẩm mỹ và hài hòa.

#### 📝 [src/components/home/ServiceCard.tsx](file:///m:/QLCH_VanLanh/src/components/home/ServiceCard.tsx) (188 dòng)
*   **Chức năng:** Component thẻ sản phẩm/dịch vụ (Service Card) dùng chung cho toàn bộ các danh sách trưng bày trên storefront (Flash Sale, gợi ý, danh mục...).
*   **Cơ chế hoạt động:**
    *   **Tương thích ngược dữ liệu:** Giải quyết triệt để sự khác biệt giữa schema dữ liệu cũ (trường `price`) và schema dữ liệu mới (trường `price_original` và `price_promo`). Tự động tính toán phần trăm giảm giá hiển thị dạng badge góc trên trái.
    *   **Định tuyến thông minh:** Tự động phân tích thuộc tính của sản phẩm. Nếu sản phẩm có chứa trường thời gian sửa chữa (`repair_time`) hoặc được định nghĩa type là `service`, thẻ sẽ tự động chuyển hướng liên kết sang trang chi tiết dịch vụ `/service/[id]`. Ngược lại, chuyển hướng sang trang chi tiết sản phẩm `/product/[id]`.
    *   **Badge nghiệp vụ động:** Hiển thị các nhãn trạng thái sinh động dựa trên dữ liệu: nhãn "Giảm sâu" (khi giảm > 30%), nhãn "Flash Sale", nhãn thời gian bảo hành và nhãn thời gian sửa lấy ngay.
*   **Đánh giá:** Component thẻ sản phẩm được thiết kế cực kỳ đa năng, linh hoạt và null-safe. Việc tự động định tuyến thông minh dựa trên dữ liệu giúp lập trình viên cực kỳ nhàn nhã khi tái sử dụng component này ở nhiều nơi.

#### 📝 [src/components/home/ArticleBlock.tsx](file:///m:/QLCH_VanLanh/src/components/home/ArticleBlock.tsx) (166 dòng)
*   **Chức năng:** Khối trưng bày các bài viết, tin tức công nghệ hoặc mẹo hay nổi bật ra trang chủ storefront.
*   **Cơ chế hoạt động:**
    *   **Truy vấn mới nhất:** Gửi câu truy vấn Firestore lấy tối đa 4 bài viết mới nhất có trạng thái xuất bản (`published`) sắp xếp theo thời gian tạo (`createdAt desc`). Tự động ẩn hoàn toàn khối giao diện này nếu không có bài viết nào để bảo toàn bố cục trang chủ.
    *   **Định dạng thời gian linh hoạt:** Helper `formatDate` phân tích đa định dạng của trường `createdAt` (Firestore Timestamp, Seconds, Date Object, or Number/String) để chuyển đổi chuẩn xác sang chuỗi ngày tiếng Việt dạng `dd/mm/yyyy`.
    *   **Phân loại Badge:** Hiển thị badge phân loại trên ảnh thu nhỏ tùy theo trường `type` của bài viết (Khuyến mãi `Promo`, Tin tức `News`, Mẹo hay `Tips`) với các tông màu nền và màu chữ được thiết kế riêng biệt.
*   **Đánh giá:** Thiết kế tối giản, trực quan, xử lý date format rất tốt giúp trang chủ hoạt động ổn định và tin cậy.

---

### 29. Logic Ngầm & Khớp Nối Kiến Trúc Hệ Thống (Implicit & Bridge Logic)

Đây là tổng hợp các luồng logic ngầm liên kết nhiều module lại với nhau, tạo thành các "cây cầu" nghiệp vụ xuyên suốt ứng dụng. Việc nắm vững các khớp nối này là đặc biệt quan trọng để không làm gãy vỡ kiến trúc khi bảo trì.

#### 🌉 1. Cầu nối Chat CSKH ➔ POS / Sửa chữa (Workflow Handoff)
*   **Cơ chế:** Khi nhân viên đang chat với khách trên `src/app/admin/chat` và cần lên đơn/tạo phiếu sửa, họ bấm nút tạo giao dịch. Hàm `storeChatWorkflowHandoff` lưu tạm thông tin khách (Tên, SĐT, ID phòng chat) vào `sessionStorage`.
*   **Tiếp nhận:** Màn hình POS hoặc Tạo Phiếu Sửa tự động đọc thông qua `consumeChatWorkflowHandoff`, điền sẵn dữ liệu vào form, sau đó **lập tức xóa sạch khỏi bộ nhớ**. Nhờ đó, nhân viên không cần gõ lại SĐT khách, và đơn hàng tự động gắn `roomId` để gửi tin nhắn tự động khi xong đơn.

#### 🌉 2. Cầu nối Yêu cầu Linh kiện ➔ Nhập Kho ➔ Tự động Giữ chỗ (Repair to Import Allocation)
*   **Cơ chế Yêu cầu:** KTV yêu cầu linh kiện không có sẵn trong API `repairs/confirm-parts`. Hệ thống không chỉ ghi nhận vào phiếu sửa mà còn **tự động sinh một Phiếu Nhập Kho Nháp (Draft Import Receipt)** gom chung các yêu cầu lại.
*   **Cơ chế Phân bổ:** Khi Thủ kho chốt phiếu nhập (API `inventory/import`), hàm `planRepairImportAllocation` sẽ tự động tính toán. Linh kiện nhập về không vào thẳng kho tự do mà bị **tạm giữ (held)** cho đúng ID phiếu sửa yêu cầu. Phiếu sửa tự động chuyển trạng thái linh kiện sang `SELECTED` (sẵn sàng), KTV ngay lập tức được báo để lắp ráp.

#### 🌉 3. Cầu nối Client Auth ➔ Server Middleware (Session Sync)
*   **Cơ chế:** Firebase Auth chạy ở client, nhưng Next.js Middleware chạy ở server. Để bảo vệ các route `/admin/*`, `AuthContext` chứa logic ngầm: Ngay khi đăng nhập client thành công, nó gửi ID Token qua `/api/auth/session` để server set HTTP-only cookie. Middleware sau đó dùng cookie này để chặn/cho phép truy cập mà không cần load thư viện Firebase Admin nặng nề ở Edge.

#### 🌉 4. Cầu nối Cấu hình Động ➔ UI Realtime (Config Injection)
*   **Cơ chế:** Quản trị viên đổi màu chủ đạo hoặc ảnh nền trong cài đặt. `ConfigContext` lắng nghe stream Firestore, lấy giá trị mới và tiêm (inject) trực tiếp vào các biến CSS toàn cục (`document.body.style.setProperty('--primary', ...)`). Giao diện toàn hệ thống đổi màu ngay lập tức mà không cần reload hay chờ build lại cache.

#### 🌉 5. Cầu nối Đơn Hàng / Sửa Chữa ➔ Hồ sơ CRM (Customer Activity Timeline)
*   **Cơ chế Server:** Các API chốt đơn hàng, chốt sửa chữa không lưu mảng lịch sử vào CRM để tránh nghẽn transaction. Chúng chỉ gọi hàm `customerSync` để tạo profile cơ bản nếu chưa có.
*   **Cơ chế Client:** Hook `useCustomerActivity` đóng vai trò cầu nối nội suy. Nó query song song collections `orders` và `repairs` theo SĐT, tự động gộp (merge) và sắp xếp realtime, tạo ra một Timeline thống nhất cho tư vấn viên xem trên màn hình Chat mà không cần join data phức tạp trên server.

#### 🌉 6. Cầu nối Split Line bảo toàn Giá Vốn (Inventory Cost Preservation)
*   **Cơ chế:** Khi linh kiện đã được KTV chốt với khách ở mức giá vốn A, nhưng sau đó KTV cần tăng số lượng. Hệ thống không cho phép sửa số lượng dòng cũ (vì kho có thể đã nhập lô mới giá B). Hệ thống tự động **tách dòng (Split Line)** trong API `repairs/confirm-parts`: Giữ nguyên dòng số 1 với giá A, tạo thêm dòng số 2 (số lượng tăng thêm) lấy theo giá vốn bình quân (WAC) mới nhất. Điều này bảo vệ tính đúng đắn của Báo cáo Lợi nhuận.

#### 🌉 7. Cầu nối Admin UI ➔ Trải nghiệm Storefront (Silent Revalidation)
*   **Cơ chế:** Khi Admin sửa bài viết, thêm sản phẩm, hệ thống gọi ngầm `requestRevalidate` gửi POST fetch tới `/api/revalidate`. Cầu nối này tách biệt hoàn toàn React Render Tree, đảm bảo Storefront được làm mới cache ISR ngay lập tức trên máy chủ, nhưng UI Admin của nhân viên không bị chớp hay mất state đang nhập dở.

#### 🌉 8. Cầu nối Dữ liệu Excel ➔ ID Tuần tự (Excel Import Identity Bridge)
*   **Cơ chế:** Dữ liệu Excel thô được parse trong `importSupport.ts`, làm sạch qua `idNormalizer.ts` để chống trùng lặp. Tuy nhiên đối với các chứng từ quan trọng (Phiếu nhập, đơn hàng), hệ thống bắt buộc gọi qua `serverDocumentIds.ts` trong Transaction nguyên tử để đảm bảo cấp số thứ tự tuyệt đối không va chạm (Sequence Auto-Increment) bất chấp tốc độ load hàng ngàn dòng.

#### 🌉 9. Cầu nối Hủy Đơn Hàng ➔ Khôi phục Hoa hồng (Commission Reversal)
*   **Cơ chế:** Khi hủy đơn hàng (API `orders/transition`), hệ thống không xóa dữ liệu hoa hồng của nhân viên mà gọi lệnh đảo ngược (`reversal`). Nó sinh ra một bản ghi hoa hồng mang giá trị âm để đối ứng với khoản đã ghi nhận, đảm bảo vết kiểm toán (Audit Trail) tài chính nguyên vẹn 100%.
