---
id: P1-T003
phase: 1
status: in_progress
depends_on: ["P1-T001"]
specs: ["evidence-model.md"]
track: domain
primary_repo: rolecraft
write_paths: ["packages/domain/src/source-change/", "packages/domain/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T003): domain：R2 來源變更判定"
---
# domain：R2 來源變更判定

## 目標

D4：來源改了，舊的確認不能照樣沿用。

## 範圍

### 包含

- 文件切區塊（標題或空行分隔）
- 新舊版本比對：引用片段所在區塊未變／有變／片段消失 → 對應事實項狀態
- 來源刪除或撤銷授權 → 來源已移除規則
- 同文件或跨文件矛盾標示的資料結構（矛盾偵測本身由 pipeline 判斷，這裡只處理標記與狀態）

### 不包含

- 重新分析流程（P1-T022）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 純函式
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- S9-15 的四種情境各一組測試

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
