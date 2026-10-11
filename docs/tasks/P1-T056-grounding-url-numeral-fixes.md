---
id: P1-T056
phase: 1
status: in_progress
depends_on: []
specs: ["evidence-model.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/analysis/urls.ts", "packages/pipeline/src/analysis/urls.test.ts", "packages/pipeline/src/analysis/", "packages/pipeline/src/generation/", "packages/pipeline/src/messages/", "packages/domain/src/evidence/"]
contract_change: none
expected_commit: "fix(P1-T056): 事實檢查：網址查詢參數方括號、零寬字元點、參字數量詞"
---

# 事實檢查：網址查詢參數方括號、零寬字元點、參字數量詞

## 目標

codex review 補審 P1-T044～T054（2026-10-11，17 個程式 commit）後，協調者對照目前主線（c11dcff）確認仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T047（58c43cc）：`analysis/urls.ts` 的 `URL_STOP` 含方括號，`?filter[role]=admin` 與原文 `?filter[role]=user` 都截成 `?filter`，捏造的網址通過比對 → 網址內部（`?`、`&`、`=` 後的查詢參數）的方括號要保留在 token 裡，Markdown `[url](url)` 的分隔仍要能用
- P1-T047（81bef88）：`generation/grounding.ts` 寬鬆網址 `PATH_STOP` 同樣截斷查詢參數方括號（引用 `?filter[user]=owner` 卻放行 `?filter[user]=attacker`）→ 同上
- P1-T047（81bef88）：`RAW_BRACKET_DOT` 在去除零寬字元之前比對，`evil［\u200B.］com` 漏抓 → 先去除不可見字元再認方括號點
- P1-T047（81bef88）：`domain/evidence/numerals.ts` 的「參」前後文白名單漏了百分比後綴（‰、‱）與量詞（批等），`改善參‰`、`處理參批資料` 變成不抽數字而放行 → 補齊解析器支援的百分比後綴與量詞；寧可多抽（保守）
- P1-T047（81bef88）：`百分之參十` 時 `numbers.ts` 的 `markerAt` 只拿下一個字元測 regex，「參」的前後文判斷失敗，多出一個 null key 的「百分之」token，導致原文有 30% 仍被拒 → marker 判斷要看完整前後文；測試要檢查 null-key token

### 不包含

- 已被後續 commit 修好的發現、已知殘餘（docs/RESIDUALS.md）

## 工作區與 Context

### 必讀入口

- `docs/tasks/P1-T047-*.md` 完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 高風險（evidence-model R1 事實檢查），收官前跑對抗驗證
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有回歸測試

### 手動驗證

- 無

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

