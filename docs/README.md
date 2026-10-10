# 治理規則

## 權威順序

1. `plan.md`：目標、邊界、決策記錄（裁定的唯一家）
2. `docs/specs/`：技術定義（索引 `docs/specs/README.md`）
3. `docs/adr/`：決策理由，解釋 spec，不覆蓋 spec
4. `docs/tasks/`：可執行任務；只引用 spec，不重抄欄位、狀態、規則
5. `docs/CURRENT_TASK.md`：現在在飛什麼（100 行上限）

`Spec.md` 與 `docs/spec-discussions/` 是歷史來源，不是現行需求。

## 三鐵律

1. **先裁定再實作**：新議題先進 `plan.md` 決策記錄（含日期），再開 Task。
2. **一概念一家**：文件互相矛盾＝停止實作，先修權威文件或開前置 Task。
3. **一 Task 一 commit**：格式 `type(任務ID): 成果`，可獨立 revert；commit hash 不寫進產生它的 commit。

## Task 規則

- 模板：`docs/tasks/_TEMPLATE.md`；檔名 `<ID>-<slug>.md`；front matter 是唯一真相。
- `status`：`ready`（相依已完成，可開工）／`in_progress`／`done`／`blocked`（相依未完成或等擁有者，原因寫在中斷紀錄 Blocker）。
- 只有 `ready`／`in_progress` 可以實作。一次只飛一個主 Task。
- 變更只能在 `write_paths` 內；超出就停下回報。
- 「中斷／接手紀錄」四行隨時更新，不是收官才寫。
- 需要擁有者提供的東西（樣本、登入狀態、手動瀏覽器操作）寫進 CURRENT_TASK「待專案擁有者」。

## 閘門

- `npm run verify` ＝ format 檢查＋lint（含單檔 300 行、相依方向）＋typecheck＋測試＋文件檢查。本地與 CI 同一條。
- 文件更新是完成定義的一部分。

## 協調者收官（多 agent 時）

工作者在獨立 worktree 實作、單一 commit、不 push。協調者：合併 → 範圍稽核（commit 檔案 vs write_paths）→ 關鍵 hunk 稽核 → 主環境重跑 `npm run verify` → 能實測的實測 → 收官（Task 標 done、回填完成結果、更新 CURRENT_TASK）。
