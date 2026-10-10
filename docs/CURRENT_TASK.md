# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- P1-T022 pipeline：文件分析成事實項（`docs/tasks/P1-T022-pipeline-analysis.md`）
- P1-T039 Claude CLI 版本變更時自動重新驗證（`docs/tasks/P1-T039-claude-auto-reverify.md`）
- P1-T041 橋接：編輯器頁面所需操作清單（`docs/tasks/P1-T041-bridge-editor-ops.md`）
- P1-T042 README 與開源說明文件（`docs/tasks/P1-T042-readme.md`）

## ready

- P1-T017 驗證：104 職缺頁條款與 DOM 樣本
<!-- index:end -->

## 下一步（2026-10-10 收官，等擁有者指示）

1. 候選（皆不需擁有者資料）：P1-T019、P1-T021、P1-T039（D22，高風險需對抗驗證）、「helper 匯出接線」（待建，見 RESIDUALS.md）、README。
2. P1-T017、P1-T020 等擁有者提供 104 頁面／PDF。
3. repo 已公開於 https://github.com/x52640/rolecraft（MIT）；只有擁有者說「推」才 push。本機 git email 已設 noreply。
4. 歷史改寫（2026-10-10）留下的本機 `refs/original` 與 scratchpad bundle 待擁有者同意後清除。

## 主樹基準

- `npm run verify` 綠；Vitest 1137 通過、9 略過（live／Chrome／race 測試，需環境變數才跑）；test:docs 15（2026-10-10 P1-T038 收官後）。TypeScript ~6.0.3（typescript-eslint 8.71 不支援 7.x）。

## 待專案擁有者

- P1-T013：在 Arc、Edge 手動跑橋接 echo 測試（步驟見 `docs/adr/0003-bridge-transport.md`；Edge 需先安裝）。Chrome 已自動實測通過；ADR-0003 待此項後轉「採用」。
- P1-T017：登入 104、開幾個職缺頁協助存 DOM 樣本。
- P1-T020：提供一份 104 匯出的履歷 PDF（驗證有文字層，D18 前提）。
- P1-T031：在乾淨 macOS 使用者帳號跑安裝測試。
- P1-T032：實際跑一次完整流程。

## 待補 codex review

見 [REVIEW_QUEUE.md](REVIEW_QUEUE.md)（E4，擁有者說要跑才跑）。

## 已知殘餘

見 [RESIDUALS.md](RESIDUALS.md)。

## 治理

- 進行中／ready 區塊由 `task:index` 產生；收官用 `npm run task:close -- <ID>`；其餘由協調者維護。
