---
id: P1-T078
phase: 1
status: in_progress
depends_on: ["P1-T074"]
specs: ["resume-import.md", "evidence-model.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/resume-parse/", "packages/pipeline/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T078): pipeline：網頁區塊來源的去個資、提示與照抄檢查"
---

# pipeline：網頁區塊來源的去個資、提示與照抄檢查

## 目標

沿用 P1-T069 的 AI 整理，把來源單位從「頁-行」擴成網頁區塊：送模型前在本機去個資、提示帶區塊種類與標籤、照抄檢查以區塊為單位。PDF 路徑行為不變（除了共用的 512 KiB 草稿上限）。

## 範圍

### 包含

- 準備（resume-import「網頁來源的 AI 整理」去個資）：區塊依序當行；標籤＋值區塊以「標籤：值」判斷，個資標籤整塊移除、值預填；`continues` 的同標籤續行一併移除並接回同一列（預填與遮蔽用完整值）；聯絡區移除到下一個同級或更高級標題；已知姓名四個來源由呼叫端傳入（姓名元素文字先套 `cleanHeaderName`）、別名規則；既有 Profile 的聯絡值加入遮蔽；送出條件不成立（本次頁面姓名沒辨識出、也沒有使用者確認的姓名）→ 回明確拒絕原因、不產生提示
- 提示：區塊帶「[b12 h3]」「[b13 標籤=職務類別]」格式，整份在隨機界線資料區塊內；模型輸出來源編號依來源種類驗證（PDF `頁-行`、網頁 `b<數字>`），格式不對整份不合格
- 照抄檢查：值出自引用區塊；描述分段規則；標籤不算來源文字；「至今」獨占區塊時往前找日期上下文（略過只有分隔符的區塊、去結尾分隔符後整個是 `isDateValue`、中間無標題），上下文不列入引用
- 欄位值還原出姓名或個資時標旗標（W7）
- 通過檢查的草稿序列化後 UTF-8 超過 512 KiB 整份判失敗（PDF 與網頁共用）

### 不包含

- helper 接線、記憶體狀態、姓名從哪來（P1-T080）
- 編輯器
- 改 PDF 既有規則（P1-T069 的回歸測試全部照舊通過）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「AI 整理欄位」「網頁來源的 AI 整理」
- `docs/specs/evidence-model.md` R1
- P1-T069 完成結果（含各輪屬實項）；`packages/pipeline/src/resume-parse/`（`prepare.ts`、`personal.ts`、`redact.ts`、`labels.ts`、`match.ts`、`check.ts`、`output.ts`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資不送模型、R1 不捏造）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 提示字串不含姓名、電話、email、地址；含「姓名只在無標籤標題」案例；「林測試 Alex Lin」英文別名被遮蔽；分成多行（`continues`）的地址預填與遮蔽都是完整值；送出條件不成立時不產生提示
- 照抄：以區塊為來源的捏造被丟棄；切開的多行描述、「2019/03」「~」「至今」三個區塊被接受；「2020 年得獎作品」後接「至今」、中間隔標題的「至今」被丟棄；網頁來源編號用 `頁-行` 格式整份不合格
- 模型重複照抄同一大區塊、草稿超過 512 KiB 時整份失敗（PDF 也套用）
- P1-T069 既有回歸測試全部通過

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：2026-10-12 worker 實作完成（單一 commit，未 push）
- 已通過驗證：`npm run verify` 綠（Vitest 3827 通過、13 略過）；P1-T069 既有 resume-parse 測試 91 項全過、helper import 測試全過
- 下一步：協調者收官（E3 對抗驗證上限 4、codex review），再標 done；helper 接線在 P1-T080
- Blocker：無

## 完成結果

- 新增（`packages/pipeline/src/resume-parse/`）：
  - `web-personal.ts` `splitWebBlocks`：區塊依序當行套 PDF 標籤規則；標籤＋值區塊直接看標籤；被移除區塊後的 `continues` 一併移除並接回同一列；標題聯絡區移除到同級或更高級標題（段落形式照 PDF 8 行規則）；同標籤第二個值不預填但一律遮蔽；遮蔽用每段＋接回後完整值。
  - `web-names.ts` `knownNames`：四個姓名來源合併；中文姓名開頭後接 1–3 個大寫英文字的別名（headerNameAlias 同規則，另允許中英之間無空白）；「中文名 其他字」切出中文名。
  - `web-prepare.ts` `prepareWebResumeParse`：送出條件（姓名元素或姓名標籤值，否則要使用者確認姓名；只有舊 Profile 姓名不算）→ `name_unconfirmed`；標籤也遮蔽；既有 Profile 聯絡值加入遮蔽；姓名元素文字預填「姓名」，出處取第一個含它的區塊，找不到不預填。
  - `web-prompt.ts`：「[b12 h3]」「[b13 標籤=職務類別]」「li2」「tr」「p」標記，隨機界線資料區塊。
  - `web-check.ts` `checkWebResumeParse`、`currentFromContext`：出處＝區塊編號；標籤不算來源；獨占區塊的「至今」往前找日期上下文（略過純分隔符、去結尾分隔符後整個 `isDateValue`、無標題區塊、區塊編號須連續）；還原佔位字時標 `containsPersonalData`。
- 共用改動：`check.ts` 抽出 `checkFields`＋`FieldAdapter`（PDF 行為不變，`checkResumeParse` 簽名不變）；`output.ts` `parseResumeParseOutput(raw, source='pdf')` 依來源驗編號；`run.ts` 加 `runWebResumeParse`、`draftFitsLimit`，PDF 與網頁草稿 UTF-8 超過 512 KiB 判 `invalid_output`；`redact.ts` 加 `restoresSecret`（相加）；`personal.ts` 匯出 `CONTACT_HEADINGS`、`CONTACT_BLOCK_MAX`；`types.ts` 加 `SourceLine`、`WebSentLine`、`WebResumeParseInputs`。
- 測試：`web-prepare.test.ts`（9）、`web-check.test.ts`（7）。
- 保守選擇：送出條件 (2) 認任何形式抽到的姓名標籤值（含段落／表格「姓名：值」）；「至今」上下文中間有本機移除的區塊即不算；W7 旗標只做網頁來源（PDF 欄位不加，維持既有輸出）。
