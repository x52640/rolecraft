---
id: P1-T012
phase: 1
status: in_progress
depends_on: ["P1-T011"]
specs: ["providers.md"]
track: providers
primary_repo: rolecraft
write_paths: ["packages/providers/src/claude/", "packages/providers/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T012): providers：Claude 適配器"
---
# providers：Claude 適配器

## 目標

D13：第一條端到端訂閱路線。

## 範圍

### 包含

- 依 ADR-0002 實作 Claude adapter：偵測、登入檢查、模型清單、隔離執行、取消、錯誤分類
- S9-13 注入測試轉成可重跑的整合測試（預設跳過，`RUN_LIVE=1` 才跑）

### 不包含

- Codex、Antigravity adapter（另開 Task）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/providers.md`
- 相依 Task 的「完成結果」：P1-T011

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不得使用 ADR-0002 判定不安全的旗標
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 單元測試用錄製的 CLI 輸出；live 測試手動觸發

### 手動驗證

- `RUN_LIVE=1` 跑一次注入測試，結果記入完成結果

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
