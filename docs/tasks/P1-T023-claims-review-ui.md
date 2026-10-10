---
id: P1-T023
phase: 1
status: done
depends_on: ["P1-T022", "P1-T016"]
specs: ["evidence-model.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/claims/", "apps/helper/src/handlers/claims/", "apps/helper/src/main.ts", "packages/contracts/src/bridge/editor/claims.ts", "docs/specs/bridge.md", "apps/helper/src/bridge/__fixtures__/", "packages/contracts/src/bridge/__fixtures__/"]
contract_change: breaking
expected_commit: "feat(P1-T023): editor：事實項檢視與確認"
---
# editor：事實項檢視與確認

## 目標

D14：使用者逐項確認，確認一次之後所有職缺都能重用。

## 範圍

### 包含

- 依專案列出事實項、狀態、來源片段（可點開原文位置）
- 確認、修改、刪除；批次確認同專案項目
- 待複核／來源已移除／來源矛盾的處理

### 不包含

- 生成

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T022
- 相依 Task 的「完成結果」：P1-T016

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 確認動作記錄時間與當下文字
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [ ] `npm run verify` 綠（範圍外兩個既有測試要協調者調整，見完成結果「需範圍外調整」）
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：對抗驗證 4 項修正（改字需重新確認、確認比對畫面狀態、否決順序、刪除警告）
- 已通過驗證：暫時把 `apps/extension/src/relay/editor-ops.test.ts` 的確認請求補上 `expectedReviewStatus` 時 `npm run verify` 全綠（2201 通過、11 略過；test:docs 15）；該調整在範圍外，已還原未提交
- 下一步：協調者補上該測試欄位後收官
- Blocker：範圍外測試 `apps/extension/src/relay/editor-ops.test.ts`（claims.confirm 請求要加 `expectedReviewStatus: 'normal'`）

## 完成結果

- 結構：helper `apps/helper/src/handlers/claims/`：`service.ts`（介面）、`storage-service.ts`（`createClaimsService({ db, fileStore, now? })`）、`failure.ts`（固定錯誤訊息）、六個 handler。editor `apps/editor/src/pages/claims/`：`ClaimsPage.tsx`、`ClaimCard.tsx`、`ClaimSources.tsx`、`useClaimsReview.ts`（資料與動作）、`labels.ts`、`claims.css`。
- 確認（R1、D14）：請求必帶 `expectedReviewStatus`（畫面當時的複核狀態），helper 在同一交易比對，不符回 invalid_request（固定訊息）且不寫入，畫面隨後重新讀取（R2，contract_change: breaking）。時間只由 helper 的 `now()` 決定，請求多帶 `confirmedAt` 被 schema 擋；用 domain `confirmClaim` 記錄時間與確認當下文字，功能／交付物只能確認成「使用者確認完成」或「計畫中」，非功能類型帶完成狀態、功能沒帶都拒絕且不寫入。讀→改→寫在同一交易。
- 修改：內容有變 → 清除使用者確認，舊來源不再替新文字背書：複核狀態改待複核（來源已移除維持），有完成狀態的一律退回「未知」，要重新確認。內容沒變不動。
- 否決：先在自己的交易移除所有專案 `claimIds` 中的引用，再經 storage `deleteMaterial`（D19）刪除原件並記入已刪素材；第二步失敗時重試可完成；事實項已不存在但仍有專案引用時清掉引用並回成功。之後 get／confirm／update 都回 invalid_request。
- 錯誤：找不到或規則不允許一律 `invalid_request`，固定訊息、不回填 ID 或內容。
- 接線：`createServices(storage?)` 只在提供 `{ db, fileStore }` 時接上 claims；`main()` 仍不帶 storage（資料庫位置與開啟方式尚未定案），所以實際執行時 claims 仍回 not_implemented。
- 畫面：依專案列出事實項，每項左邊是內容、類型、完成狀態、複核狀態、確認紀錄，右邊並列來源原文（可展開收合，預設展開，標文件 ID、版本、第幾段）。「文件標示完成」註明尚未確認、不等於完成；確認後內容改過顯示需重新確認。功能／交付物的「確認為」沒有預設值，要自己選。修改要按儲存並提示確認失效；刪除要按兩次並說明未投遞匯出版本會一併刪除、已投遞的會保留（含此事實項的副本）。批次確認只收勾選且複核正常的項目，所選功能有任一項沒選完成狀態就一項都不送。每次寫入後重新從 helper 讀取。
- 測試：helper `claims.test.ts`（dispatch→handler→真實 SQLite，17 項）與 `claims-review.test.ts`（10 項：改數字後 domain `checkExportReadiness` 判不可用、三種完成狀態改字退回未知、畫面看到正常但實際來源矛盾被拒且不寫入、刪素材失敗後重試完成），共用 `__fixtures__/claims-db.ts`；editor `ClaimsPage.test.ts`（9 項，含狀態過時被拒後重新讀取）。
- 保守選擇：(1) 待複核／來源矛盾／來源已移除不能批次確認，只能逐項；(2) 修改後完成狀態一律退回「未知」、複核狀態改待複核；(3) 否決＝D19 刪除素材，會連帶刪除引用它的未投遞匯出版本（畫面先警告）。
- 需範圍外調整（未改）：`apps/extension/src/relay/editor-ops.test.ts` 的 claims.confirm 請求缺新必填欄位 `expectedReviewStatus`。
- 需擁有者裁定：(1) 確認只比對複核狀態，不比對來源片段內容（狀態不變但片段被 rebase 的情況不擋）；(2) `claims.reject` 回 Ack，無法回傳保留的已投遞版本數（需改 contracts），目前只在刪除警告文字中說明；(3) 否決後若來源文件重新分析，pipeline 可能再產生同內容的事實項（pipeline 未查已刪素材）；(4) 「點開原文位置」目前只顯示片段原文與位置，沒有讀整份文件的橋接操作；(5) 專案（ProjectEvidence）尚無產生者，pipeline 只產事實項，所以實際使用時清單會是空的；(6) helper 的資料庫位置與開啟方式。
