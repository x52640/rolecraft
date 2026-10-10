---
id: P1-T010
phase: 1
status: in_progress
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
  - `command.ts`：`defineCommand` 只收字面值（型別層拒絕寬型別 string、執行時登記表＋凍結）；唯一變數是 `MODEL_SLOT`（模型 ID 嚴格格式，不得 `-` 開頭）；`API_KEY_MODE_FLAGS`（claude `--bare`）。
  - `process.ts`：`createLauncher` 綁定清理後環境與空暫存工作目錄，`shell: false`，提示只走 stdin，輸出上限、取消。適配器拿不到原始環境。
  - `run-check.ts`：`runWithSubscriptionCheck` 每次重查 R6，任一項非 passed（含 unknown、丟錯、尚未支援、模型 ID 不合法、命令含禁用旗標）就不執行；回傳經 contracts 驗證的 RunCheckRecord。
  - `connection.ts`：安裝精靈用 `checkConnection` → ProviderConnection（不能免除執行前確認）。
  - `unsupported.ts`：`createUnsupportedAdapter`。
- `packages/providers/src/fake/fake-adapter.ts`：腳本式假適配器（文字／各類錯誤／等取消），記錄呼叫。
- contracts（ADR-0006 第 6 項定案）：RunCheckRecord 加 trigger、items（四項各結果＋依據）、removedEnvVarNames、executed；schema 強制不變式。
- 偏離：為配合 RunCheckRecord 新欄位，改了 `packages/contracts/src/entities/entities.test.ts` 的合法樣本（write_paths 外，否則既有測試會紅）。
- 留給 P1-T011：codex、antigravity 的 API key 模式旗標與專屬環境變數未查證；各家 CLI 設定檔（apiKeyHelper、config.toml 等）偵測由各家適配器實作 `cliConfig`。
