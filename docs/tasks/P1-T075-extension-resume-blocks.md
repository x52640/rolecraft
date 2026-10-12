---
id: P1-T075
phase: 1
status: done
depends_on: ["P1-T074"]
specs: ["web-resume-capture.md", "bridge.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/src/sites/resume/"]
contract_change: none
expected_commit: "feat(P1-T075): extension：履歷頁區塊抽取與擷取共用流程"
---

# extension：履歷頁區塊抽取與擷取共用流程

## 目標

各站共用的 content script 端邏輯：從履歷本文根節點依固定規則抽出區塊、套上限、組成 `submit_resume_capture` 送給 service worker，並依結果在頁面提示。不含任何站的實際選擇器（P1-T077）與 service worker 端（P1-T076）。

## 範圍

### 包含

- 區塊抽取（web-resume-capture「區塊抽取規則」1–6）：純函式，輸入根節點與可注入的「是否可見」「渲染後文字與換行」判定；標題、清單項（巢狀深度，超過 6 記 6）、表格列（Tab 連接）、標籤＋值（dt/dd、只有 th＋td 兩格的列、label＋控制項）、段落；每段文字只屬最近的區塊；換行切成多個區塊、第二個以後標 `continues`；不讀隱藏元素、script／style／noscript／template／svg／圖片（含 alt）；密碼、隱藏、檔案欄位不讀，select 取選中項文字；不輸出 HTML、屬性、連結網址
- Chrome 用的判定實作（`checkVisibility`、`innerText` 一類）與測試用的簡化判定分開（N6）
- 上限：區塊 2,000、文字含標籤 UTF-8 256 KiB（用 contracts 常數）；超過只留前面放得下的完整區塊並標 `truncated: true`
- 共用流程：輸入站設定（平台、根節點選擇器、選填姓名元素選擇器）；找不到根節點 → 不送、頁面右上角顯示規格那段提示文字；找到 → 組請求（`url` 只取 origin＋路徑、`nameText` 取姓名元素文字或 null）經 service worker 轉送；送出失敗（連不上、被拒、不符 schema）→ 頁面顯示指向「手動輸入」的失敗提示；成功不在頁面提示（service worker 會開編輯器，P1-T076）
- 頁面提示：shadow DOM、純文字（比照 `sites/104/notice.ts` 的做法，但放在本 Task 目錄，不改 104 目錄）

### 不包含

- service worker 觸發、注入、授權、開編輯器（P1-T076）
- 任何站的網址規則與選擇器（P1-T077）
- 自動展開收合內容、抓照片

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/web-resume-capture.md`（全文）
- `docs/specs/bridge.md` R7
- P1-T074 完成結果；`apps/extension/src/sites/runtime.ts`、`types.ts`、`sites/104/notice.ts`、`relay/messages.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資／資料最小化：只讀根節點內可見內容，不送屬性、網址、密碼欄位）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 合成 DOM 測試（注入簡化判定）：巢狀清單、`li` 內含 `p`、隱藏元素四種、表格、標籤＋值三種、表單控制項（含密碼／隱藏／檔案不讀、select）、`br` 換行與 `continues`、七層清單最內層記 6、找不到根節點
- 上限：超過時只送完整區塊並標截斷；產出的請求通過 contracts schema
- 送出的請求裡沒有 HTML、屬性值、連結網址、查詢字串
- 失敗提示與找不到根節點提示的文字與規格一致

### 手動驗證

- 無（真實 Chrome 的 fixture 比對在 P1-T077）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內（另有本 Task 檔狀態與 task:index 產生的 INDEX／CURRENT_TASK）
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：審查待修 1–6、複審 2 項已修（2026-10-12）
- 已通過驗證：`npm run verify` 綠（Vitest 3872 通過、13 略過）
- 下一步：已收官（2026-10-12 協調者：審查屬實項皆已修，修正 diff 的 codex review 無發現；main `npm run verify` 綠，Vitest 4108 通過）
- Blocker：無

## 審查待修（2026-10-12 對抗審查＋codex review）

對抗審查（真實 Chrome 重現）：

1. （個資）隱藏容器裡的直接文字節點會被送出：未展開 `<details>` 裡 summary 以外的直接文字、有 shadow root 的元素底下沒被分配到 slot 的文字、`content-visibility:hidden` 容器的直接文字、`<progress>`／`<meter>` 的後備文字。
2. （漏讀）`display:contents` 的子樹被整棵丟掉（`checkVisibility` 回 false），根節點本身是 contents 會變成找不到；`visibility:hidden` 父元素下 `visibility:visible` 的子元素被略過。
3. （規格偏差）`white-space: pre`／`pre-wrap` 裡的換行被併成空白。

codex review：

4. `dom.ts` dl 配對：隱藏的 dt 被跳過後，後面的 dd 繼承前一個標籤（`<dt>Skills</dt><dd>JS</dd><dt hidden>Salary</dt><dd>100</dd>` 把 100 當 Skills 的值）。
5. `extract.ts` 根節點本身是標題、li、tr、表單控制項時只讀子節點，沒走元素分類。
6. `extract.ts` 用 `push(...blocks)` 展開大陣列，超過引數上限丟 RangeError（擷取失敗而不是截斷到 2,000 塊）。

