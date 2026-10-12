# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- P1-T062 Claude 重新驗證：中斷不算失敗、失敗只綁版本、可手動重新啟用（`docs/tasks/P1-T062-claude-reverify-recovery.md`）
- P1-T063 AI 建議專案分組、使用者確認建立，重新分析自動歸入（`docs/tasks/P1-T063-project-grouping.md`）

## ready

- P1-T017 驗證：104 職缺頁條款與 DOM 樣本
<!-- index:end -->

## 下一步（2026-10-11 codex 補審後）

1. 第二輪 14 個 Task 已跑 codex review（見 REVIEW_QUEUE「第二輪補審」）；仍成立的 29 項由 P1-T044～T050 修完並收官，T044～T047 另跑對抗驗證、屬實項已修。
2. 第三輪：P1-T044～T054 的 17 個程式 commit 已跑 codex review，仍成立項由 P1-T055～T057 修正並收官（T055、T056 另跑對抗驗證，T056 屬實 7 項已修）；T055～T057 本身未再跑 codex review。
3. 第四批已收官：P1-T058 持久化、P1-T059 開發安裝腳本、P1-T060 分析流程接進 helper；T058、T060 對抗驗證屬實項已修，三者 codex review 已跑。
   第五批（2026-10-12 擁有者裁定 D23、D24）：P1-T061 未歸專案事實項、P1-T062 Claude 重新驗證恢復（平行）→ P1-T063 專案分組。三者都跑對抗驗證＋codex review。
4. 剩下全部需擁有者：P1-T017 → 解鎖 T018；T031 等 T018；T032 驗收。下方「待擁有者裁定」先看前 5 項；#12～#16 已裁定並實作。
5. 其餘建議（尚未建立）：匯入暫存持久化。
6. 只有擁有者說「推」才 push；本機 `refs/original` 待擁有者同意後清除。

## 主樹基準

- `npm run verify` 綠；Vitest 2955 通過、13 略過（live／Chrome／race／選取器對話框，需環境變數）；test:docs 15（2026-10-11 P1-T060 收官後）。
- P1-T039 live 測試 2026-10-10 以 Claude CLI 2.1.296 跑一次：12 案例全過，模型呼叫 2 次（haiku）。

## 待專案擁有者

- 手動：兩個真實瀏覽器同時開，確認第二個顯示占用提示（P1-T052、T054）；P1-T013 Arc／Edge 橋接 echo；P1-T017 104 DOM 樣本；P1-T020 提供 104 PDF；P1-T043 真實選取器各選一次（`RUN_PICKER=1`）；P1-T031 乾淨帳號安裝；P1-T032 完整流程。
- 需裁定（協調者已採最保守做法先做）：
  1. 資料區位置：helper 只讀 `ROLECRAFT_DATA_DIR`／`ROLECRAFT_FONTS_DIR`，未設就不接儲存服務（P1-T040）；預設位置待 T031 定。
  2. `providers.start_login` 未做（providers 沒有經 ADR-0002 審過的登入命令），與 D10 免終端有落差（P1-T030）。
  3. R6 不通過／other 錯誤沒有專屬暫停原因，暫用 `interrupted`（P1-T022、T025）。
  4. 訊息草稿承諾字眼誤殺偏多（「期待加入」、英文 may／start 會被擋）（P1-T029）。
  5. 生成與草稿輸入預算固定保守值（上下文 200k、輸出 8k、工具 40k）（P1-T025、T029）。
  6. （已由 D24 裁定，P1-T062 實作）Claude 驗證失敗即整個服務停用、不自動重試其他版本（P1-T039）。
  7. 模型輸出 `user_confirmed_done` 整份判失敗；原文無最短長度；只做同文件矛盾（P1-T022）。
  8. 「文件標示完成」最多寫成進行中、「未知」能否被引用（P1-T024）。
  9. 選取器放在 `packages/sources/src/picker/`（helper 原始碼禁子程序）；選到非 PDF 回 internal_error（P1-T043）。
  10. 否決事實項／刪素材時回傳保留的已投遞版本數需改 contracts（P1-T023、T028）；投遞狀態是否固定選項（T028）。
  11. 多份 Profile 用哪份；匯出版本未存 Profile 印出內容的結構化快照（P1-T020、T040）。
- 協調者擴充過 write_paths 的 Task：T019～T021、T023～T025、T028～T030、T040、T044、T046、T047（服務組裝、修正所需），理由記在各 commit。

## 擁有者已裁定（2026-10-11，已實作）

- #12 拿掉匯入頁「暫存校正」→ P1-T051。
- #13 一個資料區只准一個 helper，第二個瀏覽器顯示「正在另一個瀏覽器使用中」→ P1-T052、T054。
- #14 D19 PDF 刪不掉擋啟動（含刪素材／刪投遞紀錄留下的，靠待刪紀錄表）；一般孤兒只記錄 → P1-T052。
- #15 重新授權且內容指紋相同時恢復事實項；撤銷期間確認或修改過就不恢復 → P1-T053。
- #16 職缺名稱比對維持嚴格。
- P1-T053 未定的邊界（已採保守）：使用者已確認的事實項撤銷時不保存也不恢復；撤銷期間只有非引用段落改動也不恢復；撤銷中途變待確認則清掉保存值。

## 待補 codex review

見 [REVIEW_QUEUE.md](REVIEW_QUEUE.md)（E4，擁有者說要跑才跑）。

## 已知殘餘

見 [RESIDUALS.md](RESIDUALS.md)。

## 治理

- 進行中／ready 區塊由 `task:index` 產生；收官用 `npm run task:close -- <ID>`；其餘由協調者維護。
