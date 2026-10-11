---
id: P1-T046
phase: 1
status: in_progress
depends_on: []
specs: ["evidence-model.md", "runtime-and-budget.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/analysis/plan.ts", "packages/pipeline/src/analysis/plan.test.ts", "packages/pipeline/src/analysis/runner.ts", "packages/pipeline/src/analysis/runner.test.ts"]
contract_change: none
expected_commit: "fix(P1-T046): pipeline 分析：預算失敗保留來源更新、避免重複分析、跨單元去重、取消後的錯誤"
---

# pipeline 分析：預算失敗保留來源更新、避免重複分析、跨單元去重、取消後的錯誤

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T022：`planAnalysis` 預算失敗時沒回 `claimUpdates`，來源變更（R2）造成的失效被丟掉 → 失敗結果也帶回更新
- P1-T022：文件已分析到目前版本＋雜湊，仍因 needs_review 事實項綁舊版本而每次重新分析 → 已有對應 analyzed 紀錄就不再分析
- P1-T022：同一次執行中先提交的事實項沒納入後續單元去重 → 每次成功提交後把新事實項加進已知清單
- P1-T022：取消後才回來的非重試錯誤（以及 R6 擋下路徑）沒把暫停狀態存檔 → attempt 已不是目前的就照暫停處理並存檔

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
- 高風險（R1、R2、R9），收官前跑對抗驗證
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有回歸測試

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：
- 已通過驗證：
- 下一步：
- Blocker：無

## 完成結果

