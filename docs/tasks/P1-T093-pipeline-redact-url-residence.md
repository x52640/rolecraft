---
id: P1-T093
phase: 1
status: done
depends_on: ["P1-T080"]
specs: ["resume-import.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/resume-parse/redact.ts", "packages/pipeline/src/resume-parse/redact-url.ts", "packages/pipeline/src/resume-parse/redact-residence.ts", "packages/pipeline/src/resume-parse/tw-districts.ts", "packages/pipeline/src/resume-parse/d31-redact.test.ts", "packages/pipeline/src/resume-parse/d31-redact-104.test.ts", "docs/specs/resume-import.md"]
contract_change: none
expected_commit: "feat(P1-T093): 履歷匯入送模型前遮蔽網址與區級居住地（D31）"
---

# pipeline：送模型前遮蔽網址與區級居住地（D31）

## 目標

履歷匯入的 AI 整理（網頁與 PDF 共用遮蔽器 `createRedactor`）送模型前，把網址與「縣市＋鄉鎮市區」居住地換成〔個資N〕佔位字；本機預填與核對畫面照常顯示原值。

## 範圍

### 包含

- `redact.ts` 的通用遮蔽另加兩類（照 resume-import「網址與居住地遮蔽（D31）」）：
  - 網址：`http(s)://` 開頭（不分大小寫）或 `www.` 開頭後接網域段，延伸到空白或第一個非 ASCII 字元
  - 區級居住地：台灣縣市名（台／臺兩寫法與舊縣名）＋該縣市的鄉鎮市區名（新檔 `tw-districts.ts` 內建名單，依縣市配對），連同緊接其後的路街段巷弄號樓等地址字樣；只有縣市或只有鄉鎮市區不遮
  - 在 NFKC 後的文字上比對、範圍對回原文、與其他範圍重疊合併（沿用現行機制）；佔位字沿用〔個資N〕，`unredact`／`restoresSecret`、照抄檢查不改
- 比對式放新檔 `redact-url.ts`、`redact-residence.ts`（`redact.ts` 只接上），單檔 300 行內
- 新測試 `d31-redact.test.ts`：網址各形態（全形冒號後接網址、大小寫、`www.` 無協定、結尾接中文標點）；居住地各形態（「新北市中和區」「屏東縣屏東市」「臺北市 大安區」、接路名門牌、「高雄市苓雅區5~6年工作經驗」只遮地點）；不遮的（「高雄市」「高雄人」「苓雅區」「台北市立大學」；「台南市東區門市店長」只遮「台南市東區」）；PDF 路線（`personal.ts` 經同一遮蔽器）同樣遮到
- 新測試 `d31-redact-104.test.ts`：區塊照 `apps/extension/src/sites/104/resume/expected-blocks.json` 抄成合成區塊（去識別化，不跨套件 import），經 `prepareWebResumeParse` 產生的提示不含任何 `http`、`www.`、「縣市＋鄉鎮市區」字樣；模型照抄佔位字的欄位換回原文後標「含姓名或聯絡資料」；本機預填的個人資料列值不變

- 協調者裁定（2026-10-13，依 D31 原意）：無 http／www 的網域連結（例如 `github.com/帳號`、`linkedin.com/in/xxx`、`behance.net/xxx`：常見 TLD 的網域後接 `/路徑`）也要遮；只有縣市（「高雄市」）不遮。規格同步寫入 resume-import 的 D31 段（write_paths 若未含 docs/specs/resume-import.md，協調者已核准加入）。避免誤遮：不帶路徑的純網域名詞（例如單獨的「Node.js」「ASP.NET」）不算；補測試。

### 不包含

- 契約、helper、編輯器（遮蔽只在 pipeline 本機做；畫面照常顯示原值，不需要改）
- `check.ts`、`web-check.ts`、`types.ts`（P1-T090 會改；本 Task 不碰，若發現非改不可就停下回報）
- 職缺頁分析、生成、自介的提示（D31 只管履歷匯入整理）
- 只有縣市的遮蔽（協調者裁定不遮）；沒有協定也不帶路徑的網域名詞（例如 `smalltown.tw`）

## 工作區與 Context

### 必讀入口

- `plan.md` D31、D28（Q9）、D29
- `docs/README.md`
- `docs/specs/resume-import.md`「AI 整理欄位」去個資與「網址與居住地遮蔽（D31）」、「網頁來源的 AI 整理」去個資與驗收
- `packages/pipeline/src/resume-parse/redact.ts`、`personal.ts`、`web-prepare.ts`、`web-fixtures.test-helpers.ts`；`apps/extension/src/sites/104/resume/expected-blocks.json`（只讀）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- **高風險（個資外送、R1 照抄檢查）**：只能比現在多遮，不能少遮；既有遮蔽與照抄檢查測試（`hardening`、`adversarial-fixes`、`recheck-fixes`、`web-*` 等）不得退步、不得改期望值。收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 可與 P1-T090 平行（T090 改 `check.ts`、`web-check.ts`、`types.ts` 與 helper import；write_paths 不重疊，E5）；104 端到端測試放 pipeline，不放 `apps/helper/src/handlers/import/`（T090 範圍）。也可與 P1-T091、P1-T092 平行
- 鄉鎮市區名單是公開行政區資料，寫死在程式內；不連網
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- resume-import「網址與居住地遮蔽（D31）」與「網頁來源的 AI 整理」驗收中 D31 各項
- 104 fixture 區塊送出的提示不含網址與區級地址，單獨的「高雄市」照送
- 既有 resume-parse 測試全過、期望值未改

