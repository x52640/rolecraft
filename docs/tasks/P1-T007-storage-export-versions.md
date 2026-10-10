---
id: P1-T007
phase: 1
status: in_progress
depends_on: ["P1-T006"]
specs: ["resume-output.md"]
track: storage
primary_repo: rolecraft
write_paths: ["packages/storage/src/export/", "packages/storage/src/application/", "packages/storage/src/index.ts", "packages/storage/src/migrations/"]
contract_change: none
expected_commit: "feat(P1-T007): storage：不可變匯出版本、投遞紀錄與刪除規則"
---
# storage：不可變匯出版本、投遞紀錄與刪除規則

## 目標

R3、D19：投出去的版本要凍結，面試教練才拿得到當時內容。

## 範圍

### 包含

- ExportVersion 寫入後不可修改（repository 不提供 update；資料庫層 trigger 擋 UPDATE）
- ApplicationRecord 只能指向 ExportVersion
- 刪除素材：未投遞匯出版本整份刪除、已投遞保留並回報保留數（D19）
- 面試輸入讀取函式只讀匯出版本

### 不包含

- UI

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- 相依 Task 的「完成結果」：P1-T006

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不可變性要在資料庫層也擋，不只靠程式
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- S9-12 情境測試：投遞後改履歷、快照、事實項並刪來源，面試輸入與投遞當時一致

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
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
