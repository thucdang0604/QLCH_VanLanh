# Redesign Accessory Discount Rules → Visual Builder

## Bối cảnh
Hiện tại, cấu hình Rule phụ kiện trong tab "Giảm giá và thành viên" yêu cầu user nhập thủ công:
- Danh mục DV trigger (text input, slug thô như `thay-man-hinh`)
- Keywords trigger (text, phân cách bằng dấu phẩy)
- Danh mục SP target (text input)
- Keywords target (text)

→ Khó sử dụng, dễ sai, không trực quan.

## Mục tiêu
Chuyển form thành Visual Builder dạng:

> **NẾU** khách dùng dịch vụ `[dropdown chọn DV]` **THÌ** sản phẩm `[dropdown chọn SP/Phụ kiện]` được **giảm** `[input số]` `[% hoặc VNĐ]`

## Proposed Changes

### DiscountRulesTab.tsx (MODIFY)

#### AccessoryRuleModal — Redesign form:

1. **Thay input text thành dropdown có search** cho 2 trường:
   - **Trigger (Dịch vụ)**: Lấy từ `taxonomy.service` trong `SiteConfig` (qua `ConfigContext`). Flatten thành danh sách phẳng `{id, name}` để render dropdown. User chọn 1 hoặc nhiều node.
   - **Target (Sản phẩm)**: Lấy từ `taxonomy.retail` + `taxonomy.component`. Flatten tương tự.

2. **Layout Visual Builder**:
   ```
   ┌─────────────────────────────────────────────────────┐
   │  Tên rule: [______________]                          │
   │                                                      │
   │  ┌─ NẾU ──────────────────────────────────────────┐  │
   │  │ Khách sử dụng dịch vụ:                         │  │
   │  │ [▼ Chọn danh mục dịch vụ / Tìm kiếm...   ]    │  │
   │  │ + Hoặc thêm từ khóa tùy chỉnh: [___________]  │  │
   │  └────────────────────────────────────────────────┘  │
   │           ↓                                          │
   │  ┌─ THÌ ─────────────────────────────────────────┐  │
   │  │ Sản phẩm được giảm giá:                        │  │
   │  │ [▼ Chọn danh mục sản phẩm / Tìm kiếm...  ]   │  │
   │  │ + Hoặc thêm từ khóa tùy chỉnh: [___________]  │  │
   │  └────────────────────────────────────────────────┘  │
   │           ↓                                          │
   │  ┌─ GIẢM ────────────────────────────────────────┐  │
   │  │  [40] [▼ %  ]    Tối đa: [______] VNĐ         │  │
   │  └────────────────────────────────────────────────┘  │
   │                                                      │
   │  📋 Preview: "Khi dùng DV Thay Màn Hình → Cường    │
   │     lực giảm 40%"                                    │
   │                                              [Lưu]  │
   └─────────────────────────────────────────────────────┘
   ```

3. **Giữ nguyên data model**: Form vẫn save ra `triggerServiceCategory`, `triggerKeywords`, `targetProductCategory`, `targetKeywords` → **không cần sửa backend/discountCalc.ts**.

4. **Mapping logic**:
   - User chọn taxonomy node → save `node.id` vào `triggerServiceCategory` / `targetProductCategory`
   - User chọn node → auto-populate `triggerKeywords` / `targetKeywords` từ `node.seoKeywords` (tách ra mảng)
   - User vẫn có thể thêm keyword thủ công

5. **Preview sentence**: Tự động tạo câu mô tả dạng human-readable phía dưới form.

#### Accessories list (dưới tab) — Cải thiện hiển thị:
- Thay text tag thô bằng tên taxonomy node (nếu match được).

### Không sửa:
- `discountCalc.ts` — logic tính giảm giá giữ nguyên
- `discountRuleUtils.ts` — fetch rules giữ nguyên
- `voucher.ts` (types) — interface giữ nguyên
- Backend/Firestore schema — không thay đổi

## Verification Plan

### Manual Verification
1. Mở `/admin/vouchers` → tab "Giảm giá và thành viên" → tab "Rule Phụ kiện & Dịch vụ"
2. Nhấn "Thêm rule" → kiểm tra dropdown hiện danh sách taxonomy
3. Chọn DV + SP → kiểm tra preview sentence
4. Lưu → kiểm tra rule card hiển thị đúng
5. Edit rule cũ → kiểm tra dropdown pre-select đúng node
