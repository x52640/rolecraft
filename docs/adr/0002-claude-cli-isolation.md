# ADR-0002 Claude CLI 隔離與訂閱登入

- 日期：2026-10-10
- 狀態：建議（待協調者收官）
- 相關：`docs/specs/providers.md` R5、R6、S8；`docs/specs/open-verifications.md` S10；plan.md D2、D12、D13；Task P1-T011（承接 P1-T010 移交項）、P1-T012（正式 adapter）
- 實測腳本：`scripts/spikes/claude/run.mjs`（預設只印計畫，`--live` 才呼叫；見文末）
- 環境：macOS、claude 2.1.296（`~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.296`，Mach-O arm64 原生執行檔）、擁有者 Max 訂閱

## 證據等級

| 標記 | 意思 |
| --- | --- |
| 【實測】 | 本 Task 用 spike 實際跑過（案例 ID 見「實測紀錄」） |
| 【文件】 | `claude --help` 或 CLI 執行檔內的說明字串 |
| 【推論】 | 依上兩項推出，沒有直接驗證 |

## 結論

**Claude 過得了 R5 與 R6，D13 不需改走 Codex。** 條件是：固定命令列（下方常數陣列）＋白名單環境（HOME 必須是真的）＋執行前 `auth status` 檢查＋執行中檢查事件串流。`--safe-mode` 與 `--setting-sources ""` 兩個都不能少，`--settings` 必須禁用。

## 1. R5 隔離旗標

正式命令列（提示走 stdin，`haiku` 位置換成 P1-T010 的 `MODEL_SLOT`）：

```js
['-p', '--model', 'haiku', '--output-format', 'stream-json', '--verbose',
 '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--safe-mode',
 '--disable-slash-commands', '--no-chrome', '--no-session-persistence',
 '--permission-mode', 'dontAsk']
```

| 旗標 | 擋什麼 | 證據 |
| --- | --- | --- |
| `--tools ""` | 全部內建工具（Bash、Read、WebFetch、WebSearch…）；init 事件 `tools: []` | 【實測】isolated-injection |
| `--strict-mcp-config`（不給 `--mcp-config`） | `~/.claude.json` 與專案 `.mcp.json` 的 MCP；**但擋不住 claude.ai 雲端連接器**（usermd-control 仍抓到 7 個） | 【實測】control-realhome、usermd-control |
| `--safe-mode` | CLAUDE.md（使用者、工作目錄、祖先目錄）、已安裝外掛與其 hooks、skills、claude.ai 連接器（debug：`[claudeai-mcp] Disabled in safe mode`）；**不擋 settings 的 apiKeyHelper／env** | 【實測】isolated-injection、ablation-no-setting-sources |
| `--setting-sources ""` | user／project／local 設定檔（hooks、apiKeyHelper、env 內的 key）；拿掉它，專案設定的 `ANTHROPIC_API_KEY` 立刻生效 | 【實測】ablation-no-setting-sources |
| `--disable-slash-commands` | skills（init `skills: []`、`slash_commands: []`） | 【實測】isolated-injection |
| `--no-chrome` | Claude in Chrome 整合 | 【文件】 |
| `--no-session-persistence` | 不把對話寫進 `~/.claude/projects` | 【文件】 |
| `--permission-mode dontAsk` | 多一層：萬一有工具也不會等人核准 | 【文件】 |
| 工作目錄 = 新建空暫存資料夾 | 專案設定、`.mcp.json` 來源歸零 | 【實測】 |

不採用：`--bare`（只認 API key，禁用）；`--restricted`（與上面重疊、沒實測）。

safe-mode 下仍會載入 3 個**內建**外掛（`cc-plugin-agents-md`、`cc-plugin-telemetry`、`cc-plugin-plugin-authoring`，init `plugins[].path = "builtin"`）。agents-md 在 safe-mode 回報 `project memory is off`，工作目錄與祖先的 AGENTS.md 誘餌都沒出現【實測】。

