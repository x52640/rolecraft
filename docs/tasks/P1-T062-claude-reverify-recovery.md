---
id: P1-T062
phase: 1
status: in_progress
depends_on: ["P1-T058"]
specs: ["providers.md", "bridge.md", "architecture.md"]
track: providers
primary_repo: rolecraft
write_paths: ["docs/specs/providers.md", "docs/specs/bridge.md", "packages/providers/src/claude/", "packages/providers/src/index.ts", "packages/contracts/src/bridge/editor/providers.ts", "packages/contracts/src/index.ts", "apps/helper/src/handlers/providers/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "apps/editor/src/pages/settings/", "apps/editor/src/bridge/", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T062): Claude 重新驗證中斷不算失敗、失敗只綁版本、設定頁可重新啟用"
---

# Claude 重新驗證：中斷不算失敗、失敗只綁版本、可手動重新啟用

## 目標

D24 修改 D22 的失敗處理。現況（`packages/providers/src/claude/version-gate.ts`）：呼叫模型前先存一筆「暫定失敗」，中途被打斷就留下失敗；只要有任何一筆失敗，所有版本的 Claude 永久停用，介面沒有恢復方法。

## 範圍

### 包含

- providers.md 先寫規則（引用 D24），再改程式
- 版本閘門：
  - 中斷 ≠ 失敗：暫定紀錄改成可辨識的「未完成」（例如獨立 outcome 或沿用既有 reason 判斷，選一種並寫進規則）。讀到「未完成」的版本 → 不停用，狀態為「需要重新驗證」；下次**使用者發起**需要 Claude 的工作時自動重跑（仍先存暫定紀錄）。不在 helper 啟動、背景輪詢或狀態查詢時自動呼叫模型
  - 失敗只綁版本：停用只在「目前偵測到的 CLI 版本」最新一筆是 failed 時成立；CLI 版本變成沒有失敗紀錄的另一個版本 → 照 D22 自動重新驗證
  - 既有資料相容：P1-T058 已存的紀錄（含 reason = `重新驗證未完成` 的暫定失敗）要依新規則讀成「未完成」，不能讓舊資料繼續永久停用
- 重新啟用：新橋接操作（相加，例如 `providers.reverify_claude`），只在目前版本被停用或未完成時可用；按下就對目前版本重跑注入測試（S9-13，3–5 次極短呼叫），通過才接受；沿用與一般執行互斥、R6、暫定紀錄等既有保護。不提供「不測就放行」的路徑
- 編輯器設定頁：Claude 卡片在停用或需要重新驗證時顯示原因與「重新啟用」按鈕，說明會用掉幾次極短呼叫；執行中按鈕停用並顯示進度；結果出來後更新狀態
- 測試一律用 `reverify-fakes.ts` 等假執行，不呼叫真實 CLI

### 不包含

- Codex、Antigravity
- 修改注入測試案例本身

## 工作區與 Context

### 必讀入口

- `plan.md` D22、D24
- `docs/specs/providers.md`（R5、R6、P1-T058 段）
- P1-T039、T058 完成結果
- `packages/providers/src/claude/version-gate.ts`、`reverify.ts`、`service.ts`；`apps/helper/src/handlers/providers/claude-probe.ts`、`persistence.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R5、R6 計費路線），收官前跑對抗驗證
- 協調者例外允許本 Task 改 contracts、分派表（worker 規則 10 對本 Task 不適用）；不改 `handlers/services.ts`、`main.ts`，除非組裝真的需要（需要就在回報說明）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 中斷：存暫定紀錄後模擬程序結束 → 重開 → 狀態「需要重新驗證」、未呼叫模型；使用者發起工作 → 重跑一次
- 失敗綁版本：A 版失敗 → 停用；CLI 換成 B 版 → 自動重新驗證一次；換回 A 版 → 仍停用
- 重新啟用：通過 → 可用；不通過 → 仍停用、紀錄新增一筆；與一般執行互斥；R6 不通過不呼叫模型
- 舊資料：P1-T058 格式的暫定失敗紀錄讀成「未完成」
- 狀態查詢、helper 啟動都不會呼叫模型

### 手動驗證

- 無（live 測試不在本 Task）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：
- 已通過驗證：
- 下一步：
- Blocker：

## 完成結果

