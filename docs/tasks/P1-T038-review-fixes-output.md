---
id: P1-T038
phase: 1
status: in_progress
depends_on: []
specs: ["resume-output.md", "jobs-and-messages.md"]
track: output
primary_repo: rolecraft
write_paths: ["packages/pdf-export/", "apps/extension/src/sites/104/", "scripts/docs/"]
contract_change: none
expected_commit: "fix(P1-T038): codex 補審修正：pdf-export、104 擷取提示、task:close"
---

# codex 補審修正：pdf-export、104 擷取提示、task:close

## 目標

E4 全面補審（2026-10-10，`docs/REVIEW_QUEUE.md`）中、對照主線後仍成立的發現。協調者分類結果在 scratchpad `reviews/triage-D.txt`。

## 範圍

### 包含

- triage-D.txt 全部 5 項（含 1 項 valid? 需先確認）

### 不包含

- 分類為 resolved／invalid／known／spike-only 的項目

## 工作區與 Context

### 必讀入口

- `docs/specs/resume-output.md`
- `docs/specs/jobs-and-messages.md`

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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀分類結果與 PoC 後開工
- Blocker：無

## 完成結果
