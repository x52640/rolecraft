---
id: P1-T072
phase: 1
status: in_progress
depends_on: ["P1-T025"]
specs: ["evidence-model.md", "runtime-and-budget.md", "bridge.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/generation/", "apps/helper/src/handlers/resume/", "apps/editor/src/pages/resumes/", "docs/specs/evidence-model.md"]
contract_change: none
expected_commit: "feat(P1-T072): 客製履歷逐段改寫工作經歷、產生完成自動顯示"
---

# 客製履歷沒有改寫工作經歷

## 目標

協調者以擁有者真實資料實測（2026-10-12，Claude Haiku）：職缺是「AI 客戶成功經理」，擁有者有 5 段經歷（含現職客戶成功經理），但產生的履歷 9 段全是專案事實項，工作經歷一段都沒改寫。另外產生完成要手動按「重新整理」才看得到。

## 範圍

### 包含

- 生成提示：每段工作經歷都要產出一段經歷改寫（placement＝該經歷），以已確認的經歷描述為原文，依職缺挑重點、改寫措辭；專案段落是補充，不能取代經歷；與職缺無關的經歷可精簡但不省略
- 輸出驗證：缺少任何經歷段 → 視為格式不合（照既有失敗處理），或由程式補一段「沿用原文」段落；選一種並寫進 spec（保守：程式補「沿用原文」，不額外呼叫模型）
- 經歷段的數字出處：經歷描述本身是使用者確認過的文字（R1 檢查 3 已允許），不需另引用事實項
- 履歷頁：產生中自動輪詢，完成後自動顯示新版本（照 intro 的輪詢與操作 token 做法；請求中鎖定）
- 測試全用假 provider：缺經歷段時補沿用原文；經歷段可通過數字檢查；完成後自動出現新版本、不需手動重新整理

### 不包含

- 換模型、改 R1 規則

## 工作區與 Context

### 必讀入口

- `docs/specs/evidence-model.md`、`runtime-and-budget.md`、`bridge.md`（resume 段）
- `packages/pipeline/src/generation/`（prompt、sections、prepare）、`apps/helper/src/handlers/resume/`、`apps/editor/src/pages/resumes/`、`apps/editor/src/pages/jobs/useIntro.ts`（輪詢做法參考）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R1），收官前跑對抗驗證
- 遵守 architecture.md

## 驗證

### 自動驗證

- 見「範圍」

### 手動驗證

- 協調者以 harness 實跑