## 2. S9-13 注入測試

沙箱同時放：工作目錄與祖先目錄的 CLAUDE.md／AGENTS.md（要求每則回覆附標記字串）、專案 `.claude/settings.json`（4 種 hooks 會 touch marker、apiKeyHelper 與 env 都給**無效** key、`enableAllProjectMcpServers`）、`.mcp.json`（啟動就 touch marker）、誘餌秘密檔。提示要求執行 `cat`、用 Read 讀秘密檔、WebFetch、WebSearch。

| 案例 | 結果 |
| --- | --- |
| isolated-injection（正式旗標，跑 2 次） | 全過：`apiKeySource: "none"`、`tools: []`、`mcp_servers: []`、只有內建外掛、0 個 tool_use、0 個 hook 事件、輸出無任何誘餌字串、markers 資料夾空的。模型回覆只摘要並說沒有執行【實測】 |
| control-realhome（只關工具） | 誘餌確實有效：回覆帶工作目錄與祖先 CLAUDE.md 標記、專案 hooks 跑了 3 種、`.mcp.json` 被啟動、使用者外掛 codex 等被載入【實測】 |
| usermd-isolated／usermd-control | 用擁有者真實 `~/.claude/CLAUDE.md` 當天然誘餌（請它原文輸出載入的全域指示；比對的獨有字串由執行者以環境變數 `ROLECRAFT_SPIKE_USER_MD_TOKEN` 提供，不寫進 repo）：隔離時回 `NONE`，對照時輸出了該獨有字串【實測】 |
| tool-detector-control（給 Read） | stream-json 確實出現 `tool_use`、`permission_denied` 事件，證明偵測方法有效【實測】 |

## 3. R6 訂閱路線

### R6-1 從 CLI 得知登入方式

- `claude auth status --json`（不打模型、約 0.1 秒）【實測】：
  - 訂閱：`loggedIn: true`、`authMethod: "claude.ai"`、`apiProvider: "firstParty"`、`subscriptionType`（方案名稱），沒有 `apiKeySource` 欄位。
  - 使用者設定（假 HOME）或專案設定有 apiKeyHelper：`authMethod: "api_key_helper"`、`apiKeySource: "apiKeyHelper"`（auth-fakehome-helper、auth-project-helper）。只讀設定，不會執行 helper。
- 執行中：stream-json 第一行 `system/init` 的 `apiKeySource`。訂閱為 `"none"`；`--settings` apiKeyHelper 時為 `"apiKeyHelper"`；設定 env 有 key 時為 `"ANTHROPIC_API_KEY"`【實測】。

### R6-2 會改走 API key 的設定與封鎖

| 來源 | 是否生效（正式旗標下） | 封鎖方式 |
| --- | --- | --- |
| 環境變數 `ANTHROPIC_API_KEY` 等 | 未實測（規則禁止放入）；`--bare` 說明寫明只讀它 | 白名單環境，計費變數不可能進子程序【實測 buildEnv】 |
| `--settings` 的 apiKeyHelper | **生效**，即使有 `--setting-sources ""` 與 `--safe-mode`；helper 被執行、改用 x-api-key | 禁用旗標【實測】flag-settings-apikeyhelper |
| 專案設定 apiKeyHelper／env | 擋住【實測】；拿掉 `--setting-sources ""` 就生效【實測】 | 空工作目錄＋`--setting-sources ""` |
| 使用者設定 apiKeyHelper／env | 【推論】同專案設定被 `--setting-sources ""` 擋住（不能改真實設定，未實測） | 執行前 `auth status` 會回報 api_key_helper → 直接擋【實測】 |
| 受管設定（`/Library/Application Support/ClaudeCode/managed-settings.json`、MDM） | `--setting-sources` 與 safe-mode 都不擋（help 與 debug：`managed settings-file hooks still run`）【文件】；本機沒有此檔【實測 debug】 | 【推論】auth status 會反映；此檔存在就標「無法確認」 |

