---
id: P0-T001
phase: 0
status: in_progress
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
