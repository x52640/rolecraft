---
id: P1-T089
phase: 1
status: in_progress
depends_on: ["P1-T081"]
specs: ["resume-import.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/"]
contract_change: none
expected_commit: "feat(P1-T089): editor：網頁來源核對改版（原文收合、欄位出處、只看標黃欄位）"
---

# editor：網頁來源核對改版（D29 (b)(c)(d)）

## 目標

匯入頁網頁來源：原文區改成預設收合、照原結構呈現；每個欄位旁顯示出處原文；網頁來源不強制核對：標黃只當提醒，確認前顯示精簡摘要（擁有者 2026-10-13 再裁定）。仍然要使用者按下確認才寫入 Profile。

## 範圍

### 包含

- (b) 原文區：預設收合的「查看擷取原文」；展開照結構呈現（標題、清單項目符號與層級縮排、標籤＋值兩欄、依標題分組）；不顯示區塊編號與種類，編號只在滑鼠移上或從欄位連過去時顯示；截斷提示收合時也看得到
- (c) 每個有出處的欄位旁顯示出處區塊原文（最多兩行），可點一下連到原文區對應區塊（自動展開）
- (d) 免標示／標黃判定，照 resume-import「網頁來源的核對（D29）」（2026-10-13 再裁定版：值包含於單一出處區塊且無個資標示即免標示；不需要欄位對應表）；標黃顯示原因與出處原文，使用者改過的欄位不再標黃
- 確認流程（擁有者 2026-10-13 再次裁定，覆蓋 resume-import 該節的確認部分）：網頁來源拿掉「我已逐欄核對」勾選，也不做「已看過」流程；標黃只當提醒，確認鈕不因標黃停用；確認前顯示精簡摘要（每段經歷一行「公司｜職稱｜期間」、學歷一行，預設收合、可展開）；確認區提示「沒看也能確認；產生履歷前建議到個人資料頁檢查一次」（個人資料編輯頁另開 Task）。PDF 來源維持現行勾選

### 不包含

- PDF 來源的核對行為（維持現行）
- helper／pipeline／contracts 的任何變更
- 擷取端介面字樣過濾（P1-T088）

## 工作區與 Context

### 必讀入口

- `plan.md` D29、D28、D4
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入工作階段」「網頁來源的 AI 整理」「網頁來源的核對（D29）」
- P1-T081 完成結果；`apps/editor/src/pages/import/`（`ImportPage.tsx`、`ai-form.ts`、`components/WebPreview.tsx`、`components/ConfirmBar.tsx`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 契約判斷（規劃時已查）

- 不改契約即可判定：`ImportWebDraftField` 有 `value`、`blockId`（第一個引用區塊）、`containsPersonalData`；`import.get` 的 `ImportWebBlock` 有 `text`。判定「只出自單一區塊」＝欄位值正規化（去空白、NFKC，與照抄檢查相同）後是 `blockId` 指到區塊文字（正規化後）的子字串；不是就代表跨多區塊 → 標黃。若發現此推論不成立就停下回報。
- 實作時若發現這個推論不成立（例如某類欄位拿不到出處區塊），停下回報，不得自行改 `packages/contracts`；屆時另開契約 Task（候選：`ImportWebDraftField` 相加 `blockIds: WebBlockId[]`）。

## 實作要求

- **高風險（放寬確認；R1／D4 只寫有出處或使用者確認的事實）**：自動帶入的欄位也只有在使用者按下確認後才寫入；不得新增任何自動呼叫 `import.confirm` 的路徑（標黃不擋確認，擁有者 2026-10-13 再次裁定）。收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 「含姓名或聯絡資料」標示的欄位一律標黃
- 網頁來源仍不自動呼叫模型（P1-T081 的保證不得退步）
- 與 P1-T088 write_paths 不重疊，可平行（E5）；與 P1-T087（同 write_paths，目前 blocked）不可同時跑
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向；`ImportPage.web.test.ts` 已 304 行附近，新測試另開檔）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- resume-import「網頁來源的核對（D29）」驗收各項
- 不按確認不送 `import.confirm`；有標黃時確認鈕仍可按；確認前摘要預設收合
- PDF 來源既有測試照舊通過（逐欄勾選不變）

