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

- 最後完成：spike（`scripts/spikes/claude/`）實測 16 次 CLI 呼叫（模型 10 次），ADR-0002 寫完，open-verifications 已註記
- 已通過驗證：isolated-injection 全項 PASS（3 次）；對照組證明誘餌有效；`npm run verify` 綠
- 下一步：協調者收官（E3 對抗驗證）；P1-T012 依 ADR-0002 §6 實作
- Blocker：無

## 完成結果

- 結論：Claude 過得了 R5／R6，D13 不需改走 Codex。詳見 `docs/adr/0002-claude-cli-isolation.md`。
- 正式命令列：`-p --model <MODEL_SLOT> --output-format stream-json --verbose --tools "" --strict-mcp-config --setting-sources "" --safe-mode --disable-slash-commands --no-chrome --no-session-persistence --permission-mode dontAsk`，提示走 stdin。
- 關鍵發現：HOME 必須是真實 HOME（假 HOME／`CLAUDE_CONFIG_DIR` 會登出）；`--safe-mode` 擋 CLAUDE.md／外掛／hooks／claude.ai 連接器但不擋 settings 的 apiKeyHelper／env，`--setting-sources ""` 兩者缺一不可；`--settings` 即使在隔離旗標下仍會改走 API key，必須禁用；`--strict-mcp-config` 擋不住 claude.ai 連接器（靠 safe-mode）。
- R6-1：`claude auth status --json` 的 `authMethod`（claude.ai／api_key_helper）＋ init 事件 `apiKeySource`（none 才是訂閱）。
- R8：只能從 result 的 `modelUsage.<模型>.contextWindow` 取得。R9：串流有 `rate_limit_event`（status、utilization、resetsAt）。
- spike：`scripts/spikes/claude/`（run／cases／fixtures／lib），預設只印計畫，`--live` 才呼叫。
- 殘餘：本機訊息 socket `/tmp/cc-socks/<pid>.sock` 關不掉；CLI 每次改寫 `~/.claude.json`；受管設定不受隔離旗標影響；使用者層 apiKeyHelper 被忽略是推論（靠執行前 auth status 擋）。
