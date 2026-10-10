# Current Task

上限 100 行，只放指標。任務總表：`docs/tasks/INDEX.md`（`npm run task:index` 產生）。

<!-- index:start -->
## 進行中

- P1-T035 codex 補審修正：domain（預算、來源變更、數字檢查）（`docs/tasks/P1-T035-review-fixes-domain.md`）
- P1-T036 codex 補審修正：storage、sources、resume-import（`docs/tasks/P1-T036-review-fixes-data.md`）
- P1-T037 codex 補審修正：providers 取消終止與 Claude spike 腳本（`docs/tasks/P1-T037-review-fixes-providers.md`）
- P1-T038 codex 補審修正：pdf-export、104 擷取提示、task:close（`docs/tasks/P1-T038-review-fixes-output.md`）

## ready

- P1-T017 驗證：104 職缺頁條款與 DOM 樣本
- P1-T019 editor：職缺快照確認與手動貼上
- P1-T020 editor：履歷 PDF 匯入與校正
- P1-T021 editor：專案資料夾匯入與預覽
<!-- index:end -->

## 下一步（2026-10-10，等擁有者指示）

1. 第二輪候選：P1-T019、P1-T021（P1-T034 已完成，可平行）；「helper 匯出接線」Task 待建（見 RESIDUALS.md）。
2. P1-T017、P1-T020 等擁有者提供資料；Claude CLI 更新策略 A／B 待擁有者決定。
3. 高風險 Task 照 plan.md E3 跑對抗驗證（2 review＋2 verify）。

## 主樹基準

- `npm run verify` 綠；Vitest 1092 通過、8 略過（live／Chrome／race 測試，需環境變數才跑）；test:docs 14（2026-10-10 P1-T012 收官後）。TypeScript ~6.0.3（typescript-eslint 8.71 不支援 7.x）。

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
