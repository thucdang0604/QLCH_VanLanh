# Má»¥c TiĂªu

Chuyá»ƒn Ä‘á»•i toĂ n bá»™ tĂ i liá»‡u tÄ©nh trong thÆ° má»¥c `roadmap/` hiá»‡n táº¡i sang cáº¥u trĂºc Single Page Application (SPA) Data-driven trong thÆ° má»¥c má»›i `roadmap_v2/`.
Cáº¥u trĂºc má»›i sáº½ lÆ°u trá»¯ toĂ n bá»™ dá»¯ liá»‡u (Bugs, sÆ¡ Ä‘á»“ Mermaid) dÆ°á»›i dáº¡ng file JSON. `index.html` sáº½ lĂ  trang duy nháº¥t chá»‹u trĂ¡ch nhiá»‡m `fetch()` dá»¯ liá»‡u vĂ  render Ä‘á»™ng.

Äiá»u nĂ y mang láº¡i lá»£i Ă­ch kĂ©p:

1. **Äá»‘i vá»›i AI:** Tá»‘i Æ°u hĂ³a lÆ°á»£ng token khi Ä‘á»c file, chá»‰ cáº§n Ä‘á»c file `.json` nháº¹ nhĂ ng, náº¯m báº¯t ngá»¯ cáº£nh nhanh chĂ³ng.
2. **Äá»‘i vá»›i NgÆ°á»i dĂ¹ng:** Tráº£i nghiá»‡m chuyá»ƒn trang mÆ°á»£t mĂ  khĂ´ng cáº§n load láº¡i, táº­p trung táº¥t cáº£ vĂ o 1 nÆ¡i.

## User Review Required

> [!IMPORTANT]
>
> - Sau khi tĂ´i thiáº¿t láº­p xong `roadmap_v2/`, thÆ° má»¥c `roadmap/` cÅ© váº«n sáº½ Ä‘Æ°á»£c giá»¯ nguyĂªn Ä‘á»ƒ báº¡n Ä‘á»‘i chiáº¿u. Khi báº¡n xĂ¡c nháº­n má»i thá»© á»Ÿ báº£n v2 Ä‘Ă£ hoĂ n háº£o, chĂºng ta má»›i cĂ¢n nháº¯c xĂ³a/thay tháº¿ báº£n cÅ©.
> - Báº¡n cĂ³ Ä‘á»“ng Ă½ vá»›i giao diá»‡n kiá»ƒu "Dashboard tá»•ng há»£p" (Menu bĂªn trĂ¡i, Ná»™i dung bĂªn pháº£i) cho `index.html` má»›i khĂ´ng?

## Open Questions

> [!NOTE]
> Vá» pháº§n Bug Details (chi tiáº¿t bug), hiá»‡n táº¡i nĂ³ náº±m trong `bug-details.html`. Viá»‡c chuyá»ƒn toĂ n bá»™ ná»™i dung HTML dĂ i dĂ²ng (triá»‡u chá»©ng, cĂ¡ch fix) vĂ o JSON cĂ³ thá»ƒ lĂ m JSON hÆ¡i dĂ i. Tuy nhiĂªn, vĂ¬ má»¥c tiĂªu lĂ  tá»‘i Æ°u cho AI, tĂ´i Ä‘á» xuáº¥t váº«n gom ná»™i dung chi tiáº¿t bug vĂ o file `data/bugs.json` hoáº·c lÆ°u tháº³ng vĂ o `manifest.json`. Báº¡n cĂ³ Ä‘á»“ng Ă½ khĂ´ng?

## Proposed Changes

### Thay Äá»•i Cáº¥u TrĂºc ThÆ° Má»¥c Má»›i (`roadmap_v2/`)

#### [NEW] `roadmap_v2/data/manifest.json`

- Copy nguyĂªn tráº¡ng tá»« `roadmap/manifest.json`. ÄĂ¢y lĂ  file chá»©a tá»•ng quan dá»± Ă¡n, danh sĂ¡ch bug, tráº¡ng thĂ¡i hoĂ n thĂ nh.

#### [NEW] `roadmap_v2/data/workflows.json`

- File JSON má»›i, chá»©a chuá»—i text Ä‘á»‹nh nghÄ©a biá»ƒu Ä‘á»“ Mermaid Ä‘Æ°á»£c bĂ³c tĂ¡ch tá»« cĂ¡c file HTML cÅ© (pos, inventory, repair, finance, v.v.).
- Äá»‹nh dáº¡ng dá»± kiáº¿n:

```json
{
  "pos-orders": {
    "title": "đŸ›ï¸ Workflow POS & ÄÆ¡n HĂ ng Chi Tiáº¿t",
    "mermaid": "graph TD\n subgraph POS [BĂ¡n HĂ ng Táº¡i Quáº§y - POS]\n ..."
  },
  "inventory": { ... }
}
```

#### [NEW] `roadmap_v2/index.html`

- File HTML duy nháº¥t (Single Page).
- Import thÆ° viá»‡n `mermaid.min.js`, `svg-pan-zoom`, Tailwind CSS (náº¿u cáº§n) hoáº·c custom CSS.
- Chá»©a Layout chia lĂ m 2 pháº§n: Sidebar (Menu) vĂ  Main Content.

#### [NEW] `roadmap_v2/styles.css`

- File CSS chá»©a cĂ¡c style cho layout má»›i, cĂ¡c nĂºt báº¥m, vĂ  khung chá»©a sÆ¡ Ä‘á»“.
- Sáº½ káº¿ thá»«a cĂ¡c thiáº¿t káº¿ Dark mode Ä‘áº¹p máº¯t tá»« báº£n cÅ©.

#### [NEW] `roadmap_v2/app.js`

- Script Ä‘iá»u khiá»ƒn toĂ n bá»™ logic SPA.
- CĂ¡c hĂ m: `loadDashboard()`, `loadWorkflow(id)`, `loadBugDetails(id)`.
- Tá»± Ä‘á»™ng gá»i `mermaid.run()` khi render xong HTML chá»©a biá»ƒu Ä‘á»“.

## Verification Plan

### Tá»± Äá»™ng / Thá»§ CĂ´ng

1. Má»Ÿ `roadmap_v2/index.html` trĂªn trĂ¬nh duyá»‡t local.
2. Kiá»ƒm tra xem mĂ n hĂ¬nh Dashboard máº·c Ä‘á»‹nh cĂ³ hiá»ƒn thá»‹ Ä‘Ăºng tiáº¿n Ä‘á»™ vĂ  danh sĂ¡ch bug tá»« `manifest.json` khĂ´ng.
3. Click vĂ o cĂ¡c menu Workflow (POS, Inventory, Repair...). XĂ¡c minh ráº±ng biá»ƒu Ä‘á»“ Mermaid Ä‘Æ°á»£c váº½ lĂªn Ä‘á»™ng mĂ  khĂ´ng táº£i láº¡i trang.
4. XĂ¡c minh chá»©c nÄƒng Zoom In/Out/Reset View váº«n hoáº¡t Ä‘á»™ng hoĂ n háº£o trĂªn biá»ƒu Ä‘á»“ Ä‘á»™ng.
5. Kiá»ƒm tra AI File Map hoáº·c há»i AI Ä‘á»c thĂ´ng tin, xem AI cĂ³ Ä‘á»c tá»« file JSON má»™t cĂ¡ch mÆ°á»£t mĂ  khĂ´ng.
