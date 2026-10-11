---
id: P1-T049
phase: 1
status: done
depends_on: []
specs: ["bridge.md"]
track: review
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/", "apps/editor/src/pages/jobs/", "apps/editor/src/pages/projects/", "apps/editor/src/pages/messages/"]
contract_change: none
expected_commit: "fix(P1-T049): 編輯器：匯入、職缺、專案、訊息頁的競態與表單修正"
---

# 編輯器：匯入、職缺、專案、訊息頁的競態與表單修正

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T019：存檔後重新載入完成前就解除鎖定，期間輸入被蓋掉 → busy 維持到 load 完成
- P1-T020：在核對畫面按「改選其他檔案」後取消，目前的核對被清掉 → 取消或失敗時回到原畫面
- P1-T020：單一日期「2020-01」被當成區間 → 區間結尾必須是日期或「至今」
- P1-T020：經歷描述延續到下一頁時被丟掉 → 用（頁碼、行序）判斷範圍
- P1-T021：存檔中仍可勾選項目 → 存檔／重新載入時停用勾選
- P1-T029：存檔期間的新編輯被標成已存 → 只有內容等於送出內容時才清除未存狀態
- P1-T029：卸載後進行中的輪詢會重新排程 → 卸載後不再排程或更新狀態

### 不包含

- 已被後續修正解決、已知殘餘或需擁有者裁定的項目（見 docs/CURRENT_TASK.md）

## 工作區與 Context

### 必讀入口

- 範圍內各項提到的原 Task 檔完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 中風險，不跑對抗驗證
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有回歸測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：七項修正與回歸測試全部完成
- 已通過驗證：`npm run verify`（worktree 內）
- 下一步：交協調者合併
- Blocker：無

## 完成結果

七項都先寫回歸測試、確認在原程式上失敗，再修正：

| 項目 | 修正 | 測試 |
|---|---|---|
| 職缺：存檔後重新讀取前就解鎖 | `SnapshotDetail` 的 `run` 改成 try/finally，鎖定維持到 `load()` 完成 | `JobsPage.test.ts`（延遲 `jobs.get`） |
| 匯入：改選檔案後取消會清掉核對 | `pick()` 記住按下時的畫面，取消或失敗時回到原畫面（表單內容保留） | `ImportPage.test.ts` |
| 匯入：「2020-01」被當成區間 | 區間結尾必須是日期或「至今／present」等字，否則整段當起日 | `form-model.test.ts` |
| 匯入：描述延續到下一頁被丟掉 | 改用（頁碼、行序）判斷「在本段公司之後、下一段公司之前」 | `form-model.test.ts` |
| 專案：存檔中仍可勾選 | `busy` 往下傳給每一層 `EntryRow`，存檔／重新列舉時停用勾選 | `ProjectsPage.test.tsx` |
| 訊息：存檔期間的新編輯被標成已存 | 用 ref 記住最新草稿，回來時只有內容等於送出內容才清除未存狀態；本機訊息記錄的草稿更新為送出的版本（那才是實際存下的內容） | `MessagesPage.test.ts` |
| 訊息：卸載後輪詢仍重新排程 | 加 `disposed` ref，卸載後不再排程、不再更新狀態（StrictMode 重掛時會重設） | `MessagesPage.test.ts` |

手動驗證：無（Task 規定）。

