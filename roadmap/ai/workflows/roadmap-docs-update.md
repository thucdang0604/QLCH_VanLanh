# Roadmap Docs Update Workflow

Use this workflow when updating roadmap documentation.

## Rules

1. Do not create hidden dot folders/files under roadmap content.
2. Use normal folder names for Roadmap SPA-readable artifacts.
3. Mermaid diagrams must use fenced code blocks and close before the next heading.
4. Avoid raw JavaScript template literals in markdown content.
5. New docs must be linked from `master.md` or a relevant module file.
6. New AI plan files must be registered in `roadmap/ui/data/manifest.json`.
7. Preserve existing roadmap encoding unless intentionally repairing it.

## Verification

After editing docs:

- Check links.
- Check markdown headings.
- Check Mermaid fences.
- Check manifest paths.
