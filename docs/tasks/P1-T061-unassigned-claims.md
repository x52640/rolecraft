---
id: P1-T061
phase: 1
status: in_progress
depends_on: ["P1-T060"]
specs: ["evidence-model.md", "bridge.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["docs/specs/bridge.md", "packages/contracts/src/bridge/editor/claims.ts", "packages/contracts/src/index.ts", "packages/contracts/src/bridge/operations.ts", "packages/contracts/src/bridge/__fixtures__/editor-requests.ts", "apps/helper/src/handlers/claims/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "packages/storage/src/repositories/", "apps/editor/src/pages/claims/", "apps/editor/src/bridge/", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T061): 事實項頁列出未歸專案的事實項"
---

# 事實項頁列出未歸專案的事實項

## 目標

D23：分析出的事實項還沒有任何專案可歸，事實項頁只列專案內的事實項，所以使用者一條都看不到、無法確認。本 Task 讓「未歸專案」的事實項也能列出並逐條確認、修改、否決，解除測試阻塞。專案分組本身是 P1-T063。

## 範圍

### 包含

- bridge.md 先寫規則，再改 contracts（只做相加）：新操作 `claims.list_unassigned`，回所有不屬於任何 ProjectEvidence 的事實項（含狀態與來源片段），排除已刪除素材；排序固定（建議依來源文件、再依建立順序，選一個並寫進規則）
- helper `handlers/claims/`：handler＋service 方法，storage 實作在 helper 端算「不在任何專案 claimIds 裡」
- 編輯器事實項頁：
  - 專案清單為空時也要顯示「未歸專案」區，不再只顯示「沒有專案」
  - 專案選單多一個「未歸專案」選項；有未歸專案事實項時，沒選專案就預設顯示它
  - 確認、修改、否決沿用既有元件與既有競態保護（P1-T057），完成後重新讀取同一清單
  - 分析結束後的重新整理（P1-T060）也要涵蓋這個清單

### 不包含

- 專案建立、分組、移動事實項（P1-T063）
- 已有 `claims.list` 行為變更

## 工作區與 Context

### 必讀入口

- `plan.md` D23
- `docs/specs/evidence-model.md`、`docs/specs/bridge.md`（claims 段）
- P1-T023、T057、T060 完成結果
- `apps/editor/src/pages/claims/useClaimsReview.ts`、`ClaimsPage.tsx`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 中風險（R1 確認動作走既有路徑，不得另開確認捷徑）
- 協調者例外允許本 Task 改 contracts、分派表（worker 規則 10 對本 Task 不適用）；不改 `handlers/services.ts`、`main.ts`
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- helper：有專案＋未歸專案事實項時，`claims.list_unassigned` 只回未歸的；已刪除素材不回；沒有資料區回 not_implemented
- 編輯器：零專案時看得到未歸專案事實項並能確認；確認後清單更新；切換專案與未歸專案時不串資料（既有競態測試同等保護）

### 手動驗證

- 擁有者分析資料夾後在事實項頁逐條確認（需擁有者，併 P1-T032）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：bridge.md 規則、contracts 新操作 `claims.list_unassigned`、helper handler／service、編輯器事實項頁「未歸專案」區與測試
- 已通過驗證：worktree 內 `npm run verify` 全綠
- 下一步：協調者收官；擁有者手動驗證併 P1-T032
- Blocker：無

## 完成結果

- bridge.md claims 段新增 `claims.list_unassigned`：回不在任何專案引用清單裡的事實項（含狀態與來源片段），已否決（刪除）的不列出，排序固定為建立順序。
- contracts 只做相加：`claims.ts` 新 schema、`operations.ts` 列舉加一行、contracts 與 helper 兩份 fixture 各加一行。新增操作必須動 `operations.ts` 與 contracts fixture，原 write_paths 漏列，已依協調者「允許改 contracts」補進 front matter。
- helper：`handlers/claims/list-unassigned.ts`＋`ClaimsService.listUnassigned`；storage 實作在同一交易讀專案與事實項，在 helper 端過濾，未改 storage repository。分派表加一行。
- 編輯器：專案選單多「未歸專案」選項（值為空字串，專案 ID 不可能是空字串）；零專案時也顯示選單與未歸專案清單；沒選過時，有未歸專案事實項或沒有專案就預設未歸專案，否則第一個專案。確認、修改、否決沿用既有元件與 `run`／`reload`，競態保護沿用 `currentProject` 比對；分析完成後的重新整理同樣涵蓋未歸專案清單。
- 測試：helper `list-unassigned.test.ts`（只回未歸、建立順序、零專案、否決後不列、確認後狀態、未接服務 not_implemented）；編輯器 `ClaimsPage.unassigned.test.ts`（零專案確認並重讀、預設選擇、切換競態、分析完成重讀）；既有編輯器假 helper 補回應 `claims.list_unassigned`。
- 手動驗證需擁有者（真實資料夾分析），併 P1-T032。
