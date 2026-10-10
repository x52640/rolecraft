---
id: P1-T034
phase: 1
status: done
depends_on: ["P1-T014", "P1-T015", "P1-T016"]
specs: ["bridge.md", "architecture.md"]
track: contracts
primary_repo: rolecraft
write_paths: ["packages/contracts/src/bridge/", "packages/contracts/src/index.ts", "apps/helper/src/bridge/", "apps/helper/src/handlers/", "apps/helper/src/main.ts", "apps/extension/src/bridge/", "apps/extension/src/relay/", "apps/extension/src/background/", "apps/editor/src/bridge/", "docs/specs/bridge.md", "vitest.config.ts", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: breaking
expected_commit: "feat(P1-T034): 橋接 contract 升級：請求 id、錯誤碼、共用常數"
---

# 橋接 contract 升級：請求 id、錯誤碼、共用常數

## 目標

P1-T014、P1-T015、P1-T016 回報的共同缺口（見 CURRENT_TASK 已知殘餘）：橋接沒有請求 id、錯誤碼不足、同一常數在三處各寫一份。編輯器頁面 Task（P1-T019、T021 等）都會新增操作，要先把 contract 定好。

## 範圍

### 包含

- 信封加請求 id（request／response 對應不再靠順序）；helper 可依 id 回覆，extension 客戶端可同時送多則
- 錯誤碼新增：`not_implemented`（helper handler 尚未支援）、`helper_unavailable`（host 未安裝或未啟動）、`timeout`
- 共用常數移入 contracts：Native Messaging host 名稱 `com.rolecraft.helper`、頁面↔service worker 轉送通道 `rolecraft.bridge`；helper、extension、editor 改從 contracts 匯入
- 定義 `open_editor` 語意：工具列已由 extension 自開分頁，若橋接操作無存在必要就移除並更新 `bridge.md`
- 大回應分塊的協定位置（P1-T027 會用到）：至少保留 id 讓之後可分塊；是否本 Task 實作分塊由實作者評估並回報
- `vitest.config.ts` 收 `*.test.tsx`
- `bridge.md` 更新操作與錯誤碼的定義（只寫語意，欄位以 contracts 為準）

### 不包含

- 新增任何業務操作（由各頁面 Task 加）

## 工作區與 Context

### 必讀入口

- `docs/specs/bridge.md`、`docs/adr/0003-bridge-transport.md`、`docs/adr/0006-contracts-interim-fields.md` 第 8 列
- P1-T014、P1-T015、P1-T016 的完成結果

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify && npm run build && node apps/extension/scripts/chrome-e2e.mjs
```

## 實作要求

- R7 不變：信封與 payload 仍不得有路徑、指令、CLI 參數類欄位；id 只是不透明字串
- helper 對同一 id 只回一次；未知或重複 id 的處理要定義並測試
- 既有對抗驗證的回歸測試（P1-T014 框架、同 chunk 壞框）要繼續通過

## 驗證

### 自動驗證

- contracts、helper、extension、editor 測試；Chrome e2e

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠、build 成功、Chrome e2e 通過
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：實作與文件全部完成（工作者 commit，待協調者收官與對抗驗證）
- 已通過驗證：`npm run verify`、`npm run build`、`node apps/extension/scripts/chrome-e2e.mjs`（13 項全過）；Vitest 961 通過、1 略過；test:docs 14
- 下一步：協調者範圍稽核（見下方「超出 write_paths」）、R7 對抗驗證
- Blocker：無

## 完成結果

- contracts：新增 `bridge/protocol.ts`（`NATIVE_HOST_NAME`、`RELAY_CHANNEL`、`BRIDGE_MAX_IN_FLIGHT = 32`、`BridgeRequestId`＝1–64 個 `[A-Za-z0-9_-]`、`BridgeRequestEnvelope { id, request }`、`BridgeResponseEnvelope { id | null, response }`）；錯誤碼加 `not_implemented`、`helper_unavailable`、`timeout`；移除 `open_editor`（`draft-and-editor.ts` 改名 `draft.ts`）；新增型別 `BridgeResponse`。頁面送的 `BridgeRequest` 形狀不變，id 只在 service worker↔helper 之間。
- helper：`bridge/envelope.ts` 先取 id 再交給 `dispatch`；`host.ts` 改成並行處理、完成先回、以 id 回覆。id 不合法→等在途回完、送 id 為 null 的 `invalid_request`、結束碼 3；id 重複（本連線出現過，含已回覆）→同上，原請求只回一次；id 合法但信封多／缺欄位→以該 id 回 `invalid_request`、連線繼續。在途上限沿用 32（取自 contracts）。未接服務改回 `not_implemented`。日誌不記 id。
- extension：`bridge/client.ts` 配 `r<遞增>` id（客戶端生命週期內不重用，跨重連也不重用），可同時多則在途；達上限排隊；逾時只讓該請求回 `timeout`，id 記為已放棄、晚到回覆丟棄、仍占名額直到 helper 回覆（名額全被占住則斷線重來）；未知 id／null id／信封不合法→斷線、在途回 `internal_error`；host 斷線／送不出去→`helper_unavailable`；單則回應不符 schema 只影響該請求、不再斷線。
- 共用常數：helper、extension（service worker、relay）、editor 都從 contracts 匯入；`apps/*/src/index.ts` 的既有匯出改為轉出 contracts 的值（檔案未改）。
- `open_editor`：移除。工具列按鈕本來就由 service worker 直接 `chrome.tabs.create`；helper 無法開瀏覽器分頁，編輯器頁也不需要「開自己」，content script 本來就被禁止呼叫它。bridge.md 加操作表、信封與錯誤碼語意；ADR-0006 第 8 列定案。
- 分塊：**本 Task 不實作**。目前 3 個操作的回應都是 id，遠小於 1 MB；回應超過上限時 helper 以同一 id 回 `internal_error`。P1-T027 若要經橋接傳 PDF，再以同一 id 加分塊訊息形狀（additive）。
- `vitest.config.ts` 收 `*.test.{ts,tsx}`。
- 測試：contracts（id 邊界、信封、錯誤碼、open_editor 移除）、helper host（id 缺漏／非字串／空／超長／路徑字元／原型鏈名稱／舊格式、重複 id 進行中與已回覆、信封多欄位、並行與亂序完成、上限、P1-T014 同 chunk 合法框＋壞框回歸）、extension client（亂序回覆對應、id 不重用、上限排隊、逾時不影響他人與晚到丟棄、未知／null／不合法信封斷線、同 id 回兩次、helper_unavailable）、editor。Chrome e2e 加「同時兩則、假 host 亂序回覆」「host 結束回 helper_unavailable 並自動重連」「host 收到的都是 `{ id, request }` 且 id 不重複」。
- 超出 write_paths（breaking change 不改就無法通過驗證，請協調者裁定）：`apps/helper/src/__fixtures__/requests.ts`（移除 open_editor、加信封 helper）、`apps/helper/src/main.test.ts`（改送信封、改 not_implemented、加無 id 案例）、`apps/extension/scripts/chrome-e2e.mjs`（假 host 回信封、案例更新）。
