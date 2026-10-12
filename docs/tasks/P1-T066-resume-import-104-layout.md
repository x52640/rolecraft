---
id: P1-T066
phase: 1
status: in_progress
depends_on: ["P1-T065"]
specs: ["resume-import.md", "bridge.md"]
track: resume-import
primary_repo: rolecraft
write_paths: ["packages/resume-import/src/", "packages/contracts/src/bridge/editor/import.ts", "packages/contracts/src/bridge/__fixtures__/editor-requests.ts", "apps/helper/src/handlers/import/", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "apps/editor/src/pages/import/form-model.ts", "apps/editor/src/pages/import/form-model.test.ts", "apps/editor/src/pages/import/ParsePreview.tsx", "docs/specs/resume-import.md", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T066): 104 履歷 PDF 版面辨識，經歷整段帶入公司、職稱、日期與描述"
---

# 104 履歷 PDF 版面辨識

## 目標

擁有者 P1-T032 實測（2026-10-12）：104 履歷 PDF 解析後，經歷欄位亂切（公司欄放進內文片段、職稱與日期空白、描述被拆碎），姓名空白，個人資料只有姓名一欄。通用規則（找「公司」字樣行）不適合 104 版面。改成：辨識出 104 版面時用專屬規則產生結構化草稿；認不出時沿用通用規則。

不用 AI 解析（擁有者未裁定前採保守：不耗額度、不把聯絡方式等個資送模型）；此選擇記入 CURRENT_TASK 待裁定。

## 104 版面特徵（擁有者真實檔去識別化後的結構，協調者提供 `104-structure.txt`）

- 段落標題字高約 11.7、x≈23：個人資料區（無標題）、學歷、工作經驗、求職條件、語文能力、專長、自傳、專案成就、附件等
- 頁首：姓名在最上方大字（字高約 14.1，與標語同一行、以 Tab 分隔，姓名是第一段）
- 個人資料：「標籤 ⇥ 值」行（就業狀態、主要手機、E-mail、通訊地址、英文姓名、聯絡方式、駕駛執照、個人資料…）
- 工作經驗段：「總年資 …」一行；每段經歷以字高約 11.7、x≈68 的職稱行開始；右欄（column 1）有日期「YYYY/M~YYYY/M」或「YYYY/M~仍在職」與年資；下一行公司「名稱（產業 規模）」；再下一行「職務類別 | 地點」（字高約 9.4）；之後是內文（含「核心職責」等小標、• 條列、續行縮排 x≈84）；最後可能有 `#標籤` 行（字高約 9.4）
- 一段經歷內可能再有「子職務 | YYYY/MM – YYYY/MM」與「管理人數：…」等內文，一律算進該段描述，不另拆段

## 範圍

### 包含

- `@rolecraft/resume-import`：偵測 104 版面（多個 104 特有段落標題＋經歷區塊樣式同時成立才算），產出結構化草稿：
  - 個人資料：姓名＋「標籤 ⇥ 值」各行（保留原標籤）；學歷段整理成一個「學歷」欄
  - 經歷：每段 公司（去掉括號內產業規模）、職稱、開始、結束（仍在職＝至今）、描述（內文行接回，條列續行併回同一條，保留換行與 • ）
  - 技能：「專長」段與經歷的 `#標籤`（去 #、去重）
  - 每個欄位都帶出處（頁碼、行號），不捏造：找不到就留空
  - 求職條件、語文能力、自傳、專案成就本 Task 不進 Profile（Profile 沒有對應欄位），只留在原文預覽
- contracts（相加）：`ImportDraft` 加可選的結構化草稿欄位（例如 `structured`），舊欄位不動；ADR-0006 記一項
- helper import handler 傳出結構化草稿
- 編輯器 `form-model.ts`：有結構化草稿就用它預填表單，否則沿用舊邏輯
- 測試：用合成、去識別化的 104 版面座標（照上方特徵），驗證經歷段數、各欄位、續行合併、仍在職、標籤；非 104 版面走舊路徑結果不變
- spec `resume-import.md` 補一段：104 版面專屬規則、認不出時退回通用規則

