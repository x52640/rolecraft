---
id: P1-T056
phase: 1
status: in_progress
depends_on: []
specs: ["evidence-model.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/analysis/urls.ts", "packages/pipeline/src/analysis/urls.test.ts", "packages/pipeline/src/analysis/", "packages/pipeline/src/generation/", "packages/pipeline/src/messages/", "packages/domain/src/evidence/"]
contract_change: none
expected_commit: "fix(P1-T056): 事實檢查：網址查詢參數方括號、零寬字元點、參字數量詞"
---

# 事實檢查：網址查詢參數方括號、零寬字元點、參字數量詞

## 目標

codex review 補審 P1-T044～T054（2026-10-11，17 個程式 commit）後，協調者對照目前主線（c11dcff）確認仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T047（58c43cc）：`analysis/urls.ts` 的 `URL_STOP` 含方括號，`?filter[role]=admin` 與原文 `?filter[role]=user` 都截成 `?filter`，捏造的網址通過比對 → 網址內部（`?`、`&`、`=` 後的查詢參數）的方括號要保留在 token 裡，Markdown `[url](url)` 的分隔仍要能用
- P1-T047（81bef88）：`generation/grounding.ts` 寬鬆網址 `PATH_STOP` 同樣截斷查詢參數方括號（引用 `?filter[user]=owner` 卻放行 `?filter[user]=attacker`）→ 同上
- P1-T047（81bef88）：`RAW_BRACKET_DOT` 在去除零寬字元之前比對，`evil［\u200B.］com` 漏抓 → 先去除不可見字元再認方括號點
- P1-T047（81bef88）：`domain/evidence/numerals.ts` 的「參」前後文白名單漏了百分比後綴（‰、‱）與量詞（批等），`改善參‰`、`處理參批資料` 變成不抽數字而放行 → 補齊解析器支援的百分比後綴與量詞；寧可多抽（保守）
- P1-T047（81bef88）：`百分之參十` 時 `numbers.ts` 的 `markerAt` 只拿下一個字元測 regex，「參」的前後文判斷失敗，多出一個 null key 的「百分之」token，導致原文有 30% 仍被拒 → marker 判斷要看完整前後文；測試要檢查 null-key token

- 對抗驗證（2026-10-11）屬實項：
  - 變體選擇符（U+FE0F、U+180B、U+E0100）、Hangul 填充字（U+3164）夾在網域裡整段抓不到 → 不可見字元一併去除 Default_Ignorable_Code_Point
  - 「參」接 pp、bps、k、×、小時、美元、公里、毫秒、所、國等仍不抽 → 改成反向判斷：「參」預設算 3，只有接在已知一般詞（參考、參與、參加、參觀、參數、參閱、參團、參半、參照、參謀、參議、參賽、參選、參展、參拜、參透、參悟、參差、人參、海參、黨參等）裡才不算（保守：寧可多抽）
  - 查詢字串中不成對或巢狀方括號（`?id=1[&role=admin`、`?a[[b]]=admin`）、組合標記 U+302A–302F／U+303F 仍會截斷網址而放行 → 網址被截斷、截斷點後面緊接（無空白）還有網址字元時，不得靜默放行：保留在 token 裡或判為不符（保守：判不符）；分析（extractUrls／drafts）與產生（fullUrls／寬鬆網址）一致
  - 修正引入的誤拒：`[作品](https://a.com?id=1)[GitHub](https://b.com)` 被吞成一個 token；`?tab=repos［GitHub］` 註記被併進網址 → Markdown 連結分界（`)[`、`](`）要能分開；方括號註記的取捨與上一項一致即可

### 不包含

- 已被後續 commit 修好的發現、已知殘餘（docs/RESIDUALS.md）

## 工作區與 Context

### 必讀入口

- `docs/tasks/P1-T047-*.md` 完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 高風險（evidence-model R1 事實檢查），收官前跑對抗驗證
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有回歸測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：原五項＋對抗驗證屬實四項的修正與回歸測試（新測試都先在修正前確認失敗）
- 已通過驗證：`npm run verify` 全綠
- 下一步：協調者審查與合併
- Blocker：無

## 完成結果

