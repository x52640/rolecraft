---
id: P0-T001
phase: 0
status: done
depends_on: []
specs: ["architecture.md"]
track: infra
primary_repo: rolecraft
write_paths: ["package.json", "package-lock.json", "tsconfig.base.json", "tsconfig.json", "eslint.config.js", ".prettierrc", ".prettierignore", ".gitignore", "vitest.config.ts", "packages/", "apps/"]
contract_change: none
expected_commit: "chore(P0-T001): monorepo 骨架與 verify 閘門"
---
# monorepo 骨架與 verify 閘門

## 目標

E1：先把模組邊界與單檔行數上限變成機器規則，之後所有 Task 都在這個框裡寫。

## 範圍

### 包含

- npm workspaces 根設定；`architecture.md`「模組切分」表列的 11 個套件各建 `package.json`、`tsconfig.json`、`src/index.ts`（只放匯出佔位）與一個 smoke 測試
- TypeScript strict＋ESM＋project references；Vitest；Prettier；ESLint flat config
- ESLint 規則：非測試原始碼 `max-lines` 300；套件相依方向（依 `architecture.md` 表格，用 `no-restricted-imports` 或等效規則）；禁止跨套件 deep import
- 根 scripts：`format:check`、`lint`、`typecheck`、`test`、`verify`（依序串起來；`verify:docs` 先留空殼，由 P0-T002 補）

### 不包含

- 任何業務邏輯
- apps 的建置設定（Vite、MV3 打包由各自 Task 處理）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/architecture.md`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不加裝全域工具（沒有 pnpm）
- zod 只裝在 contracts
- 相依方向規則要有一個「故意違規」的測試或 lint fixture 證明會擋
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- `npm install && npm run verify` 綠
- 刻意在某套件寫 301 行檔案或違規 import，lint 會紅（驗完刪掉）

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：骨架、lint 規則、邊界自我測試全部完成，待協調者收官
- 已通過驗證：`npm install && npm run verify` 綠（12 檔 23 測試）
- 下一步：協調者合併、稽核、標 done
- Blocker：無

## 完成結果

- 11 個 workspace 套件（`packages/*` 8 個、`apps/*` 3 個），各有 `package.json`（`exports` 指向 `src/index.ts`）、`tsconfig.json`（composite，references 依相依表）、`src/index.ts` 佔位、smoke 測試。zod 只裝在 contracts。
- 工具版本：TypeScript ~6.0.3（7.x 不被 typescript-eslint 8.71 支援，peer `<6.1.0`）、ESLint 10、typescript-eslint 8.71（recommendedTypeChecked）、Prettier 3.9、Vitest 5、@types/node 26。
- TS：strict、NodeNext、`verbatimModuleSyntax`、`erasableSyntaxOnly`、相對 import 寫 `.ts`（`rewriteRelativeImportExtensions`）。`types` 預設空；只有 storage、sources、resume-import、providers、pdf-export、helper 開 `node` 型別（domain 不得 I/O，contracts／pipeline／extension／editor 也不給）。
- ESLint 規則（`eslint.config.js`）：非測試／fixture 檔 `max-lines` 300；每套件 `no-restricted-imports` 白名單（依 architecture.md 表）；`@rolecraft/*/**` deep import 禁止；zod 只限 contracts；本地規則 `rolecraft/no-relative-cross-package` 擋相對路徑跨出套件。
- 永久 fixture：`apps/helper/src/module-boundaries.test.ts` 用 ESLint API 對虛擬檔驗證 違規 import／deep import／相對跨套件／zod／301 行 會紅、300 行與測試檔不紅（12 個測試）。
- 實檔紅燈驗證（已刪）：在 `packages/domain/src` 放 301 行檔與 `import '@rolecraft/storage'`，`npm run lint` exit 1，報 `max-lines` 與 `no-restricted-imports` 各 1；刪除後 `npm run verify` exit 0。
- `verify:docs` 為空殼（印提示），P0-T002 補。`.prettierignore` 排除 `*.md`（不讓 Prettier 改中文文件）。
