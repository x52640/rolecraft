---
id: P1-T086
phase: 1
status: ready
depends_on: ["P1-T025", "P1-T064"]
specs: ["resume-output.md", "evidence-model.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/resumes/SectionCard.tsx", "apps/editor/src/pages/resumes/copy/", "apps/editor/src/pages/resumes/useResumeEditor.ts", "apps/editor/src/pages/resumes/labels.ts"]
contract_change: none
expected_commit: "feat(P1-T086): editor：客製履歷段落複製，比照匯出把關"
---

# editor：客製履歷段落「複製」按鈕

## 目標

讓使用者把客製履歷段落複製貼到求職網站（Q5 第一階段）。把關比照匯出：以 `resume.check_export` 的實際結果判定，不能藉複製繞過 R1。不需新契約，可立即開工。

## 範圍

### 包含

- 每段「複製」：該段有任何 R1 問題、在 blockers 裡（含只逐段確認、未接受）、或有未儲存修改時停用並說明原因
- 按下時重新讀取段落並重跑 `resume.check_export`，通過且文字與畫面一致才寫入剪貼簿；否則不複製並顯示原因
- 請求進行中鎖住該段按鈕，過期回應作廢（比照自介複製規則）

### 不包含

- 個人資料與照片（P1-T085）
- helper 端檢查規則變更

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`「內容回填到求職網站」
- `docs/specs/evidence-model.md` R1
- `docs/specs/bridge.md`（`resume.get`、`resume.check_export`）
- P1-T025、P1-T064 完成結果；`apps/editor/src/pages/resumes/`、`apps/editor/src/pages/jobs/useIntro.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R1：複製不得繞過匯出前檢查）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 不改 `ResumesPage.tsx`（P1-T085 的 write_paths）；需要時停下回報
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 有 R1 問題、未接受只逐段確認、已退回、有未儲存修改各自不能複製
- 重檢期間段落被改或檢查變不通過時不複製；通過且一致才複製

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
