# Task List - Firebase Deploy Pipeline Cleanup 2026-06-09

## Goal

Loai bo hoan toan cac loi/canh bao deploy Firebase Hosting/Frameworks lien quan `node-which`, `esbuild`, bundle `next.config.mjs`, generated Cloud Functions bundle va Node engine warning, trong khi van giu project dung pnpm va Node 22 neu chua co ly do nang runtime.

## Checklist

- [ ] Luu ket qua deploy hien tai: complete hay fail, kem log cuoi.
- [ ] Luu npm debug log neu co: `C:\Users\thucd\AppData\Local\npm-cache\_logs\...`.
- [ ] Ghi version toolchain: Node, npm, pnpm, Firebase CLI, PATH cua node/npm/npx/firebase.
- [ ] Clean generated artifacts `.next/` va `.firebase/` truoc khi reproduce.
- [ ] Chay `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- [ ] Chay deploy debug de reproduce warning `node-which`/`esbuild`.
- [ ] Them direct devDependency `esbuild` version phu hop Firebase Frameworks neu reproduce xac nhan CLI khong tim duoc binary.
- [ ] Kiem tra co can them `which`/binary lookup helper cho Windows hay khong.
- [ ] Sau khi Firebase sinh `.firebase/qlch-vanlanh/functions`, inspect `package.json` va `package-lock.json`.
- [ ] Chay `npm ci --dry-run` trong `.firebase/qlch-vanlanh/functions`.
- [ ] Xac minh khong con warning `Unable to bundle next.config.mjs`.
- [ ] Chay `pnpm why @zxing/library`.
- [ ] Quyet dinh pin/downgrade ZXing tuong thich Node 22 hay nang runtime sau khi verify Firebase ho tro.
- [ ] Chay deploy final: `pnpm exec firebase deploy --only hosting`.
- [ ] Smoke production: `/`, `/admin`, `/sitemap.xml`, `/cart`, `/checkout`, `/search`, `/manifest.webmanifest`.
- [ ] Smoke mot redirect trong `next.config.mjs` de xac minh config da vao SSR/deploy.
- [ ] Cap nhat `BUG-DEPLOY-007` sang fixed kem verification.

## Done Criteria

- Deploy log khong con `node-which is not recognized`.
- Deploy log khong con `esbuild not found, installing...`.
- Deploy log khong con `Unable to bundle next.config.mjs`.
- Generated functions bundle `npm ci --dry-run` pass.
- Production smoke pass cac route chinh.
- Repo khong co generated artifacts staged: `.firebase/`, `.next/`, `package-lock.json`.
