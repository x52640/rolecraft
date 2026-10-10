# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- P1-T024 pipeline：職缺匹配與段落生成（`docs/tasks/P1-T024-pipeline-resume-gen.md`）
- P1-T040 helper：匯出接線（`docs/tasks/P1-T040-helper-export-wiring.md`）

## ready

- P1-T017 驗證：104 職缺頁條款與 DOM 樣本
<!-- index:end -->

## 下一步（2026-10-10 交接）

1. 第一波（已就緒，交接前停掉、無殘留）：P1-T041 橋接編輯器操作、P1-T022 pipeline 分析、P1-T039 CLI 自動重新驗證、P1-T042 README。T041、T022、T039 是高風險，收官前用 `scripts/coordinator/adversarial-verify.workflow.js` 跑對抗驗證。
2. 之後：第二波（等 T041）P1-T019、T020、T021、T028、T030、T040；第三波 P1-T023、T024、T025、T029。
3. 需擁有者：P1-T017（104 頁面）、P1-T020 手動驗證（104 PDF）、T031、T032。
4. repo 公開於 https://github.com/x52640/rolecraft；只有擁有者說「推」才 push。本機 git email 已設 noreply。
5. 歷史改寫留下的本機 `refs/original` 待擁有者同意後清除。

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
