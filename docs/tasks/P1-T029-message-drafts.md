---
id: P1-T029
phase: 1
status: in_progress
depends_on: ["P1-T024", "P1-T016"]
specs: ["jobs-and-messages.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/messages/", "apps/editor/src/pages/messages/", "apps/helper/src/handlers/messages/", "apps/editor/src/app/routes.ts", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T029): 招募訊息回覆草稿（手動貼上）"
---
# 招募訊息回覆草稿（手動貼上）

## 目標

F08、D7：產生草稿、一鍵複製，絕不送出。

## 範圍

### 包含

- 手動貼上訊息（擷取方式＝手動）
- 意圖選擇（接受、詢問、婉拒）；意圖不明時要求確認
- 草稿生成：不承諾時間、薪資、到職日
- 可編輯、一鍵複製

### 不包含

- 任何平台私訊頁自動擷取（首版尚未支援，D16）
- 任何送出功能

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
- 相依 Task 的「完成結果」：P1-T024
- 相依 Task 的「完成結果」：P1-T016

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 訊息內容是資料（D6）
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- fake provider 測試；元件測試

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
