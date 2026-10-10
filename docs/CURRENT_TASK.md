# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- 無

## ready

- P1-T011 驗證：Claude CLI 隔離與訂閱登入
- P1-T017 驗證：104 職缺頁條款與 DOM 樣本
- P1-T019 editor：職缺快照確認與手動貼上
- P1-T020 editor：履歷 PDF 匯入與校正
- P1-T021 editor：專案資料夾匯入與預覽
- P1-T027 pdf-export：中文模板與匯出檢查
<!-- index:end -->

## 下一步（2026-10-10 協調者建議）

1. 先建並跑「橋接 contract 升級」Task（見已知殘餘），與 P1-T011、P1-T027 平行。
2. 升級完成後再平行開 P1-T019、P1-T021；P1-T017、P1-T020 等擁有者提供資料。
3. 高風險 Task 照 plan.md E3 跑對抗驗證（2 review＋2 verify）。

## 主樹基準

- `npm run verify` 綠；Vitest 886 測試通過、1 略過（只在 RUN_RACE=1 跑）；test:docs 14（2026-10-10 P1-T002 收官後）。TypeScript ~6.0.3（typescript-eslint 8.71 不支援 7.x）。

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
- P1-T015 `859b505`
- P1-T026 `9ea7487`
- P1-T003 `9cd8ec9`、`8c5bb79`（實作＋對抗驗證修正）
- P1-T016 `e1cbf9e`
- P1-T008 `55bd7f5`、`ca51f0e`
- P1-T014 `75d2b19`、`5f20554`
- P1-T010 `b44a8d2`、`c1c7725`、`5fc7ee4`
- P1-T007 `af9e0d9`、`50c8639`
- P1-T002 `8110afb`、`5b7e7db`

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

- 擴充功能（P1-T015）：橋接無請求 id，客戶端一次一則；Native Messaging host 名稱 `com.rolecraft.helper`（暫在 extension，應移至 contracts）；錯誤碼尚無「helper 未安裝」「逾時」（P1-T016／T030 需要時加）；擴充功能 ID 未固定（P1-T031）；`open_editor` 經 helper 的語意待定義；站點註冊表只有職缺頁路徑。
- PDF 匯出（ADR-0005）：HTML＋CSS 交給本機 Chrome 背景列印（puppeteer-core），附 Noto Sans TC 400／700 完整字型（+14.2 MB，D17 自用可接受），匯出前用 HarfBuzz 裁字型；缺字會被 Chrome 偷補系統字型，P1-T027 要擋。依賴本機 Chrome；Arc 啟動逾時未查明、Edge 未裝。

- 待開 Task「橋接 contract 升級」（contract_change）：請求 id（並行、P1-T027 分塊）、錯誤碼（not_implemented／helper_unavailable／timeout）、host 名稱 `com.rolecraft.helper` 與轉送通道 `rolecraft.bridge` 移入 contracts（目前 extension／editor／helper 各寫一份）、`open_editor` 語意；另 vitest 收 `*.test.tsx`。

- sources（P1-T008）：macOS 讀檔與列舉的 symlink 競態只能縮小窗口（Node 無 openat／F_GETPATH），120 秒壓測 239 萬次 0 洩漏；徹底消除需原生模組。

- providers（P1-T010）：`assertExecutablePath` 擋 sh／bash／zsh／env／node 等直譯器 basename；P1-T011 要確認官方 CLI 的實際執行檔不是經 node 啟動的腳本，否則需調整。defineCommand 以 `as`＋eslint-disable 或別名 import 仍可繞過，靠審查。

- storage（P1-T007）：`sweepStorage(db, fileStore)` 要在 helper 啟動時呼叫一次（尚未接上，下一個動 helper 的 Task 處理）。素材刪除只能經 `deleteMaterial`。

- 數字檢查（P1-T002）：fail-closed；數字後接未知字母（3D、5G、100ms、1080p）一律無法辨識需逐段確認，誤擋偏吵，可改整串字面比對；「一個／一套」等列入排除表（代價：「一個人完成」不檢查）。

## 治理

- 進行中／ready 區塊由 `task:index` 產生；收官用 `npm run task:close -- <ID>`；其餘由協調者維護。
