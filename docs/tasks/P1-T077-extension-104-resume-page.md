---
id: P1-T077
phase: 1
status: done
depends_on: ["P1-T017", "P1-T075", "P1-T076"]
specs: ["web-resume-capture.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/src/sites/104/resume/", "apps/extension/src/sites/registry.ts", "apps/extension/src/sites/registry.test.ts", "docs/adr/0004-104-job-page.md", "apps/extension/src/background/actions.test.ts", "apps/extension/src/relay/resume-relay.test.ts", "README.md"]
contract_change: none
expected_commit: "feat(P1-T077): extension：登記 104 履歷頁並以真實 Chrome 比對 fixture 區塊"
---

# extension：104 履歷頁登記與 fixture 比對

## 目標

把 104 履歷頁接上共用流程：依 P1-T017 的履歷頁樣本決定窄網址規則、本文根節點、姓名元素（Q2），並以含樣式的 fixture 在真實 Chrome 比對預期區塊。這是「104 可用」三個條件之一（resume-import「匯入入口與來源」）。

## 範圍

### 包含

- Q2 提案並記入 ADR-0004 第 5 節：讀哪一種頁（預覽／編輯）、網址規則（窄到只符合那一種頁，不與 `/job/` 重疊）、根節點選擇器、姓名元素選擇器（樣本驗證不到就不登記）、收合未展開的內容是否存在
- registry 為 104 加履歷頁設定；`src/sites/104/resume/content.ts` 入口呼叫 P1-T075 的共用流程
- 預期區塊檔（放在本 Task 目錄）＋真實 Chrome 測試：載入 P1-T017 的履歷頁 fixture，抽出的區塊與預期逐項相符（與現有 Chrome 測試同一類，需環境變數）
- 條款：照 D27（104 會員規約沒有明文禁止讀自己的履歷頁，擁有者裁定照常開放），在 ADR-0004 引用即可，不重查

- 協調者附註（2026-10-12）：P1-T075 有數項判定只能在真實 Chrome 驗證（計算後樣式的 display:contents、visibility 繼承、content-visibility、white-space、封閉 shadow root 與 slot、未展開 details），本 Task 以真實 Chrome 跑 fixture 時一併驗證；履歷頁腳本每次注入只送一次，不得被頁面 DOM 事件反覆觸發（P1-T076 對抗驗證提醒）。

### 不包含

- 改 fixture 本身或去識別化（P1-T017 負責）
- 共用抽取規則（P1-T075）
- 擁有者真實帳號實跑（P1-T087 的開工條件）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/web-resume-capture.md`「頁型登記」「區塊抽取規則」「驗收」
- `docs/adr/0004-104-job-page.md`（第 1、5 節）、P1-T017 完成結果與履歷頁 fixture（`apps/extension/src/sites/104/fixtures/` 下的 resume 檔）
- P1-T075、P1-T076 完成結果

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 非高風險：協調者收官閘門＋codex review（fixture 去識別化由 P1-T017 負責；本 Task 不得把真實個資寫進預期區塊）
- write_paths 與 P1-T018 的 `apps/extension/src/sites/104/` 前綴重疊：兩者不可同時跑
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 真實 Chrome：fixture 區塊與預期逐項相符（含截斷與否、`continues`、姓名元素文字）
- registry：104 履歷頁網址規則符合樣本網址、不符合職缺頁與 104 其他頁；與職缺頁規則不重疊

### 手動驗證

- 協調者設好 Chrome 測試所需環境變數實跑一次

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成（2026-10-12）：全部實作、測試、ADR-0004 5.4、README `RUN_CHROME` 那一列；單一 commit
- 已通過驗證：`npm run verify` 綠；`RUN_CHROME=1` 下 `apps/extension/src/sites/104/resume` 16 項全過（Chrome 155）
- 下一步：已收官（2026-10-12 協調者：審查屬實項皆已修，最後一輪 codex review 無發現；main `npm run verify` 綠）
- Blocker：無

## 完成結果

- registry 登記 104 履歷頁（ADR-0004 5.2 原樣）：`https:`、主機 `pda.104.com.tw`、路徑完全等於 `/profile/edit`；根節點 `#app > .container-sidebar--rwd > .row > .col.main`；姓名元素 `.form-info .name__text`。正式 registry 測試：樣本網址符合、104 職缺頁仍是職缺頁、14 種 104 其他網址不符、打包清單含 `src/sites/104/resume/content.ts`
- `src/sites/104/resume/content.ts`（入口，載入時呼叫一次 `startResumeCapture`，不掛任何頁面事件）＋`config.ts`（設定取自 registry）；打包產出 `sites/104-resume.js`
- 只送一次（`content.test.ts`，jsdom）：注入一次只送 1 次，之後兩輪頁面事件與 DOM 變動仍 1 次；不在 document／window／body 掛監聽；再注入一次才送第 2 次；找不到根節點不送、之後補上根節點也不補送
- 真實 Chrome（`RUN_CHROME=1`；拋棄式 profile、測試用暫存擴充功能在隔離環境跑正式 `createChromeOracle(chrome)`＋`buildResumeCapture`、頁面由 127.0.0.1 提供）：
  - `fixture.chrome.test.ts`：fixture 214 個區塊與 `expected-blocks.json` 逐項相符（未截斷、`continues`、`nameText`）；「更多」收合區 14 個個資字串 0 筆；結構與 ADR 5.2 一致（8 個 h2、工作經驗 5 筆 28 li、專長 11 li、專案 4 個 h3、自傳全文、桌面／手機重複只一份、無標籤＋值）
  - `render.chrome.test.ts`：display:contents、visibility 繼承＋子元素 visible（含姓名元素）、content-visibility:hidden／auto、white-space 保留換行、封閉 shadow root 與 slot（含不給 `chrome.dom` 的對照組）、shadow 內收合區的 slot、未展開 details、根節點在 display:none 下
  - 故意弄壞 visibility／content-visibility 判定時對應測試會失敗（已還原）
- 抽出的區塊交 `prepareWebResumeParse`（`pageNames`＝fixture 假姓名，暫存腳本、未進 repo）：提示中姓名、英文名（Ivy／Lin）、電話、email、地址皆 0；自傳的「林雨晴 Ivy Lin」遮成〔姓名〕〔姓名2〕
- ADR-0004 新增 5.4 真實 Chrome 比對；README `RUN_CHROME` 列補上擴充功能測試
- 殘餘：
  - 個人連結（`https://example.com/portfolio`）與區級居住地（「高雄市苓雅區」）會原樣送模型，是否遮蔽待擁有者決定（協調者轉達），本 Task 不改
  - fixture 無原站樣式，同一行的行內元素會黏在一起（如「高雄市苓雅區門市管理人員」「聽/略懂說/略懂讀/不會寫/不會」），真實頁結果待 P1-T087 擁有者實跑
  - 「只送一次」只在 jsdom 驗，未以正式打包腳本＋service worker 在真實 Chrome 驗
  - 履歷頁只有編輯頁、預設版型一份樣本
