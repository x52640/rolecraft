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

- 對抗驗證與 codex review（2026-10-12）屬實項：
  - 描述空白的經歷被提示要求必須產出一段，等於逼模型捏造 → 提示把描述空白的經歷標為「不要輸出」，「一段都不能少」只套用於描述非空白的；`convertSection` 對描述空白且無引用的經歷段丟棄
  - 背景產生失敗（暫停）時頁面鎖 5 分鐘、一直說「正在產生」 → 輪詢期間不鎖整頁：重新整理、職缺選單可用，並有「停止等待」；等待文字不再斷言「正在產生」（查 WorkJob 狀態需改 contracts，另案）
  - （codex）段落編輯中按產生，完成時自動切版本會丟掉未存的段落編輯 → 有未存編輯時不允許產生（或先確認），切版本前不丟草稿

- codex 審查待修（2026-10-12，修正 commit 2477974 的 codex review，協調者寫入）：
  1. （P2）未存編輯的保護沒套到「重新整理」：產生等待中開始編輯，新版本出現後按重新整理，`useResumeEditor` 的 `refresh()`→`loadVersions()` 直接選最新版本、卸下編輯框，草稿消失。編輯中重新整理要保留目前選擇，或先確認才丟掉草稿。
  2. （P2）重新整理時 `resume.get` 失敗：`loadView()` 清掉畫面、卸下編輯框，但上移到父層的 `editing` 狀態仍非 null，「產生客製履歷」一直停用，又看不到編輯框或取消鈕。讀取失敗時保留編輯框，或在編輯框消失時清掉 `editing`。
  - 每項補測試。

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

## 完成定義

- [x] 生成提示要求每段經歷都改寫、專案只是補充
- [x] 缺經歷段由程式補「沿用原文」並寫進 spec
- [x] 經歷段數字可出自同一段經歷描述
- [x] 履歷頁產生後自動輪詢、自動顯示新版本；等待期間不鎖整頁、可停止等待
- [x] 空白經歷不要求輸出；段落編輯中不能產生、不被自動切版本丟掉
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：審查 3 項修正（空白經歷不輸出、輪詢不鎖整頁、保護未存編輯）與回歸測試
- 已通過驗證：worktree 內 `npm run verify` 綠
- 下一步：協調者派 worker 修「codex 審查待修」各項（先重現，重現不了就記錄理由不修）；修完 codex review 修正 diff
- Blocker：無

## 完成結果

- 原因（提示與驗證兩頭都偏向只寫專案）：
  - 提示任務寫「從事實項整理…寫出客製履歷段落」、規則寫「段落只能寫事實項裡有的內容；每段都要列 citations，沒有根據就不要寫」，經歷區塊標題寫「只作背景，不可當成事實來源」，輸出範例也只有一段引用事實項的段落。經歷描述不是事實項，模型照字面就只能寫專案。
  - 程式端即使模型寫了經歷段：沒有引用一律丟（`no_citation`），數字只認引用的事實項，所以用到經歷描述裡的數字也會被丟。
- 提示（`packages/pipeline/src/generation/prompt.ts`）：任務改成「逐段改寫每一段工作經歷（主體），再視需要用事實項補充專案與自我介紹」；新增「經歷段落（必做）」規則：每段 E1、E2… 都要輸出、以經歷描述為原文依職缺挑重點改寫、無關經歷可精簡不可省略、可不引用事實項、專案不能取代經歷；經歷區塊標題改為「使用者確認過的經歷描述，是同一段經歷段落改寫的原文」；輸出範例改為經歷（無引用、有引用）＋專案三段。
- 輸出驗證（`sections.ts`、`grounding.ts`）：經歷段落允許沒有引用；數字、網址、倍數詞可來自引用事實項或同一段經歷描述（不認其他經歷）；仍不得寫職缺公司與職稱；domain R1 最後一道對經歷段帶已確認 Profile，並只放過「沒有引用」這一項（匯出前照 R1 要逐段確認）。
- 補段（`experience-fallback.ts`，選保守做法）：通過檢查後仍沒有段落的經歷，程式補一段沿用原文（文字＝經歷描述、無引用、待接受、理由註明是沿用），不額外呼叫模型；描述空白的不補；沒有任何模型段落通過時整份仍失敗。`GenerationResult.filledExperiences` 記錄補了哪幾段。規則寫進 `docs/specs/evidence-model.md` R1。
- 履歷頁（`useGenerateResume.ts`）：送出前記下現有版本，送出後每 3 秒列一次版本、最多 100 次，出現新版本就自動切過去顯示；照自介的操作 token 做法，離開頁面或切換職缺讓舊輪詢作廢；產生期間鎖住職缺選單、重新整理與所有段落操作。用完次數仍沒有新版本就提示稍後重新整理（沒有工作狀態的橋接操作，失敗原因看不到）。
- 測試（全用假 provider）：pipeline `experience-sections.test.ts`（提示措辭、無引用經歷段保留、數字只認同段描述、缺段補沿用原文、被丟的經歷段也補、全丟仍失敗）；helper `experience.test.ts`（假 Claude 子程序端到端：提示含逐段要求、補段存成待接受且有原文對照、經歷段數字不報問題、接受＋逐段確認後該段無阻擋）；editor `ResumesPage.generate.test.ts`（自動顯示新版本、產生中鎖定、輪詢用完提示並停止）。假 Claude 共用 fixture 抽到 `__fixtures__/fake-claude.ts`。
- 審查修正（對抗＋codex，2026-10-12）：
  - 空白經歷：提示把描述空白的經歷標「描述空白：不要輸出」、不放描述區塊，「一段都不能少」只套描述非空白的；`convertSection` 對描述空白又沒有引用的經歷段以 `no_citation` 丟棄（有引用事實項的照常）。
  - 輪詢不鎖整頁：只有送出請求（列版本＋送出產生）時鎖；等待新版本期間重新整理、職缺選單、段落操作都可用，另有「停止等待」；等待文字改為「已送出產生要求，正在等新版本出現」，不再斷言正在產生。
  - 未存編輯：段落編輯狀態移到 `useResumeEditor`；有段落編輯中時「產生客製履歷」停用並提示；等待期間才開始編輯的，新版本出現時只更新版本清單、不自動切換並提示。
  - 回歸測試：pipeline 兩項、editor 四項；換回舊實作時這些測試都會失敗（已實測）。
- 手動驗證：需協調者以 harness 實跑（真實模型），本 Task 不做。
