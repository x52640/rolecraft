# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- P1-T002 domain：事實項狀態與 R1 匯出前檢查（`docs/tasks/P1-T002-domain-evidence.md`）
- P1-T003 domain：R2 來源變更判定（`docs/tasks/P1-T003-domain-source-change.md`）
- P1-T007 storage：不可變匯出版本、投遞紀錄與刪除規則（`docs/tasks/P1-T007-storage-export-versions.md`）
- P1-T008 sources：資料夾列舉、授權集合與安全讀檔（`docs/tasks/P1-T008-sources-authorization.md`）
- P1-T010 providers：適配介面、環境清理與 R6 紀錄（`docs/tasks/P1-T010-providers-core.md`）
- P1-T014 helper：橋接端點與操作清單分派（`docs/tasks/P1-T014-helper-host.md`）
- P1-T015 extension：MV3 骨架與橋接客戶端（`docs/tasks/P1-T015-extension-skeleton.md`）
- P1-T026 驗證：中文 PDF 匯出方式（`docs/tasks/P1-T026-spike-pdf-export.md`）

## ready

- 無
<!-- index:end -->

## 主樹基準

- `npm run verify` 綠；Vitest 12 檔 23 測試（P0-T001 後）。TypeScript ~6.0.3（typescript-eslint 8.71 不支援 7.x）。

## 待專案擁有者

- P1-T013：在 Arc、Edge 手動跑橋接 echo 測試（步驟見 `docs/adr/0003-bridge-transport.md`；Edge 需先安裝）。Chrome 已自動實測通過；ADR-0003 待此項後轉「採用」。
- P1-T017：登入 104、開幾個職缺頁協助存 DOM 樣本。
- P1-T020：提供一份 104 匯出的履歷 PDF（驗證有文字層，D18 前提）。
- P1-T031：在乾淨 macOS 使用者帳號跑安裝測試。
- P1-T032：實際跑一次完整流程。

## 待補 codex review（E4，額度恢復後逐 commit 跑）

- P0-T001 `182b16a`（已審：1 項，P0-T003 修）
- P0-T002 `9573b99`（已審：2 項，P0-T003 修）
- P1-T001 `7b4da39`
- P1-T013 `3265187`
- P1-T004 `f569c68`
- P1-T005 `fb412f7`
- P1-T009 `3c5e934`
- P1-T006 `3eed0e7`

## 已知殘餘（記錄，不擋上線）

- 全域 `~/.claude/skills/spec-discuss/codex-talk.mjs` 在非 git 目錄會失敗（缺 `--skip-git-repo-check`）；本 repo 已 git init，不再受影響。

- 相依方向只有 lint 擋，typecheck 擋不住（套件 exports 指向 src）；pipeline 未啟用 Node 型別，需要 I/O 時再加。
- `.prettierignore` 排除所有 `*.md`；文件格式交給 verify:docs。

- verify:docs 只檢查 `[文字](路徑)` 連結；文件中反引號路徑不檢查（許多指向尚未建立的程式檔）。
- 手動改 Task status 後必須跑 `npm run task:index`，否則 verify:docs 擋（產生物新鮮度檢查）。

- 橋接（ADR-0003）：只由 service worker 持有 Native Messaging 連線，頁面經它轉送（避免多個 host 行程同寫 SQLite）；host→瀏覽器單則 1 MB，大資料要分塊（P1-T014、P1-T027）；編輯器必須是擴充功能頁（P1-T016）。

- 來源位置單位：budget（P1-T004）用 UTF-16 索引 [start, end)；P1-T003 定案片段位置格式時要統一。

- resume-import（P1-T009）：無文字層／亂碼／順序異常門檻皆 20%（暫定）；姓名只認有標籤寫法；中文 PDF 未實測，待 P1-T020 用擁有者 104 PDF 調整；欄位草稿是否進 contracts 由 P1-T020 決定。

- storage（P1-T006）：外部傳入時間原樣保存（未轉 UTC），清單依寫入順序；要依時間排序或查區間時，寫入改統一 UTC。ID／雜湊讀取驗證仍寬鬆（新格式只用於自產值）。

## 治理

- 進行中／ready 區塊由 `task:index` 產生；收官用 `npm run task:close -- <ID>`；其餘由協調者維護。
