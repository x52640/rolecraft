---
id: P1-T011
phase: 1
status: in_progress
depends_on: ["P1-T010"]
specs: ["providers.md", "open-verifications.md"]
track: providers
primary_repo: rolecraft
write_paths: ["docs/adr/0002-claude-cli-isolation.md", "scripts/spikes/claude/", "docs/specs/open-verifications.md"]
contract_change: none
expected_commit: "docs(P1-T011): 驗證：Claude CLI 隔離與訂閱登入"
---
# 驗證：Claude CLI 隔離與訂閱登入

## 目標

D13：Claude 先，但要先證明 R5 隔離與 R6 登入檢查做得到。

## 範圍

### 包含

- 實測 claude 2.1.296 旗標組合（`--tools ""`、`--safe-mode`、`--strict-mcp-config`、空暫存工作目錄、清理後環境）是否仍走訂閱登入
- 注入測試：輸入含「執行指令／讀誘餌檔／上網」要求，確認事件串流沒有工具呼叫、誘餌內容未出現、未載入使用者 CLAUDE.md／hooks／MCP
- 如何從工具本身得知登入方式（R6-1）、額度用完的錯誤長相、上下文上限來源
- 結果寫 ADR-0002，並在 open-verifications.md 對應項後註記結果與 ADR 編號

### 不包含

- 正式 adapter 實作（P1-T012）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/providers.md`
- `docs/specs/open-verifications.md`
- 相依 Task 的「完成結果」：P1-T010

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 只用擁有者既有訂閱；每次呼叫極短提示；全程確認子程序環境沒有 ANTHROPIC_API_KEY
- 不使用 `--bare`
- spike 腳本留在 `scripts/spikes/claude/` 供重跑
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- spike 腳本可重跑並輸出判定

### 手動驗證

- 無（使用擁有者已登入的 Claude CLI）

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
