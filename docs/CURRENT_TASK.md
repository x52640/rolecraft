# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- P1-T044 providers／storage：Claude 版本驗證逾時與取消、清理失敗不中斷、額度狀態（`docs/tasks/P1-T044-provider-storage-review-fixes.md`）
- P1-T047 pipeline 事實檢查：句號正規化、網址邊界、職缺名稱比對、訊息草稿的完成度上限（`docs/tasks/P1-T047-grounding-review-fixes.md`）

## ready

- P1-T017 驗證：104 職缺頁條款與 DOM 樣本
<!-- index:end -->

## 下一步（2026-10-10 第二輪交接）

1. 三波全部收官：P1-T019～T025、T028～T030、T039～T041、T043（新增：原生選取器與服務組裝）。高風險 Task 皆跑對抗驗證，屬實項已修。
2. 剩下全部需擁有者：P1-T017 → 解鎖 T018；T031 等 T018；T032 驗收。下方「待擁有者裁定」先看前 5 項。
3. 建議下一批 Task（尚未建立，需擁有者同意範圍）：工作進度查詢與手動續跑操作（D21，目前 contracts 沒有）；授權集合／匯入暫存／供應商狀態／Claude 已驗證版本的持久化；domain 數字檢查認倍數詞；ProjectEvidence 產生來源。
4. 只有擁有者說「推」才 push；本機 `refs/original` 待擁有者同意後清除。

## 主樹基準

- `npm run verify` 綠；Vitest 2558 通過、13 略過（live／Chrome／race／選取器對話框，需環境變數）；test:docs 15（2026-10-10 P1-T029 收官後）。
- P1-T039 live 測試 2026-10-10 以 Claude CLI 2.1.296 跑一次：12 案例全過，模型呼叫 2 次（haiku）。

## 待專案擁有者

- 手動：P1-T013 Arc／Edge 橋接 echo；P1-T017 104 DOM 樣本；P1-T020 提供 104 PDF；P1-T043 真實選取器各選一次（`RUN_PICKER=1`）；P1-T031 乾淨帳號安裝；P1-T032 完整流程。
- 需裁定（協調者已採最保守做法先做）：
  1. 資料區位置：helper 只讀 `ROLECRAFT_DATA_DIR`／`ROLECRAFT_FONTS_DIR`，未設就不接儲存服務（P1-T040）；預設位置待 T031 定。
  2. `providers.start_login` 未做（providers 沒有經 ADR-0002 審過的登入命令），與 D10 免終端有落差（P1-T030）。
  3. R6 不通過／other 錯誤沒有專屬暫停原因，暫用 `interrupted`（P1-T022、T025）。
  4. 訊息草稿承諾字眼誤殺偏多（「期待加入」、英文 may／start 會被擋）（P1-T029）。
  5. 生成與草稿輸入預算固定保守值（上下文 200k、輸出 8k、工具 40k）（P1-T025、T029）。
  6. Claude 驗證失敗即整個服務停用、不自動重試其他版本（P1-T039）。
  7. 模型輸出 `user_confirmed_done` 整份判失敗；原文無最短長度；只做同文件矛盾（P1-T022）。
  8. 「文件標示完成」最多寫成進行中、「未知」能否被引用（P1-T024）。
  9. 選取器放在 `packages/sources/src/picker/`（helper 原始碼禁子程序）；選到非 PDF 回 internal_error（P1-T043）。
  10. 否決事實項／刪素材時回傳保留的已投遞版本數需改 contracts（P1-T023、T028）；投遞狀態是否固定選項（T028）。
  11. 多份 Profile 用哪份；匯出版本未存 Profile 印出內容的結構化快照（P1-T020、T040）。
- 協調者擴充過 write_paths 的 Task：T019～T021、T023～T025、T028～T030、T040（服務組裝、修正所需），理由記在各 commit。

## 待補 codex review

見 [REVIEW_QUEUE.md](REVIEW_QUEUE.md)（E4，擁有者說要跑才跑）。

## 已知殘餘

見 [RESIDUALS.md](RESIDUALS.md)。

## 治理

- 進行中／ready 區塊由 `task:index` 產生；收官用 `npm run task:close -- <ID>`；其餘由協調者維護。
