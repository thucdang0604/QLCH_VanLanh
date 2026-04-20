---
description: Load VanLanh context before complex task. Trigger: /wfvl
---

## Content
Read from `Plan.md` — section `[AI_CONTEXT]` only (skip `[HUMAN]`).
Read `AI_FEATURE_IMPACT_MAP.md` — find relevant feature section.

Then confirm before coding:
- Which decisions apply to this task
- Which files will be touched
- Any CHANGE LOG entry relevant to those files

After task complete, append to CHANGE LOG in `Plan.md`:
### [YYYY-MM] Task name
F: files changed
W: what changed
Y: why + which decision applied
N: edge cases or notes for next time