---
id: P1-T037
phase: 1
status: in_progress
depends_on: []
specs: ["providers.md"]
track: providers
primary_repo: rolecraft
write_paths: ["packages/providers/src/core/", "scripts/spikes/claude/", "docs/adr/0002-claude-cli-isolation.md", "packages/providers/src/claude/guard.ts", "packages/providers/src/claude/adapter.test.ts"]
contract_change: none
expected_commit: "fix(P1-T037): codex 補審修正：providers 取消終止與 Claude spike 腳本"
---

# codex 補審修正：providers 取消終止與 Claude spike 腳本

## 目標

E4 全面補審（2026-10-10，`docs/REVIEW_QUEUE.md`）中、對照主線後仍成立的發現。協調者分類結果在 scratchpad `reviews/triage-C.txt`。

## 範圍

### 包含

- triage-C.txt 全部 4 項

### 不包含

- 分類為 resolved／invalid／known／spike-only 的項目

## 工作區與 Context

### 必讀入口

- `docs/specs/providers.md`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（用分類員的 PoC 情境）
- 修法若需改 write_paths 以外的檔案，停下回報

## 驗證

### 自動驗證

- 各項回歸測試

### 手動驗證

- 無

## 完成定義

- [ ] 各項修正與回歸測試
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：4 項修正、回歸測試、協調者裁定的取消結果型別
- 已通過驗證：`npm run verify` 綠（vitest 1098 過／8 略過）；`node --test scripts/spikes/claude/spike.test.mjs` 5 過；PoC（sigterm、iso）改為正確結果
- 下一步：協調者收官（RESIDUALS 刪除「core 取消／輸出超量只對本體送訊號」）
- Blocker：無

## 完成結果

- process.ts：不把 signal 交給 spawn；子程序 detached，取消先對群組 SIGTERM，寬限期（預設 2 秒，`terminateGraceMs`）後 SIGKILL 群組；輸出超量也 SIGKILL 群組。群組終止抽到 `core/kill.ts`，guard.ts 改用它並刪除過時殘餘註解。
- run-check.ts：開始前已取消或 R6 確認途中取消 → `status: 'cancelled'`（不是 blocked）；紀錄 executed=false，三項 unknown、依據「確認途中被取消」。
- spike：`--live` 不論 `--case` 都先跑 auth status，非訂閱或受管設定存在就中止；usermd-isolated 要求成功且非空回覆；events.jsonl 逐行遮蔽；ADR-0002 重跑說明已更正。
- spike 回歸測試不在 verify 內：`node --test scripts/spikes/claude/spike.test.mjs`。
