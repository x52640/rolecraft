# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/`（P0-T002 之後由 `task:index` 產生 `docs/tasks/INDEX.md`）。

<!-- index:start -->
## 進行中

- P0-T002 文件閘門腳本（`docs/tasks/P0-T002-docs-tooling.md`）

## ready

- P1-T001 contracts 核心資料物件
- P1-T013 驗證：橋接通訊方式
- P1-T026 驗證：中文 PDF 匯出方式
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

## 已知殘餘（記錄，不擋上線）

- 全域 `~/.claude/skills/spec-discuss/codex-talk.mjs` 在非 git 目錄會失敗（缺 `--skip-git-repo-check`）；本 repo 已 git init，不再受影響。

- 相依方向只有 lint 擋，typecheck 擋不住（套件 exports 指向 src）；pipeline 未啟用 Node 型別，需要 I/O 時再加。
- `.prettierignore` 排除所有 `*.md`；文件格式交給 verify:docs。

## 治理

- 進行中／ready 區塊由 `task:index` 產生（P0-T002 之前手寫）；其餘由協調者維護。
