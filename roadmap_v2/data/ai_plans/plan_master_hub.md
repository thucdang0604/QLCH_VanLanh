# TĂ­ch há»£p Master Hub Workflow & Tá»‘i Æ¯u Hiá»ƒn Thá»‹

## Má»¥c tiĂªu
1. **Sá»­a lá»—i hiá»ƒn thá»‹**: Xá»­ lĂ½ tĂ¬nh tráº¡ng sÆ¡ Ä‘á»“ (workflow) bá»‹ nhá», che láº¥p vĂ  khĂ´ng hiá»ƒn thá»‹ full mĂ n hĂ¬nh.
2. **XĂ¢y dá»±ng SÆ¡ Ä‘á»“ Master Hub**: Táº¡o má»™t siĂªu sÆ¡ Ä‘á»“ (Unified Master Diagram) bao gá»“m toĂ n bá»™ cĂ¡c luá»“ng (Kho, POS, Sá»­a chá»¯a, TĂ i chĂ­nh, Há»‡ thá»‘ng) vĂ  cĂ¡c Ä‘iá»ƒm giao nhau (cross-links) giá»¯a chĂºng.
3. **Hiá»‡u á»©ng Highlight TÆ°Æ¡ng TĂ¡c**: Khi click vĂ o má»™t node báº¥t ká»³ trĂªn sÆ¡ Ä‘á»“ Master Hub, toĂ n bá»™ cĂ¡c node vĂ  mÅ©i tĂªn (edges) liĂªn quan trong flow Ä‘Ă³ sáº½ sĂ¡ng lĂªn, cĂ¡c node khĂ¡c sáº½ bá»‹ má» Ä‘i Ä‘á»ƒ ngÆ°á»i dĂ¹ng dá»… dĂ ng theo dĂµi Ä‘Æ°á»ng Ä‘i cá»§a dá»¯ liá»‡u.

> [!IMPORTANT]
> **YĂªu cáº§u phĂª duyá»‡t**: SÆ¡ Ä‘á»“ Master Hub sáº½ ráº¥t lá»›n (gáº§n 100 nodes). Khi ná»‘i toĂ n bá»™ láº¡i vá»›i nhau, Mermaid cĂ³ thá»ƒ render ra má»™t sÆ¡ Ä‘á»“ cá»±c ká»³ phá»©c táº¡p. TĂ´i sáº½ sáº¯p xáº¿p chĂºng thĂ nh cĂ¡c `subgraph` (cá»¥m) rĂµ rĂ ng, vĂ  tĂ­nh nÄƒng Highlight sáº½ lĂ  máº¥u chá»‘t Ä‘á»ƒ "gá»¡ rá»‘i" sÆ¡ Ä‘á»“ nĂ y. Báº¡n xem xĂ©t giáº£i phĂ¡p dÆ°á»›i Ä‘Ă¢y nhĂ©.

---

## CĂ¡c thay Ä‘á»•i Ä‘á» xuáº¥t

### 1. Tá»‘i Æ°u CSS Layout (Hiá»ƒn thá»‹ SÆ¡ Ä‘á»“)
#### [MODIFY] `styles.css`
- Chuyá»ƒn `#content-container` thĂ nh `display: flex; flex-direction: column;` Ä‘á»ƒ xá»­ lĂ½ chiá»u cao Ä‘á»™ng.
- Sá»­a class `.dashboard-view` vĂ  `.workflow-view` Ä‘á»ƒ Ä‘áº£m báº£o chĂºng káº¿ thá»«a Ä‘Ăºng 100% khĂ´ng gian trá»‘ng thay vĂ¬ bá»‹ bĂ³p ngháº¹t.
- Sá»­a láº¡i chiá»u cao cá»§a `.mermaid svg` Ä‘á»ƒ nĂ³ luĂ´n fill Ä‘Ăºng kĂ­ch thÆ°á»›c cá»§a `panZoom` wrapper.

### 2. Thiáº¿t káº¿ Unified Master Diagram
#### [MODIFY] `data/workflows.json`
- Thay tháº¿ luá»“ng `master` hiá»‡n táº¡i (Ä‘ang chá»‰ lĂ  cĂ¡c Ă´ vuĂ´ng rá»i ráº¡c) thĂ nh má»™t sÆ¡ Ä‘á»“ Mermaid tá»•ng há»£p, bĂª nguyĂªn ná»™i dung cá»§a cĂ¡c luá»“ng nhá» rĂ¡p láº¡i thĂ nh má»™t sÆ¡ Ä‘á»“ siĂªu lá»›n.
- Sá»­ dá»¥ng cáº¥u trĂºc `subgraph` cho tá»«ng module Ä‘á»ƒ giá»¯ cho sÆ¡ Ä‘á»“ Ä‘Æ°á»£c phĂ¢n vĂ¹ng tá»‘t.
- Gáº¯n thĂªm event `click` vĂ o toĂ n bá»™ cĂ¡c node trong sÆ¡ Ä‘á»“ nĂ y, trá» Ä‘áº¿n hĂ m `handleMasterNodeClick("node_id")` trong JS.