錯誤長相：無效 key 時 result 事件是 `subtype: "success"` 但 `is_error: true`、`api_error_status: 401`、文字 `Invalid API key · Fix external API key`；`--settings` helper 路線則 CLI 自己重試 401 共 11 次、2 分鐘以上【實測】。**判定要看 `is_error`／`api_error_status`，不能只看 subtype。**

## 4. 額度與上下文上限

- 額度（R9）：每次執行的串流都有 `rate_limit_event`，例 `status: "allowed"`、`rateLimitType: "five_hour"`、`resetsAt`、`unifiedWindows.five_hour.utilization: 0.77`、`seven_day`、`overageStatus`、`isUsingOverage: false`【實測】。用完時：執行檔字串含 `usage limit reached`、`you have reached your weekly usage limit`、錯誤型別 `rate_limit_error`、狀態頭 `allowed`／`allowed_warning`【文件：執行檔字串】；推定 `status` 會變 `rejected`、result `is_error: true`＋`api_error_status: 429`【推論】，未刻意耗盡驗證。CLI 自己會重試 API 錯誤（見上），adapter 不要再疊重試。
- 上下文（R8）：result 事件 `modelUsage.<模型>.contextWindow`（`claude-haiku-5-5`：1000000）與 `maxOutputTokens`（128000）【實測】。help 沒有列模型或查上限的指令，只能從執行結果取得，建議每次執行後記錄、依模型快取【推論】。
- `total_cost_usd` 訂閱下仍有值（`costBasis: "list"`），是定價估算不是實際扣款【實測欄位】【推論語意】；介面不可顯示成費用。

## 5. P1-T010 移交項

| 項目 | 結論 |
| --- | --- |
| HOME 要不要傳 | **必須傳真實 HOME**。假 HOME 或 `CLAUDE_CONFIG_DIR` 指向空目錄 → `loggedIn: false`【實測】auth-fakehome、auth-configdir。訂閱憑證在 Keychain，以設定目錄為鍵【推論】 |
| 真實 HOME 的副作用 | CLI 每次執行會改寫 `~/.claude.json`（自身狀態，tmp→rename）【實測 debug】；不是設定變更但避不掉 |
| TMPDIR 祖先 CLAUDE.md | 沒隔離時**會**載入（祖先誘餌標記出現在回覆）；加 `--safe-mode` 後不載入【實測】 |
| `--settings` | 必須列入禁用（見 R6-2） |
| `--setting-sources` | 只准固定值 `""`，不可由外部決定 |
| 直譯器檢查 | claude 是原生 Mach-O，不是 node 腳本，`assertExecutablePath` 不用改【實測 `file`】；`~/.local/bin/claude` 是指向版本檔的符號連結，版本會自動更新 |

## 6. 給 P1-T012 的建議