- **完整網址查詢參數方括號**：`analysis/urls.ts` 的 `extractUrls` 在「?」之後容許成對、內部不含結束字元的方括號（`?filter[role]=admin`、`x[]=1`、`a[b][c]`）；「?」之前與不成對的「]」仍是結束字元，所以 Markdown `[url](url)`（含帶查詢字串的網址）照舊拆開，IPv6 主機規則不變。
- **寬鬆網址查詢參數方括號**：`generation/grounding.ts` 的寬鬆網址路徑採同一規則；另外沒有斜線、直接接「?」的查詢字串（`a.com?x[1]=2`）也納入比對（只會更嚴）。全形方括號出現在查詢字串裡（`?filter［role］=admin`）時先轉半形保留，不再被當分隔截斷。
- **零寬字元方括號點**：`separateUrls` 與寬鬆網址的方括號點辨識都先去除隱形字元，`evil［\u200B.］com`、`evil（．\u200B）com` 會被抓成 evil.com。
- **「參」前後文**：`domain/evidence/numerals.ts` 的後接白名單補上 ‰、‱、百分點標記、英文 percent／per cent／pct（不分大小寫）、約數字尾（餘、多），以及批、組、輪、隊、班、間、座、題、章、節等常用量詞。參考、參與、參加、參觀、參數、參閱、參團、參半仍不算數字。
- **百分之參十**：`numbers.ts` 的 `markerAt` 改成在完整文字上以 sticky regex 判斷「百分之」後面是否接數字，「參」的前後文能正確判斷，不再多出 null key 的「百分之」token；測試直接檢查 token 清單沒有 null。
- **對抗驗證修正（第二輪）**：
  - **不可見字元**：`grounding.ts` 的 `INVISIBLE` 改為 Default_Ignorable_Code_Point＋\p{Cf}，變體選擇符（U+FE0F、U+180B、U+E0100）、Hangul 填充字（U+3164）夾在網域或 email 裡都會被去除，evil.com 會被擋。
  - **「參」反向判斷**：`numerals.ts` 改成「參」預設算 3，只有後接一般詞第二字（參考、參與、參加、參觀、參數、參閱、參團、參半、參照、參謀、參議、參賽、參選、參展、參拜、參透、參悟、參差、參見、參訪……）或前接人參、海參、黨參、丹參、西洋參等才不算；前面緊鄰數字字元、阿拉伯數字、「點」「第」時一律算 3。參 pp、參 bps、參 k、參×、參小時、參美元、參公里、參毫秒、參所、參國都會抽出數字。「百分之參」隨之改為 3%（原本判無法辨識，兩者都會擋下沒有出處的段落）。
  - **網址截斷不放行**：新增 `analysis/url-scan.ts`（完整網址與寬鬆網址共用）。方括號、圓括號都是網址字元，路徑與查詢字串裡不成對、巢狀的方括號整段保留；U+302A–302F、U+303F 不再當結束字元。結束字元後面緊接網址字元時視為截斷，結束字元連同後面一起留在 token 裡，只有逐字相同才比得上：閉括號與引號後面接網址字元（`alice"-fake`）、開括號找不到對應閉括號或閉括號後接網址字元（`?id=1［&role=admin`、`?filter［role］=admin`），其他標點後面不跨空白接到 = & ? # /（`?id=1！role=admin`）。`separateUrls` 用同一判斷決定全形標點要不要換成空白，分析（extractUrls／drafts）與產生（fullUrls／寬鬆網址）一致。
  - **Markdown 分界與註記**：`](` 後接網址、`)` 後接 `[文字](` 時切開，`[作品](https://a.com?id=1)[GitHub](https://b.com)` 抽成兩個網址；網址結尾的方括號註記（內容含非 ASCII，例如 `[作品集]`）與後面不再接網址字元的全形括號註記（`［GitHub］`、`（GitHub）`、`（已上線）`）不算網址的一部分。
- 已知殘餘：網址結尾、後面不再接任何網址字元的全形括號群組（`?filter［admin］`）當成註記去掉，與 `?filter［user］` 會比成相同（半形 `[admin]` 則保留在 token 裡）；其他標點後接的內容沒有 = & ? # / 時（`alice，-fake`）不算截斷；結束字元後接網址字元一律判截斷，所以 `https://a.com，詳見第3/4頁` 這類罕見寫法會被多擋。
