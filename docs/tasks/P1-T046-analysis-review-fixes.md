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

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：四項修正與回歸測試全部完成
- 已通過驗證：`npm run verify` 全綠（2563 passed／13 skipped）
- 下一步：協調者安排高風險對抗驗證（R2、R9）後收官
- Blocker：無

## 完成結果

1. **預算失敗保留 R2 更新**：`planAnalysis` 失敗結果新增 `claimUpdates`，預算不足時來源變更造成的待複核／來源已移除照樣回傳給呼叫端保存。目前 pipeline 以外沒有呼叫端，型別擴充不影響其他套件。
2. **避免重複分析**：`needsAnalysis` 改成只看「有沒有對應目前版本＋雜湊的分析紀錄」。R2 要求重新分析的文件（片段綁的版本與現況不同）必然落在這個條件內，所以原本另外累積的 reanalyze 集合是多餘的，一併移除；綁舊版本的待複核事實項不再讓已分析的文件每次重跑。
3. **跨單元去重**：runner 內維護已知事實項清單（初值為 `existingClaims`），每次單元成功寫入後把新事實項加入，後續單元去重時一併比對。
4. **取消後才回來的錯誤**：不可重試錯誤（`other`）與 R6 擋下兩條路徑，若 attempt 已不是目前這次（使用者已取消），改成保存並回報暫停（`user_cancelled`），不再回 blocked。
5. **回歸測試**（皆先確認會失敗再修）：`plan.test.ts` 新增預算失敗仍帶更新、已分析目前版本不重跑兩項；`runner.test.ts` 新增取消後才回來的非重試錯誤／R6 擋下（與原有「結果」案例合併為參數化測試，並抽出共用輔助函式）、同次執行跨單元去重兩項。
6. 手動驗證：無（Task 未要求）。