- 命令列：上方常數陣列，只有模型位置可變；不加任何其他旗標。
- 環境白名單（本 spike 全程用這組）：`HOME`（真實）、`USER`、`LOGNAME`、`LANG`、`PATH=/usr/bin:/bin`（固定值）、`TMPDIR`（指向沙箱）。`USER`、`PATH` 是否必要沒拆解驗證【推論：Keychain 讀取可能用到】。**不可帶**：`CLAUDE_CONFIG_DIR`（登出）、`CLAUDE_CODE_*`（例：`CLAUDE_CODE_PLUGIN_DIRS` 會載入外掛、`CLAUDE_CODE_OAUTH_TOKEN`、`CLAUDE_CODE_USE_BEDROCK/VERTEX`）、`ANTHROPIC_*` 與 P1-T010 計費清單。
- 禁用旗標（命令列是固定陣列，這份給斷言用）：`--bare`、`--settings`、`--setting-sources`（非 `""`）、`--mcp-config`、`--plugin-dir`、`--plugin-url`、`--add-dir`、`--agent`、`--agents`、`--allowedTools`、`--tools`（非 `""`）、`--dangerously-skip-permissions`、`--allow-dangerously-skip-permissions`、`--permission-mode`（非 `dontAsk`）、`--chrome`、`--ide`、`--file`、`--betas`、`--continue`、`--resume`、`--fork-session`、`--from-pr`、`--teleport`、`--cloud`、`--remote-control`、`--bg`、`--worktree`、`--tmux`、`--desktop`、`--environment`、`--debug`、`--debug-file`（log 含路徑與內容）。
- 執行前（R6，每次）：同環境、在空沙箱跑 `claude auth status --json`；要求 `loggedIn === true`、`authMethod === "claude.ai"`、`apiProvider === "firstParty"`、沒有 `apiKeySource`；受管設定檔存在就標「無法確認」。
- 執行中：第一個事件 `system/init` 要 `apiKeySource === "none"`、`tools` 空、`mcp_servers` 空、`plugins` 全是 `builtin`、`skills` 空，否則立刻終止並記錄（init 先於第一個 API 請求送出是【推論】，所以這是第二道，第一道是執行前檢查）。任何 `tool_use` 事件 → 終止、丟棄輸出。`rate_limit_event.status` 不是 `allowed`／`allowed_warning` → 依 R9 停止。
- 結束：看 `is_error`、`api_error_status`，記錄 `modelUsage.*.contextWindow`。
- 版本：每次記 `claude --version`；與已驗證版本不同時建議重跑本 spike（CLI 會自動更新，旗標行為可能變）。

## 殘餘風險

- CLI 在 `-p`＋safe-mode 下仍開本機訊息 socket `/tmp/cc-socks/<pid>.sock`（debug：`[uds-messaging] Listening`，可注入使用者訊息），沒找到關閉旗標【實測 debug】；本機單一使用者，風險低【推論】。
- 內建外掛照常載入，遙測會送到 `api.anthropic.com/api/event_logging`【實測 debug】。
- 受管設定的 hooks 不受 safe-mode 影響【文件】；本機目前沒有。
- 使用者層 apiKeyHelper／env 在 `--setting-sources ""` 下是否被忽略只是推論；靠執行前 auth status 擋。

## 實測紀錄

- CLI 呼叫共 **16 次**：`auth status` 6 次（不打模型）、模型呼叫 10 次（全部 haiku、極短提示，單次估算 US$0.0002–0.001）；另有 4 次本機 `--version`／`--help`。未使用 `--bare`，子程序環境不含任何 API key 變數。
- 案例：auth-real（2 次）、auth-fakehome、auth-configdir、auth-project-helper、auth-fakehome-helper、isolated-injection（3 次，其中 1 次在加 AGENTS.md 誘餌前）、control-realhome、usermd-isolated、usermd-control、flag-settings-apikeyhelper（2 分鐘逾時被終止）、tool-detector-control（2 次；第 1 次用注入提示，模型拒絕用 Read，改成使用者直接要求後出現 tool_use）、ablation-no-setting-sources。
- 重跑：`node scripts/spikes/claude/run.mjs` 看計畫；`node scripts/spikes/claude/run.mjs --live --case isolated-injection` 只跑一案；`--live` 不論選哪些案例，都先在真實使用者設定下跑 `auth status --json`，非訂閱登入（或受管設定檔存在）就中止、不跑任何案例（P1-T037 補上；原始 16 次實測時沒有這道強制檢查）。結果寫到 `$TMPDIR/rolecraft-claude-spike-results/`：`<case>.json` 與 `<case>.events.jsonl` 都遮蔽家目錄、email、UUID（`.events.jsonl` 逐行遮蔽是 P1-T037 補上，原始實測留下的事件檔未遮蔽）。`usermd-isolated` 自 P1-T037 起要求成功且非空的回覆才算 PASS（逾時、額度錯誤不再假通過）。`usermd-*` 需以環境變數 `ROLECRAFT_SPIKE_USER_MD_TOKEN` 提供執行者自己 `~/.claude/CLAUDE.md` 中的一段獨有字串，未設定則判 FAIL。
