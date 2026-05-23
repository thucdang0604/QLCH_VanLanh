# System Reference Table - Văn Lành Service

Bảng tổng hợp chi tiết toàn bộ các thành phần, tính năng và logic của hệ thống.

## 1. Phân hệ Quản lý Sửa chữa (Repair Module)

| Thành phần | Logic / Tính năng | Mô tả chi tiết | Dữ liệu liên quan |
| :--- | :--- | :--- | :--- |
| **Workflow Engine** | Dynamic Status | Trạng thái phiếu không cố định, render từ cấu hình. | `system_config/repairs` |
| **Feature Gating** | hasFeature() | Chặn/Mở tính năng (Checklist, Payment) theo trạng thái. | `workflowFeatures.ts` |
| **Inventory Sync** | Double-Entry | Chuyển đổi giữa `stock` và `held` khi chọn/hủy linh kiện. | `products` collection |
| **Draft Receipt** | Auto-Gen | Tự động tạo phiếu nhập nháp khi thiếu linh kiện. | `import_receipts` |
| **Payment Gate** | Finalization | Bắt buộc xác nhận tiền, giảm giá, phí phát sinh khi đóng phiếu. | `repair_tickets.payment` |
| **Status Timeline** | KPI Tracking | Tự động tính thời gian (phút) cho từng công đoạn sửa chữa. | `statusTimeline[]` |
| **Media Proof** | Media Upload | Lưu ảnh/video trước và sau khi sửa để chống tranh cãi. | `preRepairMedia`, `postRepairMedia` |
| **Warranty Stamp** | Auto-Expiry | Tự động tính ngày hết hạn linh kiện khi phiếu "Done". | `warrantyUtils.ts` |
| **Warranty Link** | Claim Logic | Tạo phiếu bảo hành liên kết với phiếu gốc, ngăn claim quá hạn. | `warrantyClaim` object |

## 2. Phân hệ Kho & Sản phẩm (Inventory & Products)

| Thành phần | Logic / Tính năng | Mô tả chi tiết | Dữ liệu liên quan |
| :--- | :--- | :--- | :--- |
| **Product Variants** | Multi-options | Quản lý sản phẩm theo Màu sắc, Dung lượng, Tình trạng. | `products.variants[]` |
| **Taxonomy** | Multi-level | Phân loại sản phẩm/dịch vụ theo cây thư mục đa cấp. | `categories` collection |
| **Stock Control** | Atomic Increment | Sử dụng `increment()` để đảm bảo không sai lệch khi nhiều người bán. | `stock`, `held` fields |
| **Price Logic** | Promo Pricing | Hỗ trợ giá gốc, giá khuyến mãi và hiển thị % giảm giá. | `price`, `price_promo` |
| **SEO Meta** | Auto-Schema | Tự động sinh dữ liệu cấu trúc cho Google Search Console. | `seo` object |

## 3. Phân hệ Hoa hồng & Nhân sự (Commission & HR)

| Thành phần | Logic / Tính năng | Mô tả chi tiết | Dữ liệu liên quan |
| :--- | :--- | :--- | :--- |
| **Rule Hierarchy** | Level 1-2-3 | Ưu tiên: Sản phẩm cụ thể > Danh mục > Mặc định. | `commission_rules` |
| **Commission Split** | Seller vs Tech | Tách biệt hoa hồng cho người tạo phiếu và người thực hiện. | `enableSeller...`, `enableTech...` |
| **Refund Logic** | Negative Balance | Tạo bản ghi âm khi hoàn phí để bù trừ thu nhập nhân viên. | `_refund` doc suffix |
| **RBAC** | Role-based | Phân quyền Admin (full), Manager (báo cáo), Tech (chỉ sửa). | `users.role` |

## 4. Phân hệ AI & Automation

| Thành phần | Logic / Tính năng | Mô tả chi tiết | Dữ liệu liên quan |
| :--- | :--- | :--- | :--- |
| **AI Content** | Gemini 1.5/2.0 | Tự động viết bài tin tức, tối ưu SEO dựa trên keyword. | `gemini.ts` |
| **AI Support** | Chatbot | Hỗ trợ trả lời khách hàng realtime qua RTDB. | `realtimedb.ts` |
| **On-demand ISR** | Cache Purge | Xóa cache Cloudflare/Next.js ngay khi Admin cập nhật dữ liệu. | `revalidate.ts` |
| **Image Opt** | WebP Canvas | Tự động tối ưu ảnh sang WebP ngay tại trình duyệt để tiết kiệm băng thông. | `imageOptimizer.ts` |

## 5. Danh mục Collection Firestore (Detailed Schema Summary)

| Collection | Mục đích chính | Field quan quan trọng |
| :--- | :--- | :--- |
| **`repairs`** | Lưu toàn bộ phiếu SC | `status`, `parts`, `statusTimeline`, `payment`, `warrantyClaim` |
| **`products`** | Kho linh kiện & Máy bán | `stock`, `held`, `variants`, `price`, `category` |
| **`commissions`** | Theo dõi thu nhập NV | `staffId`, `amount`, `sourceId`, `baseAmount` |
| **`commission_rules`** | Định nghĩa tỷ lệ % | `hierarchyLevel`, `targetType`, `targetValue`, `percentage` |
| **`import_receipts`** | Quản lý nhập hàng | `items`, `status` (draft/ordered/completed), `totalAmount` |
| **`system_config`** | Cấu hình toàn hệ thống | `repairs`, `layout_settings`, `navigation_settings` |
| **`articles`** | Tin tức & Blog | `content`, `slug`, `seo`, `authorId` |
| **`orders`** | Đơn hàng từ Storefront | `items`, `customerInfo`, `total_amount`, `payment_status` |
