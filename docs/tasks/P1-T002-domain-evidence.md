---
id: P1-T002
phase: 1
status: done
depends_on: ["P1-T001"]
specs: ["evidence-model.md"]
track: domain
primary_repo: rolecraft
write_paths: ["packages/domain/src/evidence/", "packages/domain/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T002): domain：事實項狀態與 R1 匯出前檢查"
---
# domain：事實項狀態與 R1 匯出前檢查

## 目標

D4、D14：履歷不能把沒確認的事寫成已完成，這是產品的核心承諾。

## 範圍

### 包含

- 三種使用者動作（接受修改稿／確認事實項／逐段確認）的狀態轉換
- R1 匯出前檢查 1–3：引用存在、宣稱完成程度合法（D14）、數字有出處
- 引用編輯規則：只能增加引用，移除引用只能整段刪除
- 檢查結果結構化回傳（哪段、哪條、原因）

### 不包含

- I/O、UI、模型呼叫

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 純函式；不得 import node: 模組
- 數字擷取要處理中文與全形數字、百分比、年份
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 逐條對照 S9-7 寫測試：計畫中／未知／待複核／來源矛盾不能寫成已完成；文件標示完成未確認不能寫成已完成；無引用段落須逐段確認；移除引用被拒

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：實作與測試完成，等協調者收官與對抗驗證
- 已通過驗證：`npm run verify` 綠（Vitest 17 檔 172 測試）；對抗驗證修正後全 repo 42 檔 678 測試綠
- 下一步：協調者收官（E3 對抗驗證）
- Blocker：無

## 完成結果

- `packages/domain/src/evidence/`：`actions`（接受修改稿／確認事實項／逐段確認／增加引用）、`citation-edit`（`checkSectionEdit`：移除引用、改段落來源、改生成紀錄被拒）、`export-check`（`checkExportReadiness`：R1 檢查 1–3＋無引用段落＋引用完整性，回傳哪段／哪條／原因／能否逐段確認）、`numbers`＋`numerals`（數字擷取：全形、千分位、k／M／B、中文含大寫與口語省略、阿拉伯數字＋中文單位、英文數字詞、百分比、零寬字元與形似字母）。
- contracts additive：`ResumeSection.generatedCitations`（選填，生成當下引用快照）。生成段落缺這欄一律不能匯出；有這欄時現有引用少了任何一項即擋，逐段確認不能放行。
- 失敗即擋：段落／事實項不符 schema、事實項 ID 重複、無法辨識的數字寫法、引用功能／交付物未標完成程度，都視為不通過。
- 寫成已完成另需：確認紀錄存在且文字與現在內容一致、不在待複核或來源矛盾；來源已移除但已確認的可寫成已完成（R2）。
- 暫行判斷（待裁定）：檢查 3 的出處只算引用事實項的內容與其確認文字、已確認的個人資料，不含來源片段原文。（原本這裡寫「單一『一』『one』與無數量詞的單一單位字不算數字」「三成不換算成百分比，會被擋」，後者是錯的：實際上「三成」被擷取成一般數字 3，引用的事實項有 3 就放行。兩者都已在下方「對抗驗證修正」改掉。）

### 對抗驗證修正

- 數字擷取改為 fail closed（`numbers.ts`、`number-words.ts`、`number-normalize.ts`、`number-token.ts`）：看起來像數量但無法確定精確值的一律 `key=null`（`number_unparseable`，只能改寫或逐段確認）。
  - 中文數字字元預設都算數字，只用窄排除表（`number-exclusions.ts`，每項附理由）排除；數字片段比排除詞長就照算（第三方不算、第三百名照算）。
  - 約數 → null：百餘、十多、十幾、數萬、上千、三五、十二三、100多、100+、thousands／hundreds／tens of／dozens／a dozen、數個百分點。
  - 「成」換算百分比（三成 → %30、三成五 → %35）；百分點（個百分點、percentage points）獨立一類 `pt`，不對上一般數字或百分比。
  - 單位後綴：k／m／b／bn／mn／w／萬／億／兆／英文量級詞換算；x 當倍數；科學記號解析；`^`、其他字母後綴（100ms、5GB、3D）→ null。
  - 1萬5、3千5百、三萬5000、1.000、1.000.000、10 000（空白千分位）→ 單一 null，不拆成兩個可比對片段。
  - 數字前緊貼字母（EC2、K8s、Vue3、H.264、v1.2.3）是識別字，整串字面比對（`id:` key）。
  - 正規化：先去掉所有 Default_Ignorable_Code_Point（含 U+115F、U+1160、U+3164、U+FFA0）與格式字元、組合符號，數字合併；百分號變體 ٪ ﹪ ％ 都算百分比；‱ 換算；羅馬數字、圈號、上標、分數、其他文字系統數字 → null；整串形似字母（IOO、ЗО、XII）接百分比或量詞 → null。
- 協調者裁定：引用的事實項待複核、來源矛盾、來源已移除且未經使用者確認、或完全沒有依據 → 新類別 `claim_usability`／`claim_unusable`，不論 statedCompletion，逐段確認不能放行。判斷重用 P1-T003 的 `isUsableForGeneration`，移除原本 `completed_under_review` 的重複邏輯。
- 不改：statedCompletion 降級（completed → in_progress 不改內文）是 spec 設計，措辭由使用者在 F07 把關。
- 已知殘餘：數字之間的可見空白類字元（U+2800 等）不合併；ASCII 羅馬數字只認 I／V／X；「數倍」「幾倍」這類沒有數字字元的約數不擋；「24/7」「1/3」拆成兩個數字比對（3/1 與 1/3 無法區分）；未知字母後綴（3D、5G、100ms）即使事實項原文相同也一律要逐段確認。
