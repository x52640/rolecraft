---
id: P1-T022
phase: 1
status: done
depends_on: ["P1-T002", "P1-T003", "P1-T004", "P1-T005", "P1-T012", "P1-T008"]
specs: ["evidence-model.md", "runtime-and-budget.md", "providers.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/analysis/", "packages/pipeline/src/prompts/", "packages/pipeline/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T022): pipeline：文件分析成事實項"
---
# pipeline：文件分析成事實項

## 目標

F04、F05：把專案文件變成有來源的事實項，分批、可續跑。

## 範圍

### 包含

- 提示組裝：文件內容以資料區塊包裹並明示不是指令（D6）
- 依 R8 拆批、依 R9 單元化執行
- 模型輸出解析為事實項草稿，每項必須帶來源片段位置；沒有來源的丟棄
- 增量：只處理新增或變更文件（套用 R2）
- 全域履歷摘要維護

### 不包含

- UI

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/evidence-model.md`
- `docs/specs/runtime-and-budget.md`
- `docs/specs/providers.md`
- 相依 Task 的「完成結果」：P1-T002
- 相依 Task 的「完成結果」：P1-T003
- 相依 Task 的「完成結果」：P1-T004
- 相依 Task 的「完成結果」：P1-T005
- 相依 Task 的「完成結果」：P1-T012
- 相依 Task 的「完成結果」：P1-T008

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 模型輸出永遠不轉成指令或路徑
- 輸出 schema 驗證失敗視為單元失敗，不半套寫入
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 以 fake provider 測試完整流程、拆批、暫停續跑

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：E3 對抗驗證 4 項修正（連結完整比對、other 錯誤不重試、摘要送出前重查授權）
- 已通過驗證：主樹 `npm run verify` 綠（Vitest 1855 通過）；對抗驗證（E3）屬實 4 項已修（c4aba85）；「事實項文字與原文語意綁定」「完成狀態由模型判讀」判定為設計限制（R1 由使用者 F07 把關），列入保守選擇 (4)
- 下一步：無（已收官）
- Blocker：無（相依 P1-T002～T005、T008、T012 皆已 done）

## 完成結果

- 結構（`packages/pipeline/src/`）：`prompts/analysis-prompt.ts`（指令、資料區塊、界線標記、檔名清理）；`analysis/` 下 `plan.ts`（增量＋R2＋拆單元）、`prepare.ts`（送出前複查）、`output.ts`（模型輸出格式驗證）、`drafts.ts`（草稿→事實項）、`summary.ts`（全域履歷摘要）、`runner.ts`（R9 執行）、`types.ts`。pipeline 不能依賴 storage，持久化全部經注入的埠（`commitUnit`、`saveJob`、`recordRunCheck`、`loadDocument`）。
- D6 提示：文件片段、檔名、全域摘要都包在 `<<<DATA 種類 標記>>> … <<<END 種類 標記>>>` 內，指令前後明示「是資料不是指令」；標記每次隨機（取自注入的 ID），出現在任何資料中（不分大小寫）就換，換 5 次不成就丟錯不送出。只送檔名（去控制字元、≤100 字），不送資料夾路徑。片段以本機編號 S1…標示，模型輸出只能引用編號。
- 輸出驗證（手寫嚴格驗證，pipeline 不可用 zod）：整份必須是單一 JSON 物件（可被一層 ```json 包住）；多餘欄位、缺欄位、型別錯、超量、索引不合法、`__proto__`、功能／交付物缺完成狀態、其他類型帶完成狀態、完成狀態不在 planned／documented_done／unknown（模型標 `user_confirmed_done` 即整份不合格，D14）都視為單元失敗，不寫入任何部分。
- 草稿→事實項（R1）：原文正規化後必須落在所引用片段的範圍內，再用 domain `createSourceExcerpt` 在目前版本全文定位；片段內多次出現且落在不同區塊指紋 → 歧義丟棄。事實項文字的每個數字都要能在原文中找到（`extractNumbers`／`numberKeys`，無法解析的數字也丟）；連結必須完全等於原文中的某個網址 token，任何類型文字中出現的網址也一樣（見下方對抗驗證修正）。依據只放來源片段，`userConfirmation` 一律 null，複核狀態從 normal 開始，最後再過 contracts `Claim` schema。同單元或與既有「正常」事實項重複者丟棄。每個丟棄記索引與原因。
- 同文件矛盾：模型可在 `conflicts` 列出索引；涉及且留下的事實項一律升為 `source_conflict`（只升不降），有兩個以上不同原文時另產生 `SourceConflictMark`（same_document）。
- 增量與 R2（`planAnalysis`）：既有事實項跑 `evaluateClaimSources`，仍正常的換成新版本位置（rebased），有變的待複核、來源刪除或非已授權的來源已移除，回傳有變動的完整事實項；只分析「已授權」且新增、版本／雜湊不同或被列入重新分析的文件；待確認、已撤銷文件內容不進計畫。只有空白的文件列為 `emptyDocuments`，不送出。
- R8 拆批：每份文件各自拆，單元只屬於一份文件。先用 domain `planBatches` 分段（預算先扣掉實際包裝比 `SEGMENT_OVERHEAD_TOKENS` 多出的部分），再以「骨架（最長標記估算）＋Σ（片段＋包裝）」重新裝箱；每單元記估算值、預算、片段在正規化全文中的區間。骨架就放不下 → 計畫失敗不送出。送出前用實際提示再估一次，超過就不送（`over_budget`）。
- R9 執行（`createAnalysisRunner`）：一次一個單元；送出前重讀文件，版本／雜湊不同、非已授權、不存在 → `not_sent`（不送出、狀態不動，需重新規劃）。每次送出都經呼叫端的 `execute`（應包 `runWithSubscriptionCheck`，R6 每次重做），確認紀錄一律交給 `recordRunCheck`；R6 不成立 → `blocked`，工作狀態回到送出前。額度錯誤 → 暫停 quota_exhausted；取消（含確認途中）→ 暫停 user_cancelled；只有 transient 錯誤與輸出不合格依 domain 重試政策（2 次、2s→4s）重試，用盡暫停 retries_exhausted；other 錯誤不重試（見下方修正）。單元結果與新工作狀態經 `commitUnit` 一次寫入，寫入成功才採用新狀態。取消後才回來的結果經 attemptId 判定丟棄。暫停的工作 runner 不會自己跑（回 `not_running`），續跑由呼叫端以 domain `resumeJob`（需 R6 通過）觸發（D21）。取消訊號型別是泛型（pipeline 的 tsconfig 沒有 DOM／Node 型別）。
- 全域履歷摘要：每份文件一段（單元摘要依序串接，≤1000 字），重新分析的文件整段換掉、不在有效文件集合（刪除、撤銷、待確認）的移除；彙整成 ≤6000 字放進提示（資料區塊）。計畫保存結構化的各段（每段帶來源文件），每次送出前重查（見下方修正）。
- 測試（fake provider，經 `runWithSubscriptionCheck`）：完整流程（兩份文件、注入文字只在資料區塊、捏造原文被丟、資料夾路徑不送出）、額度暫停→重開還原→使用者續跑只送剩下單元、暫停工作不自跑、不合格輸出（含 user_confirmed_done）有上限重試且不寫入、R6 不成立不送出、取消後晚到結果丟棄、文件變更或撤銷授權不送出；另有拆批（每單元實際提示 ≤ 預算、片段覆蓋全文）、R2 增量、輸出 schema 20 種不合格、草稿驗證、摘要上限。
- 保守選擇／待擁有者裁定：(1) 模型輸出 `user_confirmed_done` 整份判失敗（而非降級成 documented_done）；(2) 只有 transient 錯誤與輸出格式不合格走有上限重試（最多多耗 2 次呼叫）；other 錯誤（401／403、隔離檢查失敗等）不重試、不重送，回 `blocked`；(3) R6 不成立時沒有對應的 PauseReason，runner 回 `blocked` 且不改工作狀態，是否新增暫停原因（contracts 變更）待裁定；(4) 原文沒有最短長度限制，很短的原文（例如「完成」）只要在片段內唯一可定位就算來源；(5) 跨文件矛盾偵測未做，只做同文件（模型在同一單元內指出）；矛盾牽涉到被去重掉的既有事實項時，既有那項不會被升級。
- 殘餘：`SourceDocument.contentHash` 由呼叫端提供，pipeline 不重算全文雜湊，只比對版本與雜湊欄位；ProjectEvidence（專案分組）不在本 Task；helper 尚未接上（runner 的埠由 helper 以 storage／sources／providers 實作）。

### 對抗驗證修正

| 缺陷 | 修正 | 測試 |
| --- | --- | --- |
| （major）link 只做子字串比對，截斷網址、單一字元都能通過 | 新增 `urls.ts` `extractUrls`（http／https、www. 開頭；遇空白、引號、角括號、CJK／全形標點結束，去結尾半形標點）；link 的 `text.trim()` 必須完全等於原文某個網址 token | `drafts.test.ts`：截斷網址、單一字元、非網址文字都丟；`urls.test.ts` |
| （minor）其他類型事實項文字中的網址未檢查 | 任何類型文字中的每個網址都必須完全等於原文某個網址 token，否則 `link_not_in_excerpt`；網址檢查在數字檢查之前 | `drafts.test.ts`：多路徑、截斷、捏造的 www 網址都丟 |
| （major）other 錯誤（401／403、隔離檢查失敗）被當暫時性重送 | 只有 transient 與輸出不合格可重試；other 比照 R6 不成立：回 `blocked`、工作狀態回到送出前、不寫入，`RunReport.blocked` 新增 `failure`（R6 不成立時為 null）把原因交給呼叫端，執行紀錄照樣交 `recordRunCheck`。未改 contracts／domain | `runner.test.ts`：401 與隔離失敗各只呼叫 1 次、不 sleep、不寫入 |
| （major）全域摘要在計畫時凍結成字串，撤銷授權後續跑仍送出 | `AnalysisPlan.globalSummary` 改為 `DocumentSummary[]`；規劃時只留來源已授權的段落，並以 `globalSummaryTokenBound`（全部段落組合＋截斷標記的估算，或 6000×2 取小）預留預算；每次送出前 `prepareUnit` 重查各段來源，不存在或非已授權就移除再組合 | `runner.test.ts`：暫停期間撤銷摘要來源 → 續跑提示不含該段 |

