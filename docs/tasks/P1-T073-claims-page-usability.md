---
id: P1-T073
phase: 1
status: in_progress
depends_on: ["P1-T063"]
specs: ["evidence-model.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/claims/", "apps/helper/src/handlers/claims/", "packages/contracts/src/bridge/editor/claims.ts", "docs/adr/0006-contracts-interim-fields.md", "docs/specs/bridge.md"]
contract_change: additive
expected_commit: "feat(P1-T073): 事實項來源顯示檔名、可一次確認多項"
---

# 事實項頁實用性

## 目標

協調者實測（2026-10-12）：分析一個 5 份文件的資料夾就產生 27 項事實項。來源顯示成「文件 6dfa176b-…」（UUID），看不出是哪個檔；確認要每項選狀態再按一次，27 項很累。

## 範圍

### 包含

- 來源顯示檔名（與資料夾名稱），不顯示內部 ID；回應相加檔名欄位
- 批次確認改良：每項可勾選，上方「把勾選的設為：已完成／計畫中 並確認」一次完成；仍只收狀態正常的項目（待確認、來源未矛盾、來源未撤銷），其他項目不能勾並說明原因；確認前顯示將確認的數量
- 「全選本專案可批次的項目」
- 保留逐項確認
- 測試：檔名顯示；批次設定狀態並確認；不可批次的項目被排除

### 不包含

- 改事實項規則（R1、完成程度規則不變）

## 工作區與 Context

### 必讀入口

- `docs/specs/evidence-model.md`、`bridge.md`（claims 段）
- `apps/editor/src/pages/claims/`、`apps/helper/src/handlers/claims/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 協調者例外允許改 contracts（相加）
- 遵守 architecture.md

## 驗證

### 自動驗證

- 見「範圍」

### 手動驗證

- 協調者以 harness 實跑

## 完成定義

- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：來源名稱（contracts 相加 `sourceNames`＋helper 附名稱）、批次列（全選、設定完成狀態並確認、送出前顯示數量）、文件更新
- 已通過驗證：`npm run verify` 綠（工作者 worktree）
- 下一步：協調者收官（範圍稽核、harness 實跑）
- Blocker：無

## 完成結果

- contracts：`claims.list`／`claims.list_unassigned` 回應相加選填 `sourceNames`（`ClaimSourceName`：`sourceDocumentId`、`name`、`rootName`），ADR-0006 #15、bridge.md 記錄。
- helper：`handlers/claims/source-names.ts` 由 storage 來源文件取檔名與資料夾名稱的最後一段（控制字元換空白、最多 200 字、空的為「（未命名）」），查不到的文件不列；兩個清單 handler 一律附上。
- 編輯器：來源顯示「檔名（資料夾 名稱）」，查不到名稱顯示「已不在來源清單的文件」，不再顯示內部 ID。新增批次列 `BatchBar.tsx`：「全選本專案（未歸專案）可批次的項目」、「清除勾選」、「把勾選的設為 已完成／計畫中」＋「設定並確認（N）」，按下先顯示將確認的數量與各類數目，再按「確定確認」才逐筆送 `claims.confirm`。只收尚未確認、複核狀態正常的項目；待複核、來源矛盾、來源已移除、已確認過的不能勾，並在卡片上說明原因。完成狀態不預設；只勾非功能類型時不需選。逐項確認保留。
- 測試：helper `source-names.test.ts`（名稱、不含路徑、查不到不列、最後一段處理）；編輯器 `ClaimsPage.batch.test.ts`（檔名顯示、不可批次排除與原因、全選＋設定並確認、只勾非功能類型與取消）；`ClaimsPage.test.ts` 改為檢查檔名顯示並移除舊批次測試。
- 手動驗證：交由協調者以 harness 實跑。
