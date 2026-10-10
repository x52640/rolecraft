---
id: P1-T021
phase: 1
status: blocked
depends_on: ["P1-T008", "P1-T016", "P1-T014", "P1-T041"]
specs: ["sources-and-authorization.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/projects/", "apps/helper/src/handlers/sources/"]
contract_change: none
expected_commit: "feat(P1-T021): editor：專案資料夾匯入與預覽"
---
# editor：專案資料夾匯入與預覽

## 目標

F03、R4：可累積 10 個以上資料夾，預覽後才讀。

## 範圍

### 包含

- 依 ADR-0003 的選取機制連續新增資料夾
- 列舉預覽、勾選／移除檔案或資料夾、確認後建立授權集合
- 增量更新時顯示待確認的新檔

### 不包含

- 分析（P1-T022）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/sources-and-authorization.md`
- 相依 Task 的「完成結果」：P1-T008
- 相依 Task 的「完成結果」：P1-T016
- 相依 Task 的「完成結果」：P1-T014

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不接受外部傳入路徑
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試；S9-5 以 10 個暫存資料夾的整合測試

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
- Blocker：等待相依：P1-T041

## 完成結果