### 手動驗證

- 協調者以開發入口或擁有者 104 實跑看一次畫面

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：2026-10-13 worker 實作完成（照擁有者 2026-10-13 再次裁定的確認流程），一個 commit
- 已通過驗證：`npm run verify` 綠兩次
- 下一步：協調者跑對抗驗證（E3）與 codex review；手動看一次畫面
- Blocker：無
- codex 審查待修 2 項（2026-10-13）：(1) `ImportReview.tsx` 連到某區塊後再點引用同一區塊的另一欄位（公司與職稱共用一行）不會再捲動／聚焦（狀態值沒變、導覽 effect 不重跑）→ 每次跳轉給遞增序號；(2) `WebRawBlocks.tsx` 清單項的續行（continues）被渲染成獨立 `<li>`、多出項目符號 → 併回前一個清單項，保留各自區塊錨點

## 完成結果

- 依擁有者 2026-10-13 再次裁定改做「不強制核對」：網頁來源沒有勾選、沒有「已看過」，標黃只當提醒（顯示原因＋出處原文），確認鈕不因標黃停用；確認列加預設收合的精簡摘要（每段經歷「公司｜職稱｜期間」、學歷一行）與「沒看也能確認；產生履歷前建議到個人資料頁檢查一次」。PDF、手動輸入維持「我已逐欄核對」勾選。
- 標黃判定（`web-origin.ts`）：值照抄檢查正規化（NFKC、去空白與零寬字元）後包含於出處區塊文字、且只有一個草稿欄位、無個資標示 → 免標示；否則標黃（跨區塊／含個資）。學歷多筆併成一格、出自不同區塊的同值技能也算跨區塊；使用者改過的欄位取消標黃。契約推論成立，未改 contracts。
- 原文區（`WebPreview.tsx`、`WebRawBlocks.tsx`）：預設收合；展開依標題分組、清單依層級縮排、標籤＋值兩欄；區塊編號只在 title（滑鼠移上）或從欄位出處連過去時顯示；截斷提示收合時也在。欄位旁出處（`FieldSource.tsx`）最多兩行，點了展開並捲到、聚焦該區塊。
- 高風險：網頁來源的確認鈕改成 `type="button"`，表單 Enter（隱式送出）不寫入；`submit` 另檢查 PDF／手動未勾選不送。沒有新增自動呼叫 `import.confirm` 或 `import.ai_parse` 的路徑。
- 偶發失敗（`ImportPage.web.test.ts`「AI 失敗」）：`useAiParse` 換核對時，上一個 effect 的收尾（cancel）在 React 排程讓出時會晚於使用者按「用 AI 整理」才執行，把剛送出的那次整理作廢：`import.ai_parse` 已送出、結果被丟掉、畫面卡在「整理中」。這是產品 bug（使用者手快也會遇到），不只是測試問題。修法：整理記下所屬核對（runKey），effect 收尾只作廢屬於自己那次核對的整理；新核對已由按鈕開始的整理保留。回歸測試 `ImportPage.ai-race.test.ts` 讓排程每次讓出、在 effect 前按鈕，舊程式穩定重現、新程式通過。
- 新測試：`web-origin.test.ts`（判定與 formFromAiDraft 出處）、`ImportPage.web-review.test.ts`（收合／結構、標黃、出處連結、改過取消標黃、有標黃可確認、Enter 不寫入、摘要、PDF 不變）、`ImportPage.ai-race.test.ts`。既有網頁測試改為對應收合原文與無勾選。
- codex 審查 2 項已修（另一個 commit）：(1) 跳轉目標改成 `{ blockId, seq }`，每次點出處 seq 遞增，導覽 effect 依 seq 重跑，連續點引用同一區塊的欄位也會再捲動、聚焦；(2) 清單項的續行區塊併進前一個 `<li>`（換行接在同一項），每段保留自己的區塊錨點與 title。測試先寫並確認舊程式失敗：`ImportPage.web-review.test.ts`「再點引用同一區塊的另一欄位出處」「清單項的續行併回前一項」與結構測試的清單項數。
- 殘餘：手動輸入工作階段仍用勾選（裁定只提網頁來源）；畫面未實機看過（待協調者手動驗證）。
