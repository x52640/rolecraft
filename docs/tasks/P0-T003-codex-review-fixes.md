---
id: P0-T003
phase: 0
status: done
depends_on: ["P0-T001", "P0-T002"]
specs: ["architecture.md"]
track: infra
primary_repo: rolecraft
write_paths: ["eslint.config.js", "apps/helper/src/module-boundaries.test.ts", "scripts/docs/"]
contract_change: none
expected_commit: "fix(P0-T003): 修正 codex review 對 P0-T001、P0-T002 的三項發現"
---

# 修正 codex review 對 P0-T001、P0-T002 的發現

## 目標

E4 補跑的 codex review（gpt-6.1-sol）在 P0-T001、P0-T002 找到三個問題，協調者逐一查證屬實。

## 範圍

### 包含

- 動態 `import()` 繞過模組邊界：新增 lint 規則 `rolecraft/dynamic-import-boundary`，套用同一份相依表；非字串常值的動態 import 一律擋
- `task:close` 遇到 `status: "in_progress"` 或多餘空白時未改狀態卻回報成功：改為只改 front matter 的 status 行，寫入後重讀確認為 done
- 連結目標含字面 `%`（例如 `100%.md`）讓 verify:docs 拋例外：解碼失敗保留原字

### 不包含

- 其他 lint 規則調整

## 工作區與 Context

### 必讀入口

- `docs/specs/architecture.md`

### 不應載入

- 其他 spec

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試

## 驗證

### 自動驗證

- module-boundaries 測試新增 7 個動態 import 案例；docs 測試新增 2 個

### 手動驗證

- 無

## 完成定義

- [x] 三項修正與回歸測試
- [x] `npm run verify` 綠

## 中斷／接手紀錄

- 最後完成：三項修正
- 已通過驗證：npm run verify（Vitest 85、docs 13）
- 下一步：無
- Blocker：無

## 完成結果

- 三項 codex review 發現已修正並有回歸測試；協調者直接實作。
- 驗證：Vitest 15 檔 85 測試、test:docs 13/13、verify:docs 通過。
