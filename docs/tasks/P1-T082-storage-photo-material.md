---
id: P1-T082
phase: 1
status: ready
depends_on: ["P1-T074"]
specs: ["resume-output.md", "architecture.md"]
track: storage
primary_repo: rolecraft
write_paths: ["packages/storage/src/migrations/", "packages/storage/src/repositories/photo-repository.ts", "packages/storage/src/repositories/index.ts", "packages/storage/src/application/", "packages/storage/src/export/", "packages/storage/src/index.ts", "packages/storage/src/__fixtures__/"]
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等 P1-T074 收官後改 ready
- Blocker：無（相依 P1-T074 已於 2026-10-12 收官）

## 完成結果
