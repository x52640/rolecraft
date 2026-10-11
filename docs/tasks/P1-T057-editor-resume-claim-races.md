---
id: P1-T057
phase: 1
status: in_progress
depends_on: []
specs: ["bridge.md"]
track: review
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/resumes/", "apps/editor/src/pages/claims/"]
contract_change: none
expected_commit: "fix(P1-T057): 編輯器：履歷過期載入清空畫面、事實項存檔中繼續編輯被丟掉"
---

# 編輯器：履歷過期載入清空畫面、事實項存檔中繼續編輯被丟掉

## 目標

codex review 補審 P1-T044～T054（2026-10-11，17 個程式 commit）後，協調者對照目前主線（c11dcff）確認仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T050（096f74a）：`useResumeEditor.ts` 的 `loadView` 先遞增 `viewSeq` 才判斷版本是否仍為目前版本；版本 A 的寫入完成後呼叫 `loadView(A)` 時使用者已選 B，會讓 B 的載入失效、自己又被丟棄，畫面一直空白 → 請求的版本不是目前版本就直接返回、不遞增序號
- P1-T050（096f74a）：`ClaimCard.tsx` 存檔中編輯框仍可輸入，成功後無條件關閉，存檔期間多打的字消失 → 存檔中停用輸入框（保守做法）

### 不包含

- 已被後續 commit 修好的發現、已知殘餘（docs/RESIDUALS.md）

## 工作區與 Context

### 必讀入口

- `docs/tasks/P1-T050-*.md` 完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 中風險，不跑對抗驗證
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

