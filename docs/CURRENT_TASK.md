# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- P1-T002 domain：事實項狀態與 R1 匯出前檢查（`docs/tasks/P1-T002-domain-evidence.md`）
- P1-T003 domain：R2 來源變更判定（`docs/tasks/P1-T003-domain-source-change.md`）
- P1-T004 domain：R8 輸入預算與拆批（`docs/tasks/P1-T004-domain-budget.md`）
- P1-T005 domain：R9 工作單元狀態機（`docs/tasks/P1-T005-domain-work-job.md`）
- P1-T006 storage：SQLite schema 與 repository（`docs/tasks/P1-T006-storage-core.md`）
- P1-T008 sources：資料夾列舉、授權集合與安全讀檔（`docs/tasks/P1-T008-sources-authorization.md`）
- P1-T009 resume-import：PDF 文字層擷取（`docs/tasks/P1-T009-resume-import-pdf.md`）
- P1-T010 providers：適配介面、環境清理與 R6 紀錄（`docs/tasks/P1-T010-providers-core.md`）
- P1-T013 驗證：橋接通訊方式（Q3）與資料夾選取機制（`docs/tasks/P1-T013-spike-bridge.md`）
- P1-T026 驗證：中文 PDF 匯出方式（`docs/tasks/P1-T026-spike-pdf-export.md`）

## ready

- 無
<!-- index:end -->

## 主樹基準

- `npm run verify` 綠；Vitest 12 檔 23 測試（P0-T001 後）。TypeScript ~6.0.3（typescript-eslint 8.71 不支援 7.x）。

## 待專案擁有者

- P1-T013：在 Arc、Edge 手動跑橋接 echo 測試（到時提供步驟）。
- P1-T017：登入 104、開幾個職缺頁協助存 DOM 樣本。
- P1-T020：提供一份 104 匯出的履歷 PDF（驗證有文字層，D18 前提）。
- P1-T031：在乾淨 macOS 使用者帳號跑安裝測試。
- P1-T032：實際跑一次完整流程。

## 待補 codex review（E4，額度恢復後逐 commit 跑）

- P0-T001 `182b16a`
- P0-T002 `9573b99`
- P1-T001 `7b4da39`

## 已知殘餘（記錄，不擋上線）

- 全域 `~/.claude/skills/spec-discuss/codex-talk.mjs` 在非 git 目錄會失敗（缺 `--skip-git-repo-check`）；本 repo 已 git init，不再受影響。

- 相依方向只有 lint 擋，typecheck 擋不住（套件 exports 指向 src）；pipeline 未啟用 Node 型別，需要 I/O 時再加。
- `.prettierignore` 排除所有 `*.md`；文件格式交給 verify:docs。

- verify:docs 只檢查 `[文字](路徑)` 連結；文件中反引號路徑不檢查（許多指向尚未建立的程式檔）。
- 手動改 Task status 後必須跑 `npm run task:index`，否則 verify:docs 擋（產生物新鮮度檢查）。

## 治理

- 進行中／ready 區塊由 `task:index` 產生；收官用 `npm run task:close -- <ID>`；其餘由協調者維護。
