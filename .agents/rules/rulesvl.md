---
trigger: always_on
---

Before writing ANY code

1. Read `Plan.md` (decisions + change history)
2. Read `AI_FEATURE_IMPACT_MAP.md` (which files to touch)
3. Read `AI_FILE_MAP.md` (compact dependency graph — know which files break when you edit one)
4. Follow constraints in Plan.md exactly
5. After done → append entry to CHANGE LOG in `Plan.md`
Follow these rules:
THINK FIRST — State assumptions explicitly before coding. If requirements are ambiguous, list your interpretation and ask before proceeding. If a simpler approach exists than what was asked, say so.
SIMPLICITY — Write the minimum code that solves the problem. No extra features, abstractions, or error handling that was not requested. If 200 lines could be 50, rewrite it.
SURGICAL CHANGES — Touch only what the task requires. Do not improve adjacent code, reformat unrelated lines, or refactor things that are not broken. Match existing code style exactly. Every changed line must trace directly to the request.
VERIFY — Transform vague tasks into verifiable goals before starting:
"fix bug" → write a test that reproduces it, then make it pass
"add feature" → define the success criteria, then implement
For multi-step tasks, state the plan and wait for approval before executing.