## 複審待修（2026-10-12 codex 複審修正 diff）

1. （個資）slot 判定只看 slot 本身的 display／content-visibility；slot 在 shadow tree 裡位於未展開 details（或其他收合邊界）內時，被分配的 light DOM 子節點仍被讀出。
2. （效能）未展開 details 每個子節點都重算 `firstSummary`（每次複製全部子元素）、shadow host 每個子節點都重建分配集合，O(N²)，大量子節點時同步卡住分頁。

## 完成結果

- 程式（`apps/extension/src/sites/resume/`）：`extract.ts` `extractBlocks`（抽取規則 1–6）、`dom.ts`（`isSkipped`、`controlValue`、`flatText`、`findPairs` 標籤＋值配對）、`text.ts`（正規化）、`limits.ts` `applyLimits`、`capture.ts`（`buildResumeCapture`、`runResumeCapture`、`resumeNoticeText`）、`start.ts` `startResumeCapture`（各站腳本入口，P1-T077 用）、`notice.ts`（提示文字與 `showResumeNotice`）、`chrome-oracle.ts`／`simple-oracle.ts`（N6 判定分開）。
- 測試：`extract.test.ts`、`capture.test.ts`、`notice.test.ts`（38 案例，合成 DOM、假資料）。
- 保守選擇：根節點有找到但抽不出任何區塊（schema 要至少 1 個）視同找不到根節點；送出前先用 contracts schema 驗，不符就不送、提示失敗；只有回應通過 schema 且 `ok: true` 才算成功；input 只讀文字類（text、search、email、tel、url、number、日期時間類），勾選框、單選、按鈕、range、color 不讀；姓名文字空白或超過 200 字給 null；失敗提示多加「（在其他分頁點 RoleCraft 圖示開啟）」與找不到提示一致；表格一般列的儲存格內換行併成空白（th＋td 列的值才切續行）。
- 殘餘：換行判定用計算後 display 近似 innerText（CSS 產生內容不讀）；shadow tree 內部內容不讀（只讀被分配到 slot 的 light DOM 子節點，不依 slot 順序重排）；真實 Chrome 的 fixture 比對在 P1-T077。
- 審查待修修正（`review-fixes.test.ts` 逐項重現）：判定介面改成 `display`／`textVisible`／`hidesChildren`／`preservesNewlines`／`slottedChildren`（`types.ts`），`render.ts` 集中「讀得到」判定，抽取與 `flatText` 共用 `renderedChildNodes`／`textOf`。
  1. 未展開 details 只讀第一個 summary；有 shadow root 只讀被分配到（可見）slot 的子節點（Chrome 用 `chrome.dom.openOrClosedShadowRoot`，含封閉 shadow root）；content-visibility:hidden 不讀子節點；progress、meter 加入不讀清單。
  2. 不再用 `checkVisibility`：Chrome 判定改用計算後樣式（`createChromeOracle`，每次擷取快取），display:contents 直接往下讀、不換行；visibility 只影響元素自己的文字節點與控制項值，子元素各自判斷。
  3. white-space 保留換行（pre、pre-wrap、pre-line、break-spaces，或 white-space-collapse preserve 類）時照換行切、第二行起標 continues。
  4. 讀不到的 dt 切斷配對，後面的 dd 不繼承標籤、當無標籤段落：dd 本身看得到，照讀不漏內容，也不會套上隱藏或錯的標籤（不讀 dd 反而丟掉使用者看得到的內容）。
  5. 根節點本身走 `scanElement` 同一套分類；清單項根節點層級記 1。
  6. 改成逐一附加（`append`、`concat`），15 萬行 textarea 截斷到 2,000 塊。
- 需 P1-T077 在真實 Chrome 驗證：`createChromeOracle` 的計算後樣式判定（display:contents、visibility 繼承與子元素 visible、content-visibility:hidden、white-space／white-space-collapse）、封閉 shadow root 與 slot 分配（含藏起來的 slot）、未展開 details。
- 複審待修修正（`review-fixes-2.test.ts` 逐項重現；修前 2 萬子節點案例分別跑 190 秒、13 秒）：
  1. 判定介面的 `slottedChildren` 改成 `shadowSlots`（只回 shadow tree 裡的 slot），slot 是否渲染改由 `render.ts` `isSlotRendered` 判定：slot 自己與到 shadow root 的每層祖先都要讀得到、被父節點渲染（未展開 details 的非第一個 summary、display:none、hidden、aria-hidden、content-visibility:hidden、巢狀 host 沒分配都算藏，巢狀 shadow 會遞迴）；走不到 shadow root 就當藏起來。
  2. `scopedOracle` 每次擷取建一份快取（first summary、每個 host 的分配集合各算一次）；`firstSummary` 改成逐一走兄弟元素，不再複製子元素。2 萬子節點案例在 1 秒內完成。
- 需 P1-T077 在真實 Chrome 驗證（追加）：shadow tree 內收合區裡的 slot。
