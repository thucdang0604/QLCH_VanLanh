# Kế Hoạch Backtest (QA & Regression Testing) Toàn Diện

Bản kế hoạch này được xây dựng dựa trên **12 luồng tính năng cốt lõi** trong `AI_FEATURE_IMPACT_MAP.md`. Mục tiêu là kiểm chứng (backtest/regression test) toàn bộ hệ thống sau các đợt cập nhật lớn (Phase 3 Geofence, Phase 4 Inventory Overhaul) để đảm bảo tính sẵn sàng trước khi deploy lên Production.

> **Ghi chú:** "Backtest" trong hệ thống web thường mang ý nghĩa là **Regression Testing** (Kiểm thử hồi quy) và **E2E Testing** (Kiểm thử từ đầu đến cuối luồng), đảm bảo code mới không làm gãy các tính năng cũ.

---

## MỤC TIÊU & QUY TẮC TEST
- **Double-Entry Inventory:** Đảm bảo tổng số lượng (`stock` + `held`) luôn khớp nhau, không bao giờ bị âm hàng vô lý.
- **Tối ưu Firebase Reads:** Kiểm tra kỹ các dropdown, danh sách xem có load toàn bộ DB hay không (bắt buộc phải có phân trang limit 50).
- **Type Safety & Crash:** Đảm bảo không văng lỗi màn hình trắng, không lỗi OOM (Out of Memory) khi xử lý ảnh.

---

## KỊCH BẢN KIỂM THỬ (TEST CASES)

### 1. Luồng Sửa chữa (Repair Workflow) & Commission
| Test Case ID | Hành động | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| REPAIR-01 | Tạo phiếu sửa chữa mới (Walk-in) tại Admin /repairs | Form không pre-fetch toàn bộ danh sách lịch hẹn. Tạo thành công. | [ ] |
| REPAIR-02 | Kỹ thuật viên nhận ticket -> Thêm linh kiện vào phiếu | Khi thêm, giá `unitPriceAtUse` được chốt (snapshot). Tồn kho (`stock`) bị tạm giữ (`held`). | [ ] |
| REPAIR-03 | Đổi trạng thái qua lại (State Machine workflow) | Không được nhảy cóc các trạng thái cấm. | [ ] |
| REPAIR-04 | Hoàn thành sửa chữa (Done) | Hệ thống tự in tem bảo hành ảo. | [ ] |
| REPAIR-05 | Tính hoa hồng (Commission) | Check `/admin/commissions` sinh ra record tiền hoa hồng đúng theo 3 mốc % cấu hình. | [ ] |

### 2. Luồng Bán lẻ, Giỏ hàng & Checkout (Double-Entry Inventory)
| Test Case ID | Hành động | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| CART-01 | Thêm sản phẩm vào giỏ, bấm +/- số lượng ở CartDrawer | UI mở từ phải sang (Drawer), giá cập nhật đúng, không load lại trang. | [ ] |
| CART-02 | Truy cập thẳng `/cart` | Bị redirect tự động sang `/checkout` theo đúng Rule. | [ ] |
| CART-03 | Đặt hàng thành công qua `/checkout` | Backend gọi API báo `stock` trừ đi N, `held` cộng thêm N (Transaction nguyên tử qua `writeBatch`). | [ ] |
| CART-04 | Admin hủy đơn hàng vừa đặt | Số lượng `held` giảm đi N, trả ngược lại về `stock` (balance kho). | [ ] |

### 3. Cập nhật Kho & Linh kiện (Inventory Overhaul - Phase 4)
| Test Case ID | Hành động | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| INV-01 | Mở `UniversalProductModal` tạo sản phẩm mới ở `/admin/products` | Tự động sinh `slug`, chọn được ảnh qua `MediaManager`, lưu thành công. | [ ] |
| INV-02 | Dùng POS (`/admin/pos`) tìm kiếm & thanh toán sản phẩm | Tìm nhanh, thanh toán trừ kho ngay lập tức. | [ ] |
| INV-03 | Quản lý linh kiện (`/admin/parts`) | Chỉ hiển thị quyền "View-only" tồn kho. Chọn linh kiện hết hàng (stock=0) để đưa vào "Propose" (đề xuất nhập). | [ ] |
| INV-04 | Import Hàng hóa (`/admin/inventory`) | Tạo đơn nhập hàng, ghi nhận snapshot tên/giá/số lượng vào lịch sử, kho (`stock`) tăng. | [ ] |

