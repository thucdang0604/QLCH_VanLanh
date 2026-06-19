# Walkthrough: Redesign Discount Rules → Visual Builder

## Thay đổi

### File duy nhất: `src/app/admin/vouchers/DiscountRulesTab.tsx`

**Trước**: Form nhập text thủ công (slug danh mục + keywords phân cách bằng dấu phẩy)

**Sau**: Visual Builder dạng flow **NẾU → THÌ → GIẢM** với:

| Component mới | Chức năng |
|---|---|
| `flattenTaxonomy()` | Flatten cây taxonomy thành danh sách phẳng có `{id, name, fullPath, depth, seoKeywords}` |
| `TaxonomyDropdown` | Dropdown có search, hiện hierarchy indent, click-outside close |
| `KeywordChips` | Hiển thị keywords dạng chip, thêm/xóa, Enter để thêm nhanh |

**Cải tiến UX:**
- Dropdown lấy data trực tiếp từ `useConfig().config.taxonomy` (service cho trigger, retail+component cho target)
- Auto-populate keywords từ `seoKeywords` khi chọn taxonomy node
- Preview sentence real-time
- Danh sách rule hiện tên taxonomy node thay vì slug thô (qua `resolveNodeName()`)

## Không thay đổi

- `discountCalc.ts` — logic tính giảm giá
- `discountRuleUtils.ts` — fetch rules
- `voucher.ts` — interface `AccessoryDiscountRule`
- Firestore schema collection `accessory_discount_rules`
- Tab "Hạng thành viên" — giữ nguyên 100%
