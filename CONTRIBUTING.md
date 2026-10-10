# 參與 RoleCraft

> How to contribute: read the cold-start docs, one task per commit, keep `npm run verify` green, never commit personal data or keys.

RoleCraft 目前是作者自用的開發中專案（[plan.md](plan.md) D17）。歡迎回報問題；送程式變更前請先讀完本頁。

## 冷啟動：改任何檔案之前

照 [CLAUDE.md](CLAUDE.md) 的冷啟動協定（人與 AI agent 都一樣）：

1. 讀 [plan.md](plan.md)：邊界與決策記錄。
2. 讀 [docs/README.md](docs/README.md)：權威順序、Task 規則、閘門。
3. 讀 [docs/CURRENT_TASK.md](docs/CURRENT_TASK.md)：現在在做什麼。
4. 讀你要做的 Task（[docs/tasks/INDEX.md](docs/tasks/INDEX.md)），以及它引用的 spec／ADR。
5. Task 狀態不是 `ready` 或 `in_progress` 就不要實作。

`Spec.md` 與 `docs/spec-discussions/` 是歷史來源，不是現行需求。新議題要先在 `plan.md` 決策記錄拿到裁定，再開 Task。

## 變更規則

- **一個 Task 一個 commit**，格式 `type(任務ID): 成果`，例：`feat(P1-T019): 職缺快照確認頁`。每個 commit 要能獨立 revert。
- 只改 Task front matter 的 `write_paths` 範圍內的檔案；需要超出就停下來說明。
- 改了 Task 的 `status` 要跑 `npm run task:index` 更新索引。
- 文件更新是完成的一部分：Task 的「中斷／接手紀錄」與「完成結果」要回填。

## 品質閘門

送出前 `npm run verify` 必須全綠（格式、lint、typecheck、測試、文件檢查，本地與 CI 同一條）。

verify 最常擋的問題：單一原始碼檔超過 300 行、違反套件相依方向（見 [docs/specs/architecture.md](docs/specs/architecture.md)）、Markdown 連結指向不存在的檔案。

## 不得提交

- 個人資料：真實履歷、真實姓名與聯絡方式、職缺頁或招募訊息的原始擷取內容。測試請用虛構資料。
- 金鑰與憑證：API key、token、cookie、`.env`，即使是「看起來像」真金鑰的假字串也避免。
- 本機產物：SQLite 資料庫、匯出的 PDF、`dist/`。

## 不會接受的方向

違反 [plan.md](plan.md) 核心限制的變更不會合併，例如：接額外計費 API、回退使用環境中的 API key、擷取 cookie 或憑證、讓外部內容決定執行指令、自動送出訊息或投遞。

## 授權

提交即同意你的貢獻以 [MIT](LICENSE) 授權釋出。
