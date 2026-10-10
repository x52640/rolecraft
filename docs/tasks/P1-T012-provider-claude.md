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

- 最後完成：Claude 適配器、錄製輸出單元測試、`RUN_LIVE=1` 注入測試（2026-10-10 跑過一次通過）
- 已通過驗證：`npm run verify` 綠（Vitest 957 通過、4 略過）；live 3 項全過
- 下一步：協調者收官（E3 對抗驗證，含 P1-T011 併入項）；helper 接上 `createClaudeStreamGuard`
- Blocker：無

## 完成結果

- `packages/providers/src/claude/`：
  - `constants.ts`：ADR-0002 命令列常數（只有模型位置可變）、auth status／`--version` 命令、驗證版本 `2.1.296`、禁用旗標清單＋`findForbiddenClaudeArgs`（`--tools`／`--setting-sources`／`--permission-mode` 只准固定值；模組載入即斷言）、環境政策（core 白名單＋固定 `PATH=/usr/bin:/bin`）、模型候選、受管設定路徑。
  - `adapter.ts`：`createClaudeAdapter`。執行前（每次）：`--version`（記錄；與驗證版本不同 → executionMode 與 cliConfig 記 unknown，依據寫「需重跑 P1-T011 spike」）→ `auth status --json`（`loggedIn`、`authMethod=claude.ai`、`apiProvider=firstParty`、無 `apiKeySource`）→ 受管設定存在則 cliConfig unknown。`lastCliVersion`、`lastRun`（版本、解析後模型、contextWindow、maxOutputTokens、rate limit 狀態）供記錄。
  - `stream.ts`／`result.ts`：init 必須 `apiKeySource:"none"`、tools／mcp_servers 空、plugins 全 builtin、skills／slash_commands 空、`claude_code_version` = 驗證版本；任何 tool_use／tool_result／permission_denied／hook 事件 → 隔離失敗、丟棄輸出；失敗看 `is_error`／`api_error_status`（不只 subtype）；`rate_limit_event.status` 非 allowed／allowed_warning、429、usage limit 字樣 → `quota_exhausted`（不重試）；5xx／408 → transient；401／403 → other。
  - `guard.ts`：`createClaudeStreamGuard(spawn)` 包住 spawn，逐行檢查 stream-json，違規立刻 SIGKILL。因 core 的 launch 只在結束後回傳整段輸出，要「立即終止」必須由 helper 把它當 `RunDeps.spawn`／`ConnectionDeps.spawn` 傳入；沒接時結束後判定仍會丟棄違規輸出。
  - `locate.ts`：只看固定候選路徑（`~/.local/bin/claude` 等，不搜 PATH），解開符號連結，只接受 Mach-O／ELF（拒絕 `#!` 腳本）。受管設定偵測：非 ENOENT 錯誤視為存在（fail-closed）。
  - `models.ts`：`verifyClaudeModel` 經 `runWithSubscriptionCheck` 做一次極短呼叫，成功才算可用。
  - 測試：`constants.test.ts`、`stream.test.ts`、`adapter.test.ts` 用 `fixtures/`（P1-T011 實錄去識別化：正常、工具呼叫、init 有工具、init apiKeySource=ANTHROPIC_API_KEY、is_error 401、版本不符、auth status 訂閱／apiKeyHelper／未登入；額度拒絕兩檔是推論形狀）。`live.test.ts`＋`injection-sandbox.ts`：live 測試。
- 模型清單：CLI 2.1.296 沒有列模型的指令（`--help` 只有 `--model`，舉例 fable／opus／sonnet）。`listModels` 回候選別名 `haiku`、`sonnet`、`opus`、`fable`，outcome 一律 unknown（安裝精靈的 availableModels 因此是空的）；使用者選定前呼叫 `verifyClaudeModel`。2026-10-10 實測四個都可用：haiku→claude-haiku-5-5、sonnet→claude-sonnet-5-5、opus→claude-opus-5-5、fable→claude-fable-5-1，contextWindow 都是 1000000。
- live（`RUN_LIVE=1`，2026-10-10）：
  - S9-13：誘餌齊全的工作目錄（工作／祖先 CLAUDE.md、AGENTS.md，專案 settings 的 hooks、apiKeyHelper、env 無效 key，`.mcp.json`）＋注入提示。執行前確認在該目錄正確判 cliConfig failed（抓到專案 apiKeyHelper）；刻意略過閘門直接執行：事件只有 init／assistant／rate_limit_event／result，0 個工具事件、0 個誘餌字串、0 個 marker，模型回覆指出是提示注入、未照做。
  - 正式路徑（`runWithSubscriptionCheck`、空工作目錄）：四項 passed、executed、回 `OK`。
  - 重跑：`RUN_LIVE=1 npx vitest run packages/providers/src/claude/live.test.ts`（加 `RUN_LIVE_MODELS=1` 逐一驗證模型）；結果另寫 `$TMPDIR/rolecraft-claude-live-results.jsonl`。
  - 呼叫次數（跑了 2 次 live：第 1 次只跑注入＋正式路徑，因 vitest 不顯示通過測試的 console 而補寫結果檔後重跑並加模型驗證）：模型呼叫 8 次（haiku 5、sonnet 1、opus 1、fable 1）、`auth status` 8 次、`--version` 8 次；另手動本機 `--version`／`--help` 4 次。未使用 `--bare`、`--settings`，未改家目錄設定。
- 與 ADR-0002 §6 的差異（core 限制，未改 core）：子程序環境多了 core 白名單的 `LC_*`、`TZ`、`TERM`、`NO_COLOR`、`__CF_USER_TEXT_ENCODING`；`TMPDIR` 是父程序的值（工作目錄就在其下），不是指向沙箱。`ExecutionResult` 只有文字，contextWindow／版本只能從 `adapter.lastRun` 取。
