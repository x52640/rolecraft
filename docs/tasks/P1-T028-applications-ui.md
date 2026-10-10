---
id: P1-T028
phase: 1
status: blocked
depends_on: ["P1-T027", "P1-T041"]
specs: ["resume-output.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/applications/", "apps/helper/src/handlers/applications/"]
contract_change: none
expected_commit: "feat(P1-T028): editor：投遞紀錄"
---
# editor：投遞紀錄

## 目標

F09、R3：記錄實際投出的版本。

## 範圍

### 包含

- 新增主動投遞／受邀、日期、狀態
- 實際投出只能選匯出版本
- 刪除素材時顯示保留的已投遞版本數（D19）

### 不包含

- 站內履歷外部版本（D20 待驗證後另開）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- 相依 Task 的「完成結果」：P1-T027

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 匯出≠投遞
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試

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
- Blocker：等待相依：P1-T027

## 完成結果
