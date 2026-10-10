---
id: P1-T018
phase: 1
status: blocked
depends_on: ["P1-T017", "P1-T014"]
specs: ["jobs-and-messages.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/src/sites/104/", "packages/contracts/src/bridge/"]
contract_change: additive
expected_commit: "feat(P1-T018): extension：104 職缺頁擷取"
---
# extension：104 職缺頁擷取

## 目標

D16：發布門檻功能。

## 範圍

### 包含

- 使用者觸發後擷取公司、職稱、職責、條件、地點、URL、時間
- 必要欄位缺任何一個即失敗，提示改用手動貼上（R10）
- 選用欄位區分「未擷取到」與「頁面未提供」
- 送入 helper 建立 JobSnapshot（擷取方式＝自動）

### 不包含

- 私訊頁擷取（首版標尚未支援）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
- 相依 Task 的「完成結果」：P1-T017
- 相依 Task 的「完成結果」：P1-T014

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不讀頁面以外的資料；不自動觸發
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- fixture 回歸測試：每個樣本對應預期欄位；改壞 DOM 的樣本要測出失敗

### 手動驗證

- Chrome 實際職缺頁擷取一次

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：等待相依：P1-T017、P1-T014

## 完成結果
