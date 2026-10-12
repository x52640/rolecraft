---
id: P1-T070
phase: 1
status: in_progress
depends_on: ["P1-T062"]
specs: ["providers.md", "bridge.md"]
track: providers
primary_repo: rolecraft
write_paths: ["docs/specs/providers.md", "packages/providers/src/claude/", "apps/helper/src/handlers/providers/", "apps/editor/src/pages/settings/"]
contract_change: none
expected_commit: "fix(P1-T070): helper 重開後不必手動重新檢查，使用者發起 AI 工作時自動做連線檢查"
---

# helper 重開後 Claude 狀態歸零

## 目標

協調者實測（2026-10-12）：helper 每次重開（實際使用＝每次開 Chrome），Claude 狀態變回「資格未知」，所有 AI 工作（分析、履歷、自介）回「尚未選定可用的模型」，要使用者自己去設定頁按「重新檢查」才恢復；模型選擇其實有存。

## 範圍

### 包含

- 使用者發起需要 Claude 的工作時，若本次 helper 尚未做過連線檢查，先自動做一次（R5：登入方式、方案、隔離；不呼叫模型），通過就繼續原工作，不通過回明確原因
- 設定頁打開時若尚未檢查，也自動檢查一次（同樣不呼叫模型）
- 不在 helper 啟動、背景輪詢時呼叫模型（D24 不變）；版本閘門規則不變
- 測試：重開後直接發起生成 → 自動檢查一次再執行；檢查不通過 → 不執行並回原因；設定頁開啟觸發一次；都不呼叫模型（假 runner 計次）

### 不包含

- 改模型驗證規則、R6

## 工作區與 Context

### 必讀入口

- `docs/specs/providers.md`（R5、R6、P1-T058、P1-T062 段）
- `apps/helper/src/handlers/providers/`、`packages/providers/src/claude/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R5 計費路線），收官前跑對抗驗證
- 遵守 architecture.md

## 驗證

### 自動驗證

- 見「範圍」

### 手動驗證

- 協調者以 harness 重開後直接產生自介
