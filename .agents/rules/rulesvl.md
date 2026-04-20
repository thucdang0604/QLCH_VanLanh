---
trigger: always_on
---

Before coding ANY task:
1. Read `Plan.md` (decisions + change history)
2. Read `AI_FEATURE_IMPACT_MAP.md` (which files to touch)
3. Read `AI_FILE_MAP.md` (compact dependency graph — know which files break when you edit one)
4. Follow constraints in Plan.md exactly
5. After done → append entry to CHANGE LOG in `Plan.md`
6. Run `npm run graph` if you created/deleted/moved files (updates AI_FILE_MAP.md)