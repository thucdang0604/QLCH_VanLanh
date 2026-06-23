# 🧩 Workflows
## finance-hr
- **Title:** Tài chính & Nhân sự
- **Icon:** 💰
### 📁 Target Files (Các file đích)
- src/app/admin/finance/page.tsx (Báo cáo thu chi)
- src/app/admin/hr/page.tsx (Quản lý nhân sự & hoa hồng)
```mermaid
graph TD
            subgraph FINANCE_IN [Dòng Tiền Thu - Revenue]
            R1("🔗 Từ Bán Hàng POS (Sản phẩm & Phiếu Sửa Chữa)") --> RE1("Phiếu Thu: Doanh thu POS")
            RE1 -.->|Đã vá| BUG_REV_001["✅ ĐÃ VÁ: Query window 3→6 tháng"]
            R2("🔗 Từ Đơn Hàng Online") --> RE2("Phiếu Thu: Doanh thu Đơn hàng")
            R3("🔗 Thu nợ Khách Hàng (Trả nhiều lần)") --> RE3("Phiếu Thu: Xử lý công nợ")
            RE1 -.->|Đã vá| BUG_REV_002["✅ ĐÃ VÁ: Khấu trừ quà tặng 2 lần trong tính Lợi nhuận ròng"]
            R4("Tạo Phiếu Thu Khác") --> RE4("Phiếu Thu Khác")
            RE1 --> FUND("💰 Quỹ Tổng (Realtime Firestore)")
            RE2 --> FUND
            RE3 --> FUND
            RE4 --> FUND
            end
            subgraph FINANCE_OUT [Dòng Tiền Chi - Expenses]
            E1("🔗 Từ Nhập Kho") --> EX1("Phiếu Chi: Nhà Cung Cấp")
            E2("Phiếu Chi Khác") --> EX2("Mặt bằng, Điện, Marketing")
            EX1 --> OUT_FUND("💸 Trừ Quỹ")
            EX2 --> OUT_FUND
            OUT_FUND --> FUND
            end
            subgraph HR [Quản Lý Nhân Sự & Hoa Hồng]
            H1("Tạo Hồ Sơ Nhân Viên") --> H2("🔐 Phân quyền RBAC (permissions.ts)")
            H3("🔗 Chốt Đơn POS / Đơn Hàng Online") --> H4("🛡️ commissionUtils.ts")
            H4 -.->|Đã vá| BUG_COM_002["✅ ĐÃ VÁ: Hoa hồng đơn nợ (Pay Later)"]
            H4 -.->|Đã vá| BUG_COM_005["✅ ĐÃ VÁ: Thiếu check thanh toán đơn hàng"]
            H4 --> H_RULE{"Áp dụng CommissionRule"}
            H_RULE -->|"Tính theo % Doanh thu"| H5("Hoa hồng = Doanh thu * %")
            H5 -.->|Đã vá| BUG_COM_003["✅ ĐÃ VÁ: Làm tròn số thực"]
            H_RULE -.->|Đã vá| BUG_COM_004["✅ ĐÃ VÁ: Phân bổ giảm giá pro-rata"]
            H_RULE -->|"Cố định theo SP/Dịch vụ"| H6("Hoa hồng = Số lượng * Giá sàn")
            H_DEDUCT("🔗 Từ Bán Hàng (Trả hàng / Hủy đơn)") --> H_DEDUCT_ACT("➖ Giảm trừ Hoa hồng")
            H5 --> H7("Cộng dồn Bảng Lương (Realtime)")
            H6 --> H7
            H_DEDUCT_ACT --> H7
            H7 --> H8{"🔐 RBAC Check (Staff/Revenue)"}
            H8 -->|"Nhân viên thường"| H9("🙈 Chỉ xem lương cá nhân")
            H8 -->|"Quản trị / Kế toán"| H10("👁️ Xem toàn bộ bảng lương")
            H10 --> H11("Chốt Lương & Thanh Toán")
            H9 --> H11
            H11 --> EX3("Phiếu Chi: Lương NV")
            EX3 --> OUT_FUND
            end
            %% Cross-links
            click R1 call handleWorkflowClick("pos-orders") "Mở"
            click R2 call handleWorkflowClick("pos-orders") "Mở"
            click E1 call handleWorkflowClick("inventory") "Mở"
            click H_DEDUCT call handleWorkflowClick("pos-orders") "Mở"
            click BUG_COM_002 call handleBugClick("BUG-COM-002") "Mở chi tiết"
            click BUG_COM_003 call handleBugClick("BUG-COM-003") "Mở chi tiết"
            click BUG_COM_004 call handleBugClick("BUG-COM-004") "Mở chi tiết"
            click BUG_COM_005 call handleBugClick("BUG-COM-005") "Mở chi tiết"
            click BUG_REV_001 call handleBugClick("BUG-REV-001") "Mở chi tiết"
            click BUG_REV_002 call handleBugClick("BUG-REV-002") "Mở chi tiết"
```