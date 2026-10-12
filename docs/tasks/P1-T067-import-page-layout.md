---
id: P1-T067
phase: 1
status: done
depends_on: ["P1-T020"]
specs: ["resume-import.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/ImportPage.tsx", "apps/editor/src/pages/import/ParsePreview.tsx", "apps/editor/src/pages/import/ProfileForm.tsx", "apps/editor/src/pages/import/ImportPage.test.ts", "apps/editor/src/pages/import/import.css", "apps/editor/src/pages/import/components/"]
contract_change: none
expected_commit: "feat(P1-T067): 匯入頁版面重整：分區卡片、欄位標籤、原文對照"
---

# 匯入頁版面重整

## 目標

擁有者 P1-T032 實測（2026-10-12）：匯入頁沒有樣式，欄位擠成一列、標籤與輸入框黏在一起、描述框只有兩行、原文是一長串清單，「好恐怖」。只改畫面，不改解析邏輯與資料流。

## 範圍

### 包含

- 新增 `import.css`（照其他頁的做法，例如 `jobs.css`、`claims.css`；沿用 `styles.css` 的字型與 `color-scheme: light dark`，深淺色都要可讀）
- 版面：
  - 頁首說明精簡；檔案列與「改選其他檔案」一列
  - 寬螢幕左右兩欄：左邊校正表單、右邊原文（可捲動、依頁分組、行號淡色）；窄螢幕上下排
  - 個人資料：標籤欄＋值欄的兩欄格線，每列一個刪除鈕（小、次要樣式）
  - 每段經歷一張卡片：標題「第 N 段：公司｜職稱」（空就顯示「未填」），公司／職稱／開始／結束各自標籤在上、輸入框在下的格線，「至今」勾選放結束日期旁；描述是全寬、至少 6 行、可拉高的文字框；刪除鈕放卡片右上、次要樣式
  - 技能：標籤（chip）樣式，可刪除單一個、可新增
  - 底部確認列固定在視窗下方（勾選＋確認按鈕），不用捲到底才看得到
  - 主要按鈕與次要按鈕樣式區分；危險動作（刪除）不搶眼但可辨識
- 無障礙：每個輸入框都有對應 `<label>`；鍵盤可操作
- 對抗驗證與 codex review（2026-10-12）屬實項：
  - 固定確認列蓋住鍵盤焦點所在的輸入框（無 scroll-padding）→ 捲動根元素加底部留白，數值大於確認列換行後高度（或量測確認列高度寫入 CSS 變數）
  - 從確認列送出驗證失敗時，錯誤清單在畫面外、看起來沒反應（改版前錯誤就在按鈕上方）→ 失敗後把錯誤清單捲進畫面並聚焦，確認列也顯示「有 N 項需要修正」
  - 長技能 chip 撐破表單欄、蓋住原文或造成整頁橫捲 → chip 與 input 限制在欄寬內
  - 原文行號對比不足（淺色約 2.8:1）→ 改用 `--import-muted` 等級
  - （codex）寬但矮的視窗原文欄 `max-height: 32rem` 蓋過依視窗高度的限制（同權重、順序在後）→ 保留依視窗高度的限制
- 現有行為（勾選才能確認、離開提示、解析失敗訊息、手動輸入）全部保留；既有測試照過，必要時只改選取方式不改斷言語意

### 不包含

- 解析規則與 `form-model.ts`（P1-T066 在改）
- 其他頁面樣式

## 工作區與 Context

### 必讀入口

- `docs/specs/resume-import.md`
- `apps/editor/src/pages/import/` 全部、`apps/editor/src/styles.css`、一份既有頁面 CSS（`jobs/jobs.css`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不改 `form-model.ts` 的型別與匯出（P1-T066 同時在改；只用既有匯出）
- 不引入新的 UI 套件或外部 CSS
- 遵守 `docs/specs/architecture.md`（單檔 300 行）

## 驗證

### 自動驗證

- 既有匯入頁測試全過；新增：每個輸入框有 label、確認列在表單存在時渲染

### 手動驗證

- 擁有者看畫面（需擁有者，併 P1-T032）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：首次實作（fab7333）；對抗驗證＋codex 屬實 5 項的修正與回歸測試
- 已通過驗證：worktree 內 `npm run verify` 綠（3343 通過、13 略過）；匯入頁測試 27 項；新增 2 項 jsdom 測試在修正前的實作上實跑皆失敗
- 下一步：協調者對抗驗證與收官
- Blocker：無（畫面目測需擁有者，併 P1-T032）

## 完成結果

- 新增 `import.css`（頁面框架、按鈕、原文欄、確認列）與 `components/import-form.css`（卡片、欄位、個人資料格線、技能 chip），分別由 `ImportPage.tsx`、`ProfileForm.tsx` import。色彩用 `currentColor` 混色與 `light-dark()`，靠既有 `color-scheme: light dark` 在深淺色都可讀；沒有引入套件或外部 CSS。
- 版面：頁首說明併成一段；檔案列與「改選其他檔案」同一列；寬螢幕（≥70rem）左邊校正表單、右邊原文（黏住、可捲動、依頁分組、淡色行號），窄螢幕上下排；解析失敗時只有表單。為容納兩欄，`.content:has(> .import-page)` 把內容區上限放寬到 90rem，只在匯入頁生效。
- 拆出 `components/`：`InfoRows`（欄位名稱＋內容兩欄格線、每列小型刪除鈕）、`ExperienceCard`（標題「第 N 段：公司｜職稱」空白顯示「未填」，公司／職稱／開始／結束標籤在上，「至今」在結束日期旁，描述全寬 6 行可拉高，刪除鈕在右上）、`SkillChips`（chip，可改、刪單一個、新增）、`ConfirmBar`（黏在視窗底部的提醒＋勾選＋確認）。
- 無障礙：每個輸入框都有對應 `<label>`（個人資料與技能用視覺隱藏 label）；刪除鈕有具體名稱（例如「刪除第 1 段經歷」「刪除技能 1」）；全部是原生控制項，鍵盤可操作；原文捲動區可用 Tab 聚焦。
- 行為不變：勾選才能確認、改內容要重勾、離開提醒、解析失敗訊息、手動輸入、改選檔案取消回原畫面。既有測試斷言未改。新增測試：所有 input／textarea 都有 label、確認列只在表單存在時出現、卡片標題與「未填」、描述 6 行、刪除單一技能。
- 沒有動 `form-model.ts`。畫面目測需擁有者，併 P1-T032。

### 對抗驗證／codex 修正（2026-10-12）

- 焦點被確認列遮住：`html:has(.import-confirm-bar)` 設 `scroll-padding-bottom: 8rem`（128px，大於確認列換行後約 101px），鍵盤聚焦捲動時留出確認列高度。
- 錯誤清單在畫面外：送出驗證失敗後聚焦錯誤清單（`tabIndex=-1`，瀏覽器聚焦時會捲進畫面；每次失敗都重新聚焦）；確認列另顯示「有 N 項需要修正」，離開提醒照常保留。
- 長技能 chip 溢出：chip 與輸入框 `max-width: 100%`、`min-width: 0`，輸入框寬度上限 24 字，刪除鈕不縮。
- 原文行號改用 `--import-muted`（與其他次要文字同等級）。
- （codex）原文欄高度：寬螢幕 media query 移到原文欄基本規則之後，依視窗高度的上限不再被 32rem 蓋掉。
- 回歸測試：jsdom 測錯誤清單取得焦點、再次失敗焦點回到清單、確認列 N 項文字與離開提醒並存；換回修正前的實作實跑皆失敗。
- CSS 四項（底部留白、chip 寬度、行號顏色、media query 順序）jsdom 不算版面、Vitest 預設把 CSS 匯入成空字串，編輯器 tsconfig 也沒有 Node 型別，無法在範圍內加讀檔測試；曾以讀檔測試在修正前後各跑一次確認（修正前 4 項失敗、修正後通過），但沒有留在 repo，避免把 Node 型別帶進整個編輯器編譯。
