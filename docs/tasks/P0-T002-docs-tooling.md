---
id: P0-T002
phase: 0
status: done
depends_on: ["P0-T001"]
specs: []
track: infra
primary_repo: rolecraft
write_paths: ["scripts/docs/", "package.json", "docs/tasks/INDEX.md", "docs/CURRENT_TASK.md"]
contract_change: none
expected_commit: "chore(P0-T002): 文件閘門腳本：verify:docs、task:index、task:close"
---
# 文件閘門腳本：verify:docs、task:index、task:close

## 目標

know_how 支柱 3：文件新鮮度用機器強制。

## 範圍

### 包含

- `verify:docs`：markdown 內部相對連結存在、Task ID 唯一且與檔名一致、front matter 欄位齊全且 status 合法、depends_on 指向存在的 Task、specs 指向存在的檔案、`docs/CURRENT_TASK.md` ≤ 100 行、`docs/specs/README.md` 索引與實際檔案一致
- `task:index`：從 front matter 產生 `docs/tasks/INDEX.md`（表格＋依賴清單），並更新 CURRENT_TASK 中 `<!-- index:start -->`…`<!-- index:end -->` 之間的 ready／in_progress 清單
- `task:close <ID>`：檢查 status 為 in_progress、完成結果已填且不含「未完成」「TODO」→ 改 done → 重跑 task:index → 跑 verify:docs
- `verify` 串入 `verify:docs`；腳本本身也有單元測試

### 不包含

- CI 設定檔（本專案目前無遠端）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- 相依 Task 的「完成結果」：P0-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 腳本用 TypeScript 或 Node ESM，放 `scripts/docs/`，同樣受 300 行上限
- `docs/spec-discussions/` 不受連結檢查（歷史檔）
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- `npm run verify` 綠
- `npm run task:index` 後 `git diff --exit-code docs/tasks/INDEX.md` 無差異（產生物 zero-diff）

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：三個腳本、單元測試、INDEX.md 產生、verify 串接
- 已通過驗證：`npm run verify` 綠；`npm run task:index` 無變動
- 下一步：協調者收官（可用 `npm run task:close -- P0-T002`）
- Blocker：無

## 完成結果

- 腳本在 `scripts/docs/`（Node ESM `.mjs`，無建置）：`tasks.mjs` front matter 解析、`checks.mjs` 各項檢查、`index-gen.mjs` 產生物、`close.mjs` 收官、`cli.mjs` 入口。每檔 ≤ 170 行。
- npm scripts：`verify:docs`、`task:index`、`task:close -- <ID>`、`test:docs`；`verify` 串入 `test:docs` 與 `verify:docs`。
- 用 `.mjs`＋`node --test` 而非 Vitest／TS：`vitest.config.ts`、`tsconfig.json`、`eslint.config.js` 不在 write_paths；`.mjs` 走 ESLint 的 disableTypeChecked 區塊，仍受 300 行上限。
- verify:docs 額外檢查產生物新鮮度：`INDEX.md` 與 CURRENT_TASK index 區塊必須等於 front matter 算出的內容，改 status 沒跑 task:index 會紅。
- 連結檢查略過點開頭目錄、`node_modules`、`Spec.md`、`docs/spec-discussions/`；只認 markdown `[文字](路徑)`，code 內略過。現有文件多用反引號路徑，不在檢查範圍。
- 單元測試 11 個（暫存目錄迷你 repo）：壞連結、重複 ID、檔名不一致、缺欄位、非法 status、壞 depends_on／specs、CURRENT_TASK 101+ 行、specs 索引不一致、產生物過期、task:close 拒絕（空白／含待辦字樣／非 in_progress／不存在）與成功路徑。
- 實檔紅燈（已還原）：在現有文件加壞連結、複製一份 P1-T001、CURRENT_TASK 加到 102 行，`npm run verify:docs` exit 1 並列出 5 項（含 2 項產生物過期）；還原後通過。
