---
id: P1-T093
phase: 1
status: ready
depends_on: ["P1-T080"]
specs: ["resume-import.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/resume-parse/redact.ts", "packages/pipeline/src/resume-parse/redact-url.ts", "packages/pipeline/src/resume-parse/redact-residence.ts", "packages/pipeline/src/resume-parse/tw-districts.ts", "packages/pipeline/src/resume-parse/d31-redact.test.ts", "packages/pipeline/src/resume-parse/d31-redact-104.test.ts"]
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

### 不包含

- 契約、helper、編輯器（遮蔽只在 pipeline 本機做；畫面照常顯示原值，不需要改）
- `check.ts`、`web-check.ts`、`types.ts`（P1-T090 會改；本 Task 不碰，若發現非改不可就停下回報）
- 職缺頁分析、生成、自介的提示（D31 只管履歷匯入整理）
- 只有縣市的遮蔽（待擁有者決定，見 CURRENT_TASK）、沒有協定也不是 `www.` 開頭的網域（例如 `github.com/xxx`）

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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
