---
id: P1-T034
phase: 1
status: in_progress
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
