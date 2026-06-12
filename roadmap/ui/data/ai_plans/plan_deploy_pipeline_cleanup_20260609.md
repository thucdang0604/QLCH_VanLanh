# Firebase Deploy Pipeline Cleanup - 2026-06-09

## Summary

Chuan hoa pipeline deploy Firebase Hosting/Frameworks de khong con loi/canh bao gay nhiem log trong qua trinh deploy SSR. Muc tieu la deploy co the lap lai, khong phu thuoc vao `npx` tu cai goi tam thoi, khong de Firebase CLI bo qua bundle `next.config.mjs`, va co preflight bat som cac van de generated Cloud Functions bundle.

## Current Symptoms

- Firebase Hosting Frameworks tao Cloud Function vi project co middleware, route revalidate va nhieu route dynamic/SSR.
- Trong buoc bundle `next.config.mjs`, Firebase CLI goi `npx which esbuild` nhung Windows bao `'node-which' is not recognized`.
- Firebase CLI fallback sang `npm install esbuild@^0.19.2 --no-save`, nhung npm fail voi tarball `closure-net` va loi `Cannot read properties of null (reading 'matches')`.
- CLI tiep tuc deploy voi warning: `Unable to bundle next.config.mjs for use in Cloud Functions, proceeding with deploy but problems may be encountered`.
- Npm canh bao `@zxing/library@0.22.0` yeu cau Node `>=24`, trong khi project va Firebase function dang dung Node 22.

## Risk Assessment

- Neu deploy van complete, app co the van chay, nhung `next.config.mjs` co nguy co khong duoc bundle day du vao Cloud Function.
- Cac cau hinh co the bi anh huong: `headers()`, `redirects()`, CSP/security headers, va mot so hanh vi SSR/revalidate.
- Loi `node-which`/`esbuild` la loi deploy toolchain local/Firebase CLI, khong phai loi UI/PWA hay TypeScript.
- Canh bao Node engine cua `@zxing/library` chua phai blocker, nhung la debt can xu ly de tranh mot lan deploy sau chuyen thanh loi strict engine.

## Implementation Plan

### Batch 0 - Freeze Evidence

- Luu lai ket qua deploy cuoi cung: `Deploy complete` hay fail.
- Neu fail, thu thap 50-100 dong log cuoi va file npm debug log tai `C:\Users\thucd\AppData\Local\npm-cache\_logs\...`.
- Ghi nhan version toolchain: `node -v`, `npm -v`, `pnpm -v`, `firebase --version`, `where node`, `where npm`, `where npx`.

### Batch 1 - Reproduce Locally

- Chay lai tu trang thai sach generated artifact: clean `.firebase/` va `.next/`.
- Verify source gate: `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Chay deploy dry/debug neu co the: `pnpm exec firebase deploy --only hosting --debug`.
- Xac dinh loi xuat hien truoc hay sau khi `.firebase/qlch-vanlanh/functions` duoc sinh.

### Batch 2 - Make esbuild Deterministic

- Them `esbuild` thanh direct devDependency voi version phu hop Firebase Frameworks dang tim (`^0.19.2`) thay vi de CLI fallback `npm install --no-save`.
- Neu can, them `which`/tooling phu hop de lenh tim binary tren Windows khong phu thuoc package tam thoi cua `npx`.
- Them script preflight kiem tra binary: `node_modules/.bin/esbuild` ton tai va chay duoc.
- Khong them npm lockfile; van dung `pnpm-lock.yaml`.

### Batch 3 - Validate Generated Functions Bundle

- Sau khi Firebase Frameworks sinh `.firebase/qlch-vanlanh/functions`, kiem tra:
  - `package.json` co `packageManager`, `engines.node`, `firebase-frameworks`, `next`, `sharp: 0.33.5`.
  - `package-lock.json` khong lech dependency.
  - `npm ci --dry-run` pass trong `.firebase/qlch-vanlanh/functions`.
- Xac minh warning `Unable to bundle next.config.mjs` khong con xuat hien.
- Neu warning van con, inspect cach Firebase CLI bundle `next.config.mjs` va tach/lam phang config neu can.

### Batch 4 - Resolve Node Engine Warning

- Chay `pnpm why @zxing/library` de xac dinh dependency nao keo `@zxing/library@0.22.0`.
- Danh gia 2 huong:
  - Pin/downgrade `@zxing/browser`/`@zxing/library` ve version tuong thich Node 22 neu khong can tinh nang moi.
  - Chi nang Node runtime khi Firebase Functions da xac nhan ho tro runtime moi va Cloud Build tuong thich.
- Khong nang Node runtime chi de xoa warning neu co nguy co lam SSR Firebase fail.

### Batch 5 - Deploy Verification

- Chay `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Chay generated bundle check: `.firebase/qlch-vanlanh/functions` + `npm ci --dry-run`.
- Deploy: `pnpm exec firebase deploy --only hosting`.
- Smoke production:
  - `/`
  - `/admin`
  - `/sitemap.xml`
  - `/cart`
  - `/checkout`
  - `/search`
  - `/manifest.webmanifest`
  - Mot route redirect trong `next.config.mjs`
- Xac nhan deploy log khong con `node-which`, `esbuild not found`, `Unable to bundle next.config.mjs`, va khong con warning engine neu batch 4 da xu ly.

## Guardrails

- Khong commit `.firebase/`, `.next/`, npm cache, hoac `package-lock.json` root.
- Khong thay doi logic UI/PWA de sua loi deploy toolchain.
- Khong nang Node runtime neu chua verify Firebase Functions/Hosting Frameworks ho tro runtime do.
- Neu deploy local pass nhung Cloud Build fail, uu tien inspect generated functions bundle thay vi sua source app.
