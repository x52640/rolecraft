---
id: P1-T050
phase: 1
status: in_progress
depends_on: []
specs: ["bridge.md"]
track: review
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/claims/", "apps/editor/src/pages/resumes/", "apps/editor/src/pages/applications/"]
contract_change: none
expected_commit: "fix(P1-T050): 編輯器：事實項、履歷、投遞紀錄頁的競態與顯示修正"
---

# 編輯器：事實項、履歷、投遞紀錄頁的競態與顯示修正

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T023：切換專案時舊回應蓋掉新清單 → 丟棄不屬於目前專案的回應
- P1-T023：修改事實項存檔失敗時編輯內容被丟掉 → 成功才關閉編輯框
- P1-T025：切換版本時舊版本回應蓋掉新選擇 → 丟棄不屬於目前版本的回應
- P1-T025：「重新整理」在版本 ID 不變時不會重新載入內容 → 明確重新載入目前版本
- P1-T028：兩個匯出版本標籤可能相同 → 加上可區分的短 ID
- P1-T028：較舊的重新載入蓋掉較新的結果 → 只套用最新一次的結果
- P1-T028：只改狀態時，時區變動會讓投遞日期偏移 → 日期欄位沒改就送回原本的時間戳

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
- Blocker：無

## 完成結果

