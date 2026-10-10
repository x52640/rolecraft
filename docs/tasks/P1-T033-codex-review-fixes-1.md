---
id: P1-T033
phase: 1
status: done
depends_on: ["P1-T001", "P1-T005", "P1-T006"]
specs: ["architecture.md", "jobs-and-messages.md", "runtime-and-budget.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/contracts/src/entities/common.ts", "packages/contracts/src/entities/entities.test.ts", "packages/storage/src/transaction.ts", "packages/storage/src/transaction.test.ts", "packages/storage/src/files/", "packages/domain/src/work-job/"]
contract_change: breaking
expected_commit: "fix(P1-T033): 修正 codex review 對 P1-T001、P1-T005、P1-T006 的發現"
---

# 修正 codex review 對 P1-T001、P1-T005、P1-T006 的發現

## 目標

E4 補跑的 codex review（gpt-6.1-sol）共 7 項；協調者對照目前主線，2 項已被後續 Task 解決，5 項仍成立並在此修正。

## 範圍

### 包含

- P1-T001：`NonEmptyText` 只有空白（含全形空白）也通過 → 改為至少一個非空白字元，原文不修剪（R10 必要欄位）
- P1-T006：`transaction` 接受 async 函式、之後的失敗不回滾 → 回傳 thenable 時拋 TypeError 並回滾
- P1-T006：`FileStore.put` 遇既有檔案損壞仍回報成功 → 比對雜湊，不符就原子覆寫
- P1-T006：寫入或改名失敗留下暫存檔 → 失敗時刪除暫存檔並保留原錯誤
- P1-T005：`startUnit` 輸入多帶 `unitId` 會蓋掉選定單元 → 選定的 ID 放在展開之後

### 不包含

- P1-T001 的「生成段落原始引用」與「R6 紀錄各項依據」：已由 P1-T002（`generatedCitations`）與 P1-T010（`items`）解決

## 工作區與 Context

### 必讀入口

- `docs/specs/architecture.md`

### 不應載入

- 其他 spec

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試

## 驗證

### 自動驗證

- 新增 9 個測試（NonEmptyText 5、transaction 1、file-store 2、work-job 1）

### 手動驗證

- 無

## 完成定義

- [x] 五項修正與回歸測試
- [x] `npm run verify` 綠

## 中斷／接手紀錄

- 最後完成：五項修正
- 已通過驗證：npm run verify（Vitest 895 通過、1 略過）
- 下一步：無
- Blocker：無

## 完成結果

- 協調者直接實作五項修正；`NonEmptyText` 變嚴屬 breaking contract change，但現有測試與資料全數通過。
- 驗證：Vitest 895 通過、1 略過；test:docs 14；verify:docs 通過。
