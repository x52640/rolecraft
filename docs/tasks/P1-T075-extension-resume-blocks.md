---
id: P1-T075
phase: 1
status: blocked
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

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等 P1-T074 收官後改 ready
- Blocker：相依 P1-T074 未完成

## 完成結果