### 手動驗證

- 協調者以開發入口用 104 履歷頁擷取跑一次「用 AI 整理」（最便宜模型一次），確認整理成功、核對畫面仍顯示原網址與地址

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：codex 審查 3 項已修（數字路名、之／- 門牌、.NET 例外只限獨立詞）；先前：遮蔽器加網址（http(s)、www.、無協定網域＋路徑）與縣市＋鄉鎮市區居住地；resume-import D31 段寫入協調者裁定；新測試兩檔
- 已通過驗證：`npm run verify` 綠；codex 3 項修正後防退步比對 1864 案例減少遮蔽 0
- 下一步：已收官（2026-10-13 協調者：codex 3 項已修、修正 diff 無發現；防退步比對 1864 案例減少遮蔽 0；對抗驗證未跑（協調者判斷：只增不減的遮蔽由防退步比對覆蓋）；main `npm run verify` 綠）
- Blocker：無

## 完成結果

- write_paths 補 `docs/specs/resume-import.md`：協調者核准（2026-10-13），D31 段要寫入「無協定網域＋路徑也遮」「只有縣市不遮」兩項裁定。
- `redact.ts` 通用遮蔽加 `redact-url.ts`（`http(s)://`、`www.`、常見頂級網域＋`/路徑`）與 `redact-residence.ts`（縣市＋該縣市鄉鎮市區名本體＋區／市／鎮／鄉，連同其後路街大道、村里、含數字或 \* 的段巷弄號樓）；名單在 `tw-districts.ts`（22 縣市 368 鄉鎮市區，舊縣名沿用改制後名單）。佔位字、`unredact`／`restoresSecret`、照抄檢查未改。
- 防退步比對：舊／新遮蔽器各跑 901 行（104 expected-blocks 全部區塊、resume-parse 既有測試字串、手寫常見履歷行）× 2 組已知值，共 1802 案例：新增遮蔽 55、減少遮蔽 0。104 expected-blocks 全部 188 區塊經 `prepareWebResumeParse` 的提示不含 `http`、`www.` 與區級地址。
- 已知誤遮（寧可多遮）：`Socket.IO/Redis`（.io 網域＋斜線）；全形「，」「：」NFKC 後是 ASCII，網址會延伸吃進後面的 ASCII 字（「github.com/a，LinkedIn：linkedin.com/b」整段一個佔位字）；「桃園市中壢區中央大學」的地點也遮。
- 已知不遮：不帶路徑的網域（`smalltown.tw`）、名單外頂級網域（`.company`）、縣市後不接鄉鎮市區字尾（「台北市內湖科技園區」）。
- codex 審查 3 項（協調者重現，皆為個資漏遮；修正另一個 commit）：
  1. 路名含阿拉伯數字（「臺中市西屯區工業區38路100號」）只遮到區 → 路名允許數字（含全形）。
  2. 複合門牌「100之1號5樓」「100-1號5樓」留在提示 → 支援「數字(之|-)數字號」及其後的樓、室、之；另認「地下1樓」「B1」。
  3. `.NET` 例外用網域尾綴判斷，「team.asp.net/portfolio」整串不遮 → 例外只限獨立詞（前面不接網域字元），且斜線後只能是技術詞（C#、MVC、Core…）；「asp.net/portfolio」照遮。
  - 修正：路名允許數字、長度放寬到 7 字；門牌支援「數字(之|-)數字」複合號；新增「地下N樓」「BN(F)」。三項都先以測試重現（直接遮蔽、PDF 路線、`prepareWebResumeParse`），修後通過。
  - 防退步比對（加入上述例子與 26 行常見台灣地址：數字路名、之號、樓之、地下、段、巷弄、7F-2）：932 行 × 2 組已知值共 1864 案例；對 T093 前遮蔽器新增 115、減少 0；對第一個 T093 commit 新增 28、減少 0。網頁與 PDF 路線上這些地址行都整行遮成一個佔位字，「ASP.NET/MVC 與 VB.NET/WinForms」照送。
  - 新增已知誤遮：縣市＋區後接 7 字內含「路／街」的非地址文字（例如「台南市東區3年通路」）會一起遮。
- 殘餘：`plan.md` D31 仍寫「只有縣市待擁有者決定」、未提無協定網域；CURRENT_TASK 交接段同。兩者不在 write_paths，待協調者同步。