- 協調者真實 PDF 實測、對抗驗證與 codex review（2026-10-12）屬實項：
  - （實測＋codex P2＋對抗）日期靠行頂排序歸段，擁有者真實 PDF 第 2～4 段日期整排錯位一格（第 2 段吃到第 3 段日期）→ 日期／年資改用幾何綁到同一列的職稱（基線差小於職稱字高、x 在右側），都對不上才退回排序；測試含基線偏高 1、2.5、3pt
  - （codex P1）右欄字少時 `layoutPage` 退回單欄，產生「職稱⇥日期」「公司⇥年資」的合併行 → 分類前先把 Tab 後的日期／年資拆出；測試要經過 `layoutPage`
  - （對抗）公司行換行時第二行與「職務類別 | 地點」進了描述、括號沒去掉 → 括號未閉合時接續下一行到公司；公司後到第一個內文或條列前的「X | Y」小字行都略過
  - （對抗）非 104 的一般中文履歷（全文同字高、標題 x 小）被誤判成 104，預填比通用規則差 → 偵測加 104 特有訊號（公司行「（…業 …人）」或「職務類別 | 地點」小字行、職稱字高明顯大於內文、日期在右側）；加反例測試
  - （對抗）「標籤：值」規則把單獨的網址行切成 `https` 標籤 → 冒號後緊接 `//` 不算標籤
  - （codex）`#標籤` 切法把 `C#`、`F#`、`C#.NET` 切壞 → 只在行首或空白後的 `#` 算標籤開頭
  - （codex）標籤續行後面還有其他標籤時整行被併進前一個 → 只併到下一個標籤前，其餘照常收

### 不包含

- 匯入頁畫面與樣式（P1-T067）
- AI 解析、OCR、其他人力銀行版面

## 工作區與 Context

### 必讀入口

- `docs/specs/resume-import.md`、`docs/specs/bridge.md`（import 段）
- P1-T009、P1-T020、P1-T065 完成結果
- `packages/resume-import/src/`、`packages/contracts/src/bridge/editor/import.ts`、`apps/editor/src/pages/import/form-model.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 協調者例外允許本 Task 改 contracts（相加）與 fixtures（worker 規則 10 對本 Task 不適用）
- 不讀、不複製擁有者真實 PDF；測試資料一律合成且去識別化（不得出現真實姓名、電話、email、地址、公司名）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 見「範圍」測試項

### 手動驗證

- 擁有者重新匯入 104 PDF，經歷各段公司／職稱／日期／描述正確（需擁有者，併 P1-T032）

## 完成定義

- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：首次實作（07919bd）；實測＋對抗＋codex 屬實 7 項修正（fix commit）
- 已通過驗證：worktree `npm run verify` 綠；7 項回歸測試（`build-104-fixes.test.ts`）換回舊實作全部失敗、新實作通過
- 下一步：協調者收官（對抗驗證、codex review）
- Blocker：無（手動驗證需擁有者，併 P1-T032）

## 完成結果

- `packages/resume-import/src/draft/layout104/`：每頁依行頂由上到下重排後分類（字高＋x，不只靠欄位序號），右欄日期／年資排在段尾或落到 column 0 也能歸到所屬經歷；出處仍指原閱讀順序的行號。認 104：至少 3 個 104 段落標題（含工作經驗）＋至少一段有職稱與日期；否則 `structured` 不存在，通用規則結果不變。
- 結構化草稿：姓名（頁首大字第一段）、「標籤 ⇥ 值」與「標籤：值」行（保留原標籤、值換行接回）、學歷整段；經歷公司（去最後一組含「人／業」的括號）／職稱／起訖（仍在職＝至今；多個區間取最早開始、最晚結束）／描述（條列續行併回、保留換行與 •，職務類別行與 #標籤不進描述）；技能＝專長段＋經歷 #標籤（去 #、去重、換行標籤接回）。
- contracts：`ImportStructuredDraft`／`ImportStructuredExperience`、`ImportDraft.structured`（可選）；helper `to-result.ts` 帶出；`form-model.ts` 有結構化草稿就用它預填（姓名列固定第一）；`ParsePreview.tsx` 的 DRAFT_GROUPS 排除 `structured` 鍵。
- 保守選擇（待擁有者裁定）：多日期區間合併方式、公司括號只去含人／業者、技能只收 #標籤、職務類別與求職條件等不進 Profile、頁首摘要只收姓名與「標籤：值」、日期保留原格式不補零。
- 修正 7 項（`dates.ts` 新增）：日期改用幾何綁到同一列職稱（同頁、基線差小於職稱字高、在職稱右側 150pt 以上，取最近；都對不上才退回排序上的前一段且須在其職稱之下），實測座標（職稱 y=261／652／384／635、日期偏高 2～3pt、學歷日期 y=375）重現於 `__fixtures__/layout104-geometry.ts`；合併行（「職稱⇥日期」「公司⇥年資」）先拆出日期／年資並綁回同一行職稱，測試經過 `layoutPage`；公司括號未閉合接下一行（最多一行），公司後的「X | Y」小字行全略過；104 偵測加訊號（日期在右側、職稱字高比公司與內文大 0.8pt 以上、公司行「（…業 …人）」或職務類別小字行），一般同字高中文履歷回 null；冒號後緊接 `//` 不算標籤；`#` 只在行首或空白後切；標籤續行只併到下一個標籤前。
- 測試資料全為合成、去識別化（`__fixtures__/layout104.ts`、`layout104-geometry.ts`）；擁有者真實 PDF 重新匯入需擁有者（併 P1-T032）。
