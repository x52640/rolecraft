---
id: P1-T035
phase: 1
status: done
depends_on: []
specs: ["evidence-model.md", "runtime-and-budget.md"]
track: domain
primary_repo: rolecraft
write_paths: ["packages/domain/"]
contract_change: none
expected_commit: "fix(P1-T035): codex 補審修正：domain（預算、來源變更、數字檢查）"
---

# codex 補審修正：domain（預算、來源變更、數字檢查）

## 目標

E4 全面補審（2026-10-10，`docs/REVIEW_QUEUE.md`）中、對照主線後仍成立的發現。協調者分類結果在 scratchpad `reviews/triage-A.txt`。

## 範圍

### 包含

- triage-A.txt 中 packages/domain 的 6 項（budget 1、source-change 1、evidence 數字 4）

### 不包含

- 分類為 resolved／invalid／known／spike-only 的項目

## 工作區與 Context

### 必讀入口

- `docs/specs/evidence-model.md`
- `docs/specs/runtime-and-budget.md`

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

- [x] 各項修正與回歸測試
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：6 項修正與回歸測試
- 已通過驗證：`npm run verify`；分類員 PoC（budget／sc／num）改為正確結果
- 下一步：協調者驗收後關閉
- Blocker：無

## 完成結果

- budget `batches.ts`：`segments.push(...parts)` 改逐一 push；15 萬段不再 RangeError。
- source-change `isUsableForGeneration`：normal 也要求有來源片段或使用者確認，空依據回 false。
- 數字 `numbers.ts`：量級（萬、k）之後再查百分比後綴，「1萬%」→ %10000、「1k percent」→ %1000；阿拉伯數字「成」後緊接數字（3成五、3成55）整段 null。
- 數字 `number-words.ts`：中文數字結尾再查約數後綴（三成多／三成餘／三成五多 → null）；「成」後緊接數字（三成5、三成五六）整段 null；英文數字詞前有「百分之」算百分比（百分之thirty → %30）。
- 混寫選 fail closed（null），不猜成 %35。副作用：「3成一致」這類成後緊接中文數字字的寫法也會變 null。
- 回歸測試：`budget.test.ts`、`evaluate.test.ts`、`numbers-fail-closed.test.ts` 末尾 P1-T035 區塊。
