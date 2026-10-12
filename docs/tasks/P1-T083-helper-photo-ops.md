---
id: P1-T083
phase: 1
status: ready
depends_on: ["P1-T082", "P1-T079"]
specs: ["resume-output.md", "bridge.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/photo/", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "packages/sources/src/picker/", "packages/sources/src/index.ts", "packages/pdf-export/src/photo/", "packages/pdf-export/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T083): helper：照片選取、重新編碼去中繼資料，photo.pick／get／remove"
---

# helper：照片選取與處理、photo.* 操作

## 目標

使用者選本機照片，helper 重新編碼成 JPEG、縮到最長邊 1,200 px、去掉所有中繼資料後設為目前照片；提供查詢與刪除。

## 範圍

### 包含

- 系統選取器：只限 JPEG／PNG、10 MB 以下（比照 PDF 選取器）；請求沒有路徑
- 影像處理：解碼 → 重新編碼 JPEG、最長邊 1,200 px、去掉 EXIF（GPS、裝置）等全部中繼資料；解不開就拒絕；必須在選取器處理餘裕內完成，超過放棄、不寫入。做法優先用匯出已在用的 Chrome（puppeteer-core）重繪，放 `packages/pdf-export/src/photo/`；要新增 npm 相依先停下回報
- `photo.pick`：選定且處理成功即生效（更換走 P1-T082 的同一交易）；回照片資訊與縮圖；取消回 cancelled，已有選取視窗開著回 busy
- `photo.get`（回應低於 1 MiB）、`photo.remove`（套 D19）
- `main.ts` 組裝照片服務

### 不包含

- 編輯器照片區塊（P1-T085）
- 匯出印照片（P1-T084）
- 從網頁抓照片

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`「照片」
- `docs/specs/bridge.md`（photo 列、選取器逾時）
- P1-T082 完成結果；`packages/sources/src/picker/pdf-picker.ts`、`apps/helper/src/handlers/import/pick-pdf.ts`、`packages/pdf-export/src/render/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資：照片中繼資料（GPS、裝置）必須去除；照片不得進任何提示）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- write_paths 含 `packages/pdf-export/src/index.ts`，與 P1-T084 同時跑時 P1-T084 不得改該檔
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 帶 EXIF／GPS 的合成 JPEG 與 PNG：存下的結果沒有任何中繼資料、最長邊不超過 1,200 px
- 超過 10 MB、非 JPEG／PNG、解不開被拒；處理逾時不寫入
- 取消不變動；`photo.get` 回應低於 1 MiB

### 手動驗證

- 擁有者或協調者用 `RUN_PICKER=1` 真實選取器選一張照片一次

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等相依完成後改 ready
- Blocker：無（相依已於 2026-10-12 收官）

## 完成結果
