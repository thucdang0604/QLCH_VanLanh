# Walkthrough: Tổng Kết Toàn Bộ Dự Án QLCH_VanLanh

Dự án **QLCH_VanLanh** đã hoàn thành chặng đường tối ưu hóa toàn diện với tỷ lệ hoàn thành đạt **98%**. Từ một hệ thống quản lý phân tán và có nhiều lỗ hổng hiệu năng, dự án đã được chuyển đổi thành một Web App hiện đại chạy trên Next.js App Router kết hợp cơ sở dữ liệu Firebase (Firestore, Realtime Database) mạnh mẽ, an toàn và tối ưu chi phí.

---

## 1. Bản đồ Kiến trúc & Những Cột mốc Quan trọng

Dưới đây là sơ đồ Mermaid tổng quan luồng vận hành nghiệp vụ liên thông từ đa kênh (Omnichannel) đến trung tâm POS, kho bãi (FIFO) và báo cáo doanh thu:

```mermaid
graph TD
    %% Omnichannel & Front-end
    A["Khách hàng (Storefront / Web Chat)"] -->|1. Chat & Đặt hẹn| B["Live Chat Omnichannel (FB/Zalo webhook + RTDB)"]
    A -->|2. Tra cứu & Nhận Voucher| C["Missions Widget (Bounty OTP + reCAPTCHA v2)"]
    
    %% CRM & Management
    B -->|3. Handoff PII (sessionStorage)| D["Hệ thống POS Trung tâm"]
    C -->|4. Nhận Voucher cá nhân| D
    
    %% POS Operations
    D -->|5. Quét mã nhanh| E["Authoritative Registry (product_code_registry)"]
    D -->|6. Checkout thanh toán| F["API POS Checkout (/api/pos/checkout)"]
    
    %% Backend & Database Transaction
    subgraph "Server-Side Transaction (Read-Before-Write)"
        F -->|7. Trừ kho nguyên tử| G["Inventory FIFO Deduction (inventory_lots)"]
        F -->|8. Cập nhật nợ & tier| H["Customer CRM Sync (customers/{phone})"]
        F -->|9. Tính toán hoa hồng| I["Commission Stacking Engine"]
        F -->|10. Ghi nhận doanh thu| J["Daily Aggregates (revenue_daily_aggregates)"]
    end
    
    %% Reports
    J -->|11. Tải báo cáo tức thì| K["Trang Quản lý Doanh thu (Aggregate-Only)"]
```

---

## 2. Các Thành Tựu Công Nghệ & Nghiệp Vụ Cốt Lõi

### A. Quản lý Kho & Xuất Nhập theo Lô (FIFO Batch Tracking)
*   **Giải pháp:** Tích hợp thành công cơ chế trừ tồn kho theo nguyên tắc **FIFO (First In - First Out)** ở cấp độ Backend API.
*   **Vận hành:** Mỗi khi hoàn tất nhập kho, hệ thống tự động sinh thông tin Lô (`inventory_lots`). Khi bán hàng qua POS hoặc hoàn tất phiếu sửa chữa, Backend tự động phân bổ và khấu trừ số lượng từ các lô cũ nhất sang lô mới nhất trong cùng một Firestore Transaction.
*   **Hiển thị:** Nhân viên kho và KTV dễ dàng tra cứu nguồn gốc sản phẩm theo Mã Lô (`lotCode`), hỗ trợ đắc lực cho hoạt động bảo hành.

### B. Đồng bộ Hóa Khách Hàng CRM v2 & Công Nợ Tập Trung
*   **Giải pháp:** Quy hoạch toàn bộ thông tin khách hàng từ đa kênh (Web chat, đặt hẹn, POS, sửa chữa) về một nguồn duy nhất tại `customers/{phone}` với định dạng số điện thoại chuẩn hóa quốc gia (`normalizeVietnamPhone`).
*   **Tính năng:**
    *   Tự động cập nhật tổng chi tiêu (`totalSpent`), số đơn hàng (`totalOrders`), và công nợ (`totalDebt`) thông qua giao dịch server-side.
    *   Phân hạng thành viên (Tiers: Đồng, Bạc, Vàng, Bạch Kim) tính toán động theo chi tiêu lũy kế của năm hiện tại.
    *   Quản lý lịch sử công nợ chi tiết qua `customer_ledger` và thu nợ FIFO.

### C. POS Centralization (Thanh Toán Tập Trung & Quét Tem QR)
*   **Giải pháp:** Hợp nhất toàn bộ luồng thanh toán (bán lẻ, sửa chữa, thu nợ) về trung tâm POS.
*   **Tính năng:**
    *   Hỗ trợ quét camera (sử dụng `BarcodeDetector` native) và máy quét barcode phần cứng.
    *   Tích hợp bộ in tem QR/Barcode tùy chỉnh linh hoạt theo kích thước giấy thực tế (30x20mm, 40x20mm...).
    *   Công thức tính toán giá sửa chữa rõ ràng: tách biệt Tiền Công (Labor Cost) và Tiền Linh Kiện (Parts Cost), ngăn ngừa triệt để lỗi hóa đơn 0đ.
    *   Tích hợp cổng VietQR động tự tạo mã QR chuyển khoản chính xác đến từng đồng kèm nội dung giao dịch tự động.

### D. Hệ thống Bảo mật & Phân Quyền Vai Trò Chặt Chẽ
*   **Giải pháp:** Siết chặt an toàn thông tin theo tiêu chuẩn Codex.
*   **Biện pháp:**
    *   Xây dựng Middleware bảo vệ các trang Admin bằng JWT Session Cookie server-side, ngăn chặn bypass URL.
    *   Định cấu hình Firestore và Realtime Database Rules cực kỳ nghiêm ngặt: chỉ cho phép nhân viên có vai trò phù hợp đọc/ghi dữ liệu, ẩn thông tin PII (SĐT, tên khách) khỏi các truy vấn công cộng.
    *   Lưu trữ các token tích hợp mạng xã hội (Facebook, Zalo) bảo mật tại server-side, giao tiếp outbound qua header được kiểm soát.

---

## 3. Kế Hoạch Vận Hành & Bảo Trì Dài Hạn

1.  **Theo dõi Firebase Quotas:** Hệ thống chạy chế độ **Doanh thu Aggregate-Only** và **POS Registry One-Read** giúp số lượng đọc/ghi Firestore luôn nằm trong hạn mức miễn phí (hoặc chi phí cực thấp, ước tính <$3/tháng cho 5.000 khách hàng).
2.  **Smoke Test Định Kỳ:** Chạy smoke test các luồng Checkout, POS in tem QR, và handover sửa chữa sau mỗi đợt nâng cấp gói thư viện Next.js/Firebase.
3.  **Giám sát KTV Assignment:** Theo dõi audit logs của việc chuyển giao KTV sửa chữa để tối ưu hóa năng suất lao động và phân chia hoa hồng công bằng.