### 4. Hệ thống Đánh giá - Geofenced Reviews (Phase 3)
| Test Case ID | Hành động | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| REV-01 | Admin cấu hình Geofence (Toạ độ, Bán kính, PIN) tại Setting | Lưu thành công thông số vào site config backend. | [ ] |
| REV-02 | Khách hàng mở link `/rate`, từ chối cấp quyền GPS | Yêu cầu nhập mã PIN. Nhập đúng -> Cho phép đánh giá. | [ ] |
| REV-03 | Khách cho phép GPS nhưng ở xa cửa hàng (ngoài bán kính) | Form báo "Bạn không ở tại cửa hàng", yêu cầu mã PIN. | [ ] |
| REV-04 | Spam API đánh giá liên tục (Server-side Rate Limit) | Quá 3/IP/day bị backend tự động block trả về HTTP 429. | [ ] |

### 5. Media Library & Upload Pipeline
| Test Case ID | Hành động | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| MEDIA-01 | Upload file 10MB định dạng PNG vào Tin tức / Hàng hoá | Bị chặn do vượt quá 2MB (hoặc hệ thống nén WebP bằng Worker thread không làm treo trình duyệt). | [ ] |
| MEDIA-02 | Chọn ảnh có sẵn bằng `<MediaManager>` ở nhiều trang | Đồng nhất 1 bộ chọn duy nhất, có phân chia theo Folder (Chung, Tin tức, Hàng hoá). | [ ] |

### 6. Cấu hình hệ thống (Settings) & Hiển thị
| Test Case ID | Hành động | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| SETTING-01 | Đổi tên cửa hàng, Theme thay đổi ở `/admin/appearance` | Refresh trình duyệt thấy áp dụng ngay nhờ `ConfigContext`. Nhóm Staff không truy cập được (RBAC block). | [ ] |
| FLASH-01 | Gắn cờ `isFlashSale = true` cho sản phẩm A | Countdown hiện ở trang chủ, link `/flash-sale` hoạt động, kho trừ đúng khi ai đó mua. | [ ] |

### 7. Chat AI (Gemini RAG)
| Test Case ID | Hành động | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| CHAT-01 | Mở widget Chat ở Client, hỏi "Có màn hình iPhone 15 không?" | RAG AI đọc dữ liệu sản phẩm và trả lời, Realtime DB sync xuống cho Admin xem (ở `/admin/chat`). | [ ] |

---

## QUY TRÌNH THỰC THI (ACTION ITEMS)

- [ ] **Bước 1:** Chuẩn bị môi trường (Chạy `npm run dev`), mở Inspect Element theo dõi Console (Network & Errors).
- [ ] **Bước 2:** Xóa/Clear cache DB staging (tuỳ chọn) hoặc tạo account test.
- [ ] **Bước 3:** Chạy dọc theo danh sách Checklist ở trên bằng cách thao tác tay (Manual Testing) đóng vai Guest, Customer, và Admin.
- [ ] **Bước 4:** Bắt lỗi & Ghi nhận. (Nếu phát hiện bất kỳ lỗi nào như lỗi Type TS, Crash, hay kho hàng bị âm -> Report lại cho AI để fix luôn).
- [ ] **Bước 5:** Tích V (✅) cho từng luồng pass.

---
> **Prompt cho Lần sau:** 
> Nếu anh/chị cần em **viết test tự động** (như cài đặt Playwright / Cypress để tự AI chạy các luồng click), hãy bảo em! Còn nếu chạy bằng tay, anh/chị hãy dùng checklist này ạ.
