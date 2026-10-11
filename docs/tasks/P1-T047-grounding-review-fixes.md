---
id: P1-T047
phase: 1
status: in_progress
depends_on: []
specs: ["evidence-model.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/generation/grounding.ts", "packages/pipeline/src/generation/grounding.test.ts", "packages/pipeline/src/generation/sections.test.ts", "packages/pipeline/src/analysis/urls.ts", "packages/pipeline/src/analysis/urls.test.ts", "packages/pipeline/src/analysis/drafts.test.ts", "packages/pipeline/src/messages/prompt.ts", "packages/pipeline/src/messages/prepare.test.ts", "packages/pipeline/src/messages/runner.test.ts", "packages/pipeline/src/messages/check.test.ts", "packages/pipeline/src/messages/commitments.ts"]
contract_change: none
expected_commit: "fix(P1-T047): pipeline 事實檢查：句號正規化、網址邊界、職缺名稱比對、訊息草稿的完成度上限"
---

# pipeline 事實檢查：句號正規化、網址邊界、職缺名稱比對、訊息草稿的完成度上限

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T029：`。` 全域換成 `.` 讓「3。14 位」變成 3.14，錯誤數字通過檢查 → 句點類正規化只用在寬鬆網域（與承諾檢查的 email）辨識，數字與完整網址只做 NFKC＋去隱形字元
- P1-T024：全形逗號等 CJK 標點經 NFKC 後黏進網址，造成誤擋 → 抽完整網址前把 CJK 全形標點視為分隔
- P1-T024：職缺公司／職稱比對用子字串，LINE 會命中 pipeline → 純拉丁字母的名稱要求字詞邊界，中文名稱維持子字串
- P1-T022：網址結尾的 `)`、`]` 只在括號不成對時才去掉；Markdown `[url](url)` 以 `[`、`]` 分隔
- P1-T029：訊息草稿 prompt 沒標事實項完成度 → 沿用 generation 的完成度上限，在資料區塊外加「最高可寫」

### 不包含

- 已被後續修正解決、已知殘餘或需擁有者裁定的項目（見 docs/CURRENT_TASK.md）

## 工作區與 Context

### 必讀入口

- 範圍內各項提到的原 Task 檔完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 高風險（R1），收官前跑對抗驗證；commitments 依賴 normalizeForGrounding，要保留它對 email／網域的寬鬆辨識
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
- Blocker：無

## 完成結果