### 3. Thuáº­t toĂ¡n Trace & Highlight trĂªn SVG (TÆ°Æ¡ng tĂ¡c)
#### [MODIFY] `app.js`
- ThĂªm logic DOM traversal (duyá»‡t DOM SVG) cho biá»ƒu Ä‘á»“ Mermaid.
- Khi ngÆ°á»i dĂ¹ng click vĂ o má»™t node, há»‡ thá»‘ng sáº½:
  1. TĂ¬m class `node` tÆ°Æ¡ng á»©ng trong file SVG.
  2. Tra ngÆ°á»£c/xuĂ´i qua cĂ¡c Ä‘Æ°á»ng káº» `.edgePaths` vĂ  cĂ¡c `edgeTerminals` Ä‘á»ƒ tĂ¬m ra táº¥t cáº£ cĂ¡c node káº¿t ná»‘i vá»›i nĂ³.
  3. ThĂªm class `.highlighted` cho cĂ¡c pháº§n tá»­ thuá»™c luá»“ng nĂ y, vĂ  class `.dimmed` cho cĂ¡c pháº§n tá»­ khĂ´ng liĂªn quan.
  4. ThĂªm CSS Ä‘á»™ng vĂ o trong view Ä‘á»ƒ xá»­ lĂ½ opacity vĂ  drop-shadow phĂ¡t sĂ¡ng cho Ä‘Æ°á»ng line.
- Bá»• sung nĂºt "Táº¯t Highlight" (Clear Highlight) trĂªn thanh cĂ´ng cá»¥ `view-controls`.

---

## Káº¿ hoáº¡ch XĂ¡c minh (Verification Plan)

### Kiá»ƒm tra báº±ng máº¯t (Manual UI Check)
- Má»Ÿ láº¡i trang Dashboard, chuyá»ƒn sang cĂ¡c Tab Workflow (Kho, POS...) Ä‘á»ƒ xem biá»ƒu Ä‘á»“ Ä‘Ă£ bung to ra chÆ°a, cĂ³ cuá»™n vĂ  zoom báº±ng chuá»™t bĂ¬nh thÆ°á»ng khĂ´ng.
- Chuyá»ƒn sang Tab "Master Hub". Xem sÆ¡ Ä‘á»“ tá»•ng quan.
- Click thá»­ vĂ o má»™t chá»©c nÄƒng (VD: "đŸ”— ÄÆ¡n HĂ ng Online"), quan sĂ¡t xem biá»ƒu Ä‘á»“ cĂ³ má» Ä‘i vĂ  lĂ m sĂ¡ng rĂµ Ä‘Æ°á»ng Ä‘i cá»§a "ÄÆ¡n HĂ ng Online" xuyĂªn suá»‘t sang Ä‘áº¿n "Trá»« Kho" vĂ  "TĂ i ChĂ­nh" hay khĂ´ng.

### CĂ¡c cĂ¢u há»i má»Ÿ (Open Questions)
> [!NOTE]
> 1. SÆ¡ Ä‘á»“ Master Hub náº¿u gom háº¿t 100% chi tiáº¿t cĂ³ thá»ƒ ráº¥t "chi chĂ­t". TĂ´i dá»± Ä‘á»‹nh sáº½ gá»™p cáº£ 5 module vĂ o, náº¿u quĂ¡ rá»‘i, tĂ´i sáº½ bá» bá»›t cĂ¡c node ghi chĂº rÆ°á»m rĂ  (vĂ­ dá»¥ cĂ¡c log bug) ra khá»i sÆ¡ Ä‘á»“ Master Hub, chá»‰ giá»¯ luá»“ng dá»¯ liá»‡u chĂ­nh thĂ´i. Báº¡n cĂ³ Ä‘á»“ng Ă½ khĂ´ng? (CĂ¡c sÆ¡ Ä‘á»“ chi tiáº¿t tá»«ng module bĂªn trong menu riĂªng váº«n sáº½ giá»¯ Ä‘áº§y Ä‘á»§ chi tiáº¿t).
> 2. TĂ­nh nÄƒng highlight tá»± Ä‘á»™ng tĂ¬m Ä‘Æ°á»ng (auto-trace) hoáº¡t Ä‘á»™ng tá»‘t trĂªn SVG cá»§a Mermaid, tuy nhiĂªn Ä‘Ă´i lĂºc cĂ¡c node gom cá»¥m (subgraph) cĂ³ thá»ƒ hiá»ƒn thá»‹ hÆ¡i láº¡. TĂ´i sáº½ tinh chá»‰nh náº¿u phĂ¡t sinh.

Vui lĂ²ng cho tĂ´i biáº¿t báº¡n cĂ³ Ä‘á»“ng Ă½ triá»ƒn khai theo káº¿ hoáº¡ch nĂ y khĂ´ng, hoáº·c náº¿u báº¡n cĂ³ muá»‘n bá»• sung gĂ¬ thĂªm.
