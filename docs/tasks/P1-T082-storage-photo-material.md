---
id: P1-T082
phase: 1
status: in_progress
depends_on: ["P1-T074"]
specs: ["resume-output.md", "architecture.md"]
track: storage
primary_repo: rolecraft
write_paths: ["packages/storage/src/migrations/", "packages/storage/src/repositories/photo-repository.ts", "packages/storage/src/repositories/index.ts", "packages/storage/src/application/", "packages/storage/src/export/", "packages/storage/src/index.ts", "packages/storage/src/__fixtures__/", "packages/storage/src/migrate.test.ts"]
contract_change: none
expected_commit: "feat(P1-T082): storage：目前照片、匯出版本記照片，刪除與更換照片套 D19"
---

# storage：照片保存與照片素材的 D19 刪除

## 目標

資料庫保存唯一一張目前照片（不放檔案儲存區），匯出版本記照片 ID 與雜湊；刪除與更換照片照 D19 處理含這張照片的匯出版本。

## 範圍

### 包含

- migration：照片表（照片 ID、JPEG 內容、格式、寬高、雜湊、建立時間），同時最多一張；匯出版本相加照片 ID 與雜湊欄
- repository：讀目前照片、加入（配發新照片 ID）、更換（刪舊＋加新同一交易）、刪除
- 素材：照片列為素材種類，以照片 ID 記入已刪素材；刪除或更換時含舊照片、未投遞的匯出版本整份刪除（PDF 走待刪紀錄），已投遞的保留並明示；建立匯出版本遇到已刪照片 ID 就拒絕
- 刪掉後再選同一張照片（雜湊相同、新照片 ID）不會被擋
- 照片不放檔案儲存區，孤兒清掃不碰它

### 不包含

- 影像處理與選取器（P1-T083）
- 匯出時印照片（P1-T084）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`「照片」、R3
- `plan.md` D19
- P1-T074 完成結果；`packages/storage/src/application/materials.ts`、`material-deletion.ts`、`pending-pdf-deletions.ts`、`export/export-version-repository.ts`、`export/pdf-cleanup.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（D19 素材刪除，會刪匯出 PDF）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 刪除照片：含它的未投遞匯出版本與 PDF 刪除、已投遞保留；更換同上且新照片寫入在同一交易（中途失敗兩者都不變）
- 刪掉後再加入同一張照片，新匯出不被擋；以已刪照片 ID 建匯出版本被拒
- 孤兒清掃不刪照片；migration 對既有資料庫可升級

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：2026-10-12 「包含」各項已實作並 commit（工作者 worktree，未 push）
- 已通過驗證：`npm run verify` 綠
- 協調者 2026-10-12 擴充 write_paths：加 `packages/storage/src/migrate.test.ts`（新增 photos 表需同步寫死的資料表清單，前例 P1-T064）
- 下一步：協調者收官；高風險 Task，收官前跑對抗驗證（E3）與 codex review（尚未跑）
- Blocker：無

## 完成結果

- migration `0009_photos.sql`：`photos` 表（slot 固定 1 且唯一＝最多一張；內容存資料庫、不進檔案區）；觸發器 `photos_no_update`、`photos_no_reuse_deleted_id`、`photos_record_deleted`、`export_versions_no_deleted_photo`；`deleted_materials` 重建讓 kind 加 `photo`（先拿掉 0003 四個觸發器、搬資料改名後原樣建回）；`export_versions` 加由 JSON 產生的 `photo_id`、`photo_sha256` 欄與索引
- `repositories/photo-repository.ts`：`get`、`add`（已有照片拒絕）、`readCurrentPhoto`、`insertPhoto`；無刪除
- `application/photo-material.ts`：`removePhoto`、`replacePhoto`（刪舊加新同一交易），套 D19：含該照片的未投遞匯出版本整份刪除、PDF 走待刪紀錄，已投遞保留並回報；`material-deletion.ts` 拆出 `deleteMaterialRows`／`finishMaterialDeletion`（`deleteMaterial` 行為不變）；`materials.ts` 加 `photo` 種類，以照片 ID 判斷
- 匯出建立：已刪照片 ID 被已刪素材檢查與資料庫觸發器兩層拒絕；照片不是目前照片（ID 或雜湊不符）也拒絕
- 測試：`application/photo-material.test.ts`、`application/photo-storage.test.ts` 共 18 案例（刪除、更換、更換中途失敗全不變、刪後再加同一張不被擋、孤兒清掃不碰照片、直接 SQL 刪照片由清掃補做 D19、0008→0009 升級）
- 保守選擇：(1) 刪除與更換放 application 層、repository 不給刪除（同其他素材）；(2) 匯出照片須是目前照片，不只擋已刪；(3) 沒照片時更換＝加入、刪除不動也不記紀錄；(4) 不存縮圖（由 P1-T083 處理）
- 規格落差：(1) Task 寫 repository 負責更換與刪除，但 D19 要刪 PDF、repository 拿不到檔案區，故放 `application/photo-material.ts`；(2) `ExportVersion.photo.sha256` 是寬鬆 `ContentHash`、`Photo.sha256` 是 `Sha256Hash`，storage 與目前照片比對所以實際等同嚴格，契約未改
