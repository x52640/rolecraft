---
id: P1-T086
phase: 1
status: in_progress
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

- 審查待修（2026-10-12，b0122b4 的對抗審查＋codex，協調者寫入）：
  1. （R1，對抗）`copy-rules.ts` 的 `copyBlockReason` 用 `trim()` 判空白，helper／domain 用 `isBlankForNumbers`（刪不可見字元後判斷）：整段只有不可見字元（例如 Unicode tag 字元 U+E0000～E007F 編碼的句子）時，R1 與 blockers 都跳過、檢查回 ready，複製端卻當有內容而可複製。改成與 domain 同一套空白判定（重用 domain 匯出的函式，不要複製規則）；另外保守起見，段落文字含 tag 字元（U+E0000～E007F）時一律不能複製並說明原因。
  2. （R1，codex）複製請求進行中按「重新整理」使檢查結果改變（新出現 R1 問題或失去檢查結果）而段落本身沒變時，舊的成功檢查仍寫入剪貼簿。進行中的複製要在畫面上的檢查結果／把關狀態改變時作廢，寫入剪貼簿前再確認最新把關仍允許。
  - 每項補測試。


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

- 最後完成：審查待修 2 項（2026-10-12，工作者 worktree，單一 commit）
- 已通過驗證：`npm run verify` 綠（Vitest 3632 通過、13 略過）
- 下一步：協調者確認後收官
- Blocker：無

## 完成結果

- 新增 `apps/editor/src/pages/resumes/copy/`：
  - `copy-rules.ts`：`copyBlockReason`（空白、任何 R1 問題、已退回、未接受〔只逐段確認另有說明〕、blockers 都不能複製）、`firstProblem`、`COPY_TEXT`。
  - `useSectionCopy.ts`：按下時 `resume.get` → `resume.check_export` → `resume.get`；兩次讀到的該段完全相同、文字等於畫面、已接受、檢查結果中該段沒有問題與 blocker，才寫剪貼簿。進行中鎖按鈕；卡片卸載、版本切換、畫面上該段改變、頁面有寫入進行中，回應一律作廢。
  - `SectionCopy.tsx`：按鈕＋停用原因＋結果訊息。
  - `copy-context.ts`：`publishCopyContext`／`useCopyContext`，由 `useResumeEditor` 發布畫面上的版本 id 與「有無檢查結果」（沒有檢查結果一律不能複製）。
- `SectionCard.tsx` 加 `<SectionCopy>`；`useResumeEditor.ts` 發布複製用狀態（卸載清空）。未改 `ResumesPage.tsx`。
- 未儲存修改：段落編輯中卡片被編輯框取代，沒有複製按鈕；檢查期間開始編輯，卡片卸載、回應作廢。
- 測試：`copy/SectionCopy.test.ts` 11 案例（通過才複製且請求順序固定；R1 問題／只逐段確認未接受／已退回／已接受但有 blocker／沒有檢查結果不能複製；編輯中；重檢變不通過；重檢期間被改；helper 與畫面不一致；進行中鎖定與過期作廢），用假 bridge transport 與假剪貼簿。
- 保守選擇與殘餘：
  - `ResumesPage.tsx` 不在 write_paths，版本 id 改由模組層級的小型 store 傳給段落卡片（單一編輯器頁面假設）；若日後 ResumesPage 可改，宜改為 props。
  - helper 內容與畫面不一致時只提示按「重新整理」，不自動更新畫面（自介是自動同步再按一次）。
  - 未接受除了 helper blockers 外在本機再擋一次；畫面任何寫入進行中也作廢複製。
- 審查待修 2 項（2026-10-12）：
  1. 空白／隱藏字元：`copy-rules.ts` 新增 `isBlankForCopy`（原文或 NFKC 後去掉 Default_Ignorable、Cf、Mn、Me、Co 與所有空白後沒內容即空白）與 `hasHiddenChars`（含標籤字元 U+E0000～E007F 或私用區字元一律不能複製，`COPY_TEXT.hidden`）。刻意比 domain `isBlankForNumbers` 更嚴（domain 判空白者這裡必判空白）。不重用 domain：架構規則 editor 只能依賴 contracts（`docs/specs/architecture.md`），協調者裁定不搬套件、不改契約。測試 `copy/copy-rules.test.ts`（標籤字元整段／夾帶、私用區、零寬整段、組合記號整段、不可見字元夾空白不能複製；重音、emoji＋ZWJ、變體選擇符可以複製）。
  2. 檢查結果改變時作廢：`useSectionCopy.ts` 寫入剪貼簿前除了段落，還比對畫面上的整個把關狀態（段落＋該段問題＋blockers）是否與按下時相同、畫面仍有檢查結果，並用最新狀態重跑 `copyBlockReason`；任一不符顯示 `COPY_TEXT.stale` 不複製。測試 `SectionCopy.test.ts`「複製進行中按重新整理、段落沒變但新出現 R1 問題／失去檢查結果：舊的成功檢查作廢，不複製」（修正前兩案例皆失敗）。
  - 殘餘：editor 與 domain 兩套空白判定；domain 日後若放寬或改變，要同步確認 editor 仍是超集合。含標籤字元的 emoji（例如英格蘭旗）也會被擋，屬保守取捨。
