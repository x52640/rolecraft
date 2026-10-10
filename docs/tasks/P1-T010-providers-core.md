---
id: P1-T010
phase: 1
status: done
depends_on: ["P1-T001"]
specs: ["providers.md"]
track: providers
primary_repo: rolecraft
write_paths: ["packages/providers/src/core/", "packages/providers/src/fake/", "packages/providers/src/index.ts"]
contract_change: additive
expected_commit: "feat(P1-T010): providers：適配介面、環境清理與 R6 紀錄"
---
# providers：適配介面、環境清理與 R6 紀錄

## 目標

D2、D12：每次執行前都要證明走的是訂閱，不會掉進 API key 計費。

## 範圍

### 包含

- ProviderAdapter 介面：偵測安裝、登入狀態、可用模型、執行（僅純文字輸入輸出）、取消、錯誤分類（額度／暫時性／其他）
- 子程序環境清理：移除已知 API key 與雲端計費環境變數（清單集中一處）
- R6 確認流程框架與 RunCheckRecord 產生
- 狀態「尚未支援」的表示方式
- fake adapter 供其他套件測試

### 不包含

- 任何真實 CLI 呼叫（P1-T012）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/providers.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 子程序啟動一律用參數陣列，不經 shell；參數只由程式常數組成，不接受外部內容
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 環境清理測試；R6 任一項不成立就不執行的測試；fake adapter 的額度錯誤路徑

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：適配介面、環境清理、命令／子程序啟動器、R6 流程與紀錄、尚未支援適配器、fake adapter、測試
- 已通過驗證：`npm run verify` 綠（Vitest 19 檔 186 測試）
- 下一步：協調者收官（高風險 Task，E3 對抗驗證）
- Blocker：無

## 完成結果

- `packages/providers/src/core/`：
  - `adapter.ts`：ProviderAdapter 介面（偵測安裝、登入／資格、模型、`verifySubscriptionRoute`、執行、取消用 AbortSignal、錯誤分類 quota_exhausted／transient／other／cancelled）；`SupportStatus`（supported／not_supported「尚未支援」／cannot_confirm「無法確認」）。
  - `billing-env.ts`：計費環境變數**唯一清單**（Anthropic、OpenAI／Codex、Google／Vertex、AWS／Bedrock、Azure，附來源）＋關鍵字（API_KEY 等）與前綴兜底；不分大小寫、`-` 視同 `_`。
  - `environment.ts`：白名單帶出＋黑名單優先；適配器政策放行或設定計費變數直接丟錯；只回報被移除的名稱，不記值。
  - `command.ts`：`defineCommand` 只收字面值（型別層拒絕寬型別 string 與含插值的樣板型別、ESLint 禁止非字面量引數、執行時登記表＋凍結；原宣稱「型別層拒絕寬型別」不足以擋模板字串，見下方對抗驗證修正）；唯一變數是 `MODEL_SLOT`（模型 ID 嚴格格式，不得 `-` 開頭）；`API_KEY_MODE_FLAGS`（claude `--bare`）。
  - `process.ts`：`createLauncher` 綁定清理後環境與空暫存工作目錄，`shell: false`，提示只走 stdin，輸出上限、取消。適配器拿不到原始環境。
  - `run-check.ts`：`runWithSubscriptionCheck` 每次重查 R6，任一項非 passed（含 unknown、丟錯、尚未支援、模型 ID 不合法、命令含禁用旗標）就不執行；回傳經 contracts 驗證的 RunCheckRecord。
  - `connection.ts`：安裝精靈用 `checkConnection` → ProviderConnection（不能免除執行前確認）。
  - `unsupported.ts`：`createUnsupportedAdapter`。
- `packages/providers/src/fake/fake-adapter.ts`：腳本式假適配器（文字／各類錯誤／等取消），記錄呼叫。
- contracts（ADR-0006 第 6 項定案）：RunCheckRecord 加 trigger、items（四項各結果＋依據）、removedEnvVarNames、executed；schema 強制不變式。
- 偏離：為配合 RunCheckRecord 新欄位，改了 `packages/contracts/src/entities/entities.test.ts` 的合法樣本（write_paths 外，否則既有測試會紅）。
- 留給 P1-T011：codex、antigravity 的 API key 模式旗標與專屬環境變數未查證；各家 CLI 設定檔（apiKeyHelper、config.toml 等）偵測由各家適配器實作 `cliConfig`。

### 對抗驗證修正

- R6 缺項先擋：適配器 `verifySubscriptionRoute` 回 undefined、`{}`、缺項、空依據或多餘欄位時，原本 `summarizeChecks` 用 `Object.values(...).every` 判 passed、先呼叫 `execute` 才在 `RunCheckRecord.parse` 丟錯。改為執行前以 contracts `RunCheckItems` schema `safeParse`，不合法就四項都記 unknown（依據「適配器回報格式不合法」）、blocked、executed:false；`summarizeChecks` 改成逐一檢查四個固定 key。`routeChecks` 回傳改為 `{ checks, reportValid }`（`connection.ts` 同步）。
- `defineCommand` 拒絕插值：原「型別層拒絕寬型別」宣稱不完整——`` `--x=${ext}` `` 型別與執行期都放行。改為：(a) 型別層 `IsPureLiteral` 拒絕寬型別與含 `${string}`／`${number}` 等插值的樣板型別（含與字面值的聯集）；(b) `eslint.config.js` 對 `packages/providers/src/**` 加 `no-restricted-syntax`：引數須為陣列常值，元素只能是字串常值、無插值樣板字串或 `MODEL_SLOT`；(c) `assertExecutablePath` 拒絕 sh、bash、zsh、dash、fish、ksh、csh、tcsh、env、node（basename 不分大小寫、忽略版本尾碼）。型別與 lint 仍可被 `as` 轉型＋eslint-disable 繞過，最終保證靠審查。測試改用指向 node 的符號連結 `fake/node-cli.ts` 代替 CLI。
- 回歸測試：`run-check.test.ts`（五種不合法回報 execute 0 次、紀錄合法）、`command.test.ts`（`@ts-expect-error` 型別測試、直譯器路徑）、`command-lint.test.ts`（lintText）。
- 移交：HOME 白名單、TMPDIR 工作目錄、codex `-c`／claude `--settings` 旗標經判定不屬本 Task，留 P1-T011／P1-T012。
