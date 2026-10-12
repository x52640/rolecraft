---
id: P1-T088
phase: 1
status: in_progress
depends_on: ["P1-T077"]
specs: ["web-resume-capture.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/src/sites/registry.ts", "apps/extension/src/sites/registry.test.ts", "apps/extension/src/sites/resume/", "apps/extension/src/sites/104/resume/", "apps/extension/src/sites/104/fixtures/resume-edit.html", "docs/adr/0004-104-job-page.md"]
contract_change: none
expected_commit: "feat(P1-T088): extension：104 履歷頁擷取濾掉介面固定字樣"
---

# extension：104 履歷頁介面字樣過濾（D29 (a)）

## 目標

104 履歷編輯頁擷取時，把 104 介面固定字樣（按鈕、標題裡的提示、推廣連結）濾掉，不進核對畫面、不送模型。規則登記在站台設定，共用抽取流程只執行登記的規則。

## 範圍

### 包含

- 共用抽取（`src/sites/resume/`）支援站台登記的介面字樣過濾：整塊完全相等才丟、元素選擇器、標題內夾帶的提示從標題文字移除（web-resume-capture「區塊抽取規則」第 7 條）
- registry／`src/sites/104/resume/` 登記 104 的清單，以 `fixtures/resume-edit.html` 與 ADR-0004 第 5.3 節列的雜訊為準：編輯、版型、背景、更多、新增、刪除、前往查看；「排列在第一筆的會被系統當作最高學歷哟～」「系統依日期自動排序…」等標題內提示；「查看／解鎖薪資競爭力」、語文測驗連結、「免費職場能力檢測」等推廣連結（以 fixture 實際字樣為準，逐一列出）
- 更新 `104/resume/expected-blocks.json`，`RUN_CHROME=1` 真實 Chrome 比對通過
- ADR-0004 第 5.3 節改寫成「已過濾」並列出登記的清單；5.4 補上過濾後的區塊數

### 不包含

- 改 fixture 的去識別化內容（fixture 列在 write_paths 只為必要時加註；能不動就不動，不得改履歷內容）
- 預覽頁登記、其他版型、英文姓名元素
- 編輯器畫面（P1-T089）、helper／pipeline 的去個資規則

## 工作區與 Context

### 必讀入口

- `plan.md` D29、D28
- `docs/README.md`
- `docs/specs/web-resume-capture.md`「頁型登記」「區塊抽取規則」「驗收」
- `docs/adr/0004-104-job-page.md` 第 5 節；P1-T075、P1-T077 完成結果

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
RUN_CHROME=1 npx vitest run apps/extension/src/sites/104/resume
```

## 實作要求

- **高風險（個資範圍不得擴大）**：過濾只能讓送出內容變少；不得讓收合、隱藏、根節點外的內容被讀到，不得改根節點與姓名元素規則。收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 不得用子字串比對刪一般區塊（使用者的經歷描述可能含「編輯」「更多」等字）；標題只移除登記的整段提示字樣
- 共用流程不內建任何網站字樣；清單只放在 104 站台設定
- `submit_resume_capture` 形狀、上限不變
- 與 P1-T089 write_paths 不重疊，可平行（E5）；與 P1-T018（`apps/extension/src/sites/104/` 前綴）不可同時跑
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料

## 驗證

### 自動驗證

- 真實 Chrome：fixture 區塊與新的預期逐項相符；預期區塊不含 ADR 列的任何介面字樣；「學歷」「工作經驗」標題只剩標題文字
- 合成 DOM：完全相等才丟、部分相符（例如描述「負責編輯官網」）保留；標題提示移除後為空才丟；選擇器過濾；沒登記規則的站行為與現在完全相同
- 過濾前後，「更多」收合區的個資字串仍 0 筆；姓名元素文字不變

### 手動驗證

- 協調者 `RUN_CHROME=1` 實跑一次

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠、`RUN_CHROME=1` 比對綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：實作、測試、expected-blocks、ADR-0004 5.3／5.4 更新（worker，2026-10-13）
- 已通過驗證：`npm run verify` 綠；`RUN_CHROME=1 npx vitest run apps/extension/src/sites/104/resume` 3 檔 17 測試全過
- 下一步：協調者收官（對抗驗證 E3、codex review、`RUN_CHROME=1` 實跑）
- Blocker：無

## 完成結果

- 共用流程：`src/sites/resume/noise.ts`（`noiseElementMatcher`、`filterNoiseBlocks`）＋`types.ts` 的 `UiNoiseRules`（`texts` 完全相等、`selectors` 元素整棵不讀、`headingHints` 從標題移除）。選擇器只在 `extract.ts` 抽區塊時用（根節點本身除外、表格儲存格也看），不碰 `isSkipped`／姓名元素；文字過濾在上限之前（介面字樣不佔上限）。被丟區塊後的續行改成不續行（contracts 要求續行接同一段）。全部被濾光＝not_found。沒登記規則的站行為不變。
- 104 清單：`src/sites/104/resume/ui-noise.ts`，由 `config.ts` 帶入（registry 不動）。選擇器 `button`；完全相等 6 項（查看／解鎖薪資競爭力、測你的中文能力、求職門檻多益700你有嗎？免費測、免費職場能力檢測、前往查看）；標題提示 2 項。單字按鈕不登記成完全相等（職稱可能就是「編輯」）。
- 真實 Chrome：過濾前 214 → 過濾後 188 區塊（丟 26：按鈕組合 14、推廣連結 8、前往查看 4；2 個標題移除提示）；其餘非標題區塊與過濾前依序相同；「更多」收合區個資過濾前後皆 0 筆、`nameText` 相同。
- 測試：`resume/noise.test.ts`（合成 DOM 12 案例）；`104/resume/fixture.chrome.test.ts` 加過濾前對照組。
- codex 1 項（已修）：配對的表單控制項繞過選擇器過濾（label 包著登記為雜訊的 input 仍輸出標籤＋值）。改為配對探索也套用雜訊判定（`dom.ts` `findPairs`）：控制項或它的 label 在雜訊元素內就整對不讀（值與 label 文字都不出）；在雜訊內的 dt 不當標籤、切斷配對；label／dt 的標籤文字不含其中的雜訊元素文字。`noise.test.ts` 加 4 案例（修正前重現失敗）。姓名元素文字不套過濾。
- codex 複審 1 項（已修）：過濾讓 dt 標籤變空或 dd 被過濾時解除了配對，原本被配對抑制的 dt 內容（例如 dt 裡的控制項值）露出。改為配對結構一律照未過濾的結果決定（dt＋dd、label＋控制項、th＋td），過濾只從顯示的標籤扣掉介面元素文字；標籤扣完變空時值改當段落，原本被抑制的 dt／label 照樣抑制。`noise-pairs.test.ts` 加 4 案例（dt 變空、dd 被過濾、label 全是雜訊而包著另一控制項、th 全是雜訊；修正前皆失敗）；`noise.test-helpers.ts` 的通則：每個合成 DOM 同時跑未過濾版本，斷言過濾後每段文字／標籤都是過濾前某段的子序列、`nameText` 相同。
- codex 複審（測試輔助，已修）：通則的子序列比對一邊用 code point、一邊用 UTF-16 索引，含擴充區漢字或 emoji 時相同字串也判失敗；兩邊統一用 code point，`noise.test.ts` 補 `𠮷`、emoji 案例。
- 殘餘：fixture 只有預設版型，其他版型或 104 改版的按鈕／連結字樣要再登記。
