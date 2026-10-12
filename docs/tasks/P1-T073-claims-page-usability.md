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

- 對抗驗證（2026-10-12）屬實項：
  - 批次列選的完成狀態送出後沒清，下一批不選就沿用「已完成」→ 送出後重設為未選；未選時「設定並確認」停用
  - 子資料夾同名檔（2023/週報.md、2024/週報.md）顯示一樣 → 名稱改為授權資料夾內的相對路徑（仍不含授權資料夾以上路徑），bridge.md 同步

- codex 審查待修（2026-10-12，修正 commit b91ab53 的 codex review，協調者寫入）：
  1. （P2，路徑外洩）`helper/handlers/claims/source-names.ts` 先修剪、截斷路徑片段，再判斷是否在授權資料夾內：root `/Users/me/project` 時 `/Users/me/project /private/report.md`、含 `..` 的路徑被誤判在內，顯示成 `private/report.md`，露出資料夾外的目錄名；前 100 字相同的不同目錄也會撞名。先用正規化、未截斷的路徑判斷是否在內，再只對結果做顯示用的清理；不在內就退回只顯示檔名。
  - 補測試（含上述三種輸入）。

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

- 最後完成：codex 審查 1 項（source-names.ts 先用正規化、未截斷的完整路徑判斷是否在資料夾內，再清理顯示名）；先寫測試重現三種輸入皆屬實
- 已通過驗證：`npm run verify` 綠（工作者 worktree）
- 下一步：協調者 codex review 本修正 diff
- Blocker：無

## 完成結果

- contracts：`claims.list`／`claims.list_unassigned` 回應相加選填 `sourceNames`（`ClaimSourceName`：`sourceDocumentId`、`name`、`rootName`），ADR-0006 #16、bridge.md 記錄。
- helper：`handlers/claims/source-names.ts` 由 storage 來源文件取名稱：檔名是授權資料夾內的相對路徑（同名、不同子資料夾可區分；絕對路徑去掉資料夾前綴，資料夾外只給最後一段，`..` 丟掉，每段控制字元換空白、最多 100 字，超過 8 段只留最後 8 段），資料夾只取名稱最後一段；授權資料夾以上的路徑不出現；查不到的文件不列；兩個清單 handler 一律附上。
- 編輯器：來源顯示「相對路徑（資料夾 名稱）」，查不到名稱顯示「已不在來源清單的文件」，不再顯示內部 ID。新增批次列 `BatchBar.tsx`：「全選本專案（未歸專案）可批次的項目」、「清除勾選」、「把勾選的設為 已完成／計畫中」＋「設定並確認（N）」，按下先顯示將確認的數量與各類數目，再按「確定確認」才逐筆送 `claims.confirm`。只收尚未確認、複核狀態正常的項目；待複核、來源矛盾、來源已移除、已確認過的不能勾，並在卡片上說明原因。完成狀態不預設、送出後重設為未選，未選時「設定並確認」停用（只套用在功能／交付物，其他類型只確認內容）。逐項確認保留。
- 測試：helper `source-names.test.ts`（相對路徑、不含 `/Users`、查不到不列、同名不同子資料夾的回歸、路徑清理）；編輯器 `ClaimsPage.batch.test.ts`（檔名顯示、不可批次排除與原因、全選＋設定並確認、未選不能送與取消、送出後重設的回歸）；`ClaimsPage.test.ts` 改為檢查檔名顯示並移除舊批次測試。
- 手動驗證：交由協調者以 harness 實跑。

### codex 審查項修正（2026-10-12）

- 重現：root `/Users/me/project` 時 `/Users/me/project /private/report.md`、`/Users/me/project/../private/report.md`，以及前 100 字相同的不同目錄，舊實作都顯示 `private/report.md`（露出資料夾外目錄名）；三種皆屬實。
- 修正：`helper/handlers/claims/source-names.ts` 新增 `normalizedSegments`（原樣分段、`..` 往上、超出起點視為無法判斷）；`relativeNameOf` 先用它比對資料夾與文件完整路徑（相對路徑視為相對於資料夾），在內才去前綴後清理顯示；不在內只給原始路徑最後一段（`.`／`..` 給「（未命名）」）。相對路徑 `../../x/y.md` 走出資料夾，改為只顯示 `y.md`（原測試預期同步修改）。
- 測試：`source-names.test.ts`「先用完整路徑判斷在不在資料夾內：資料夾外的目錄名不出現（回歸：codex 審查）」，換回舊實作會失敗。
