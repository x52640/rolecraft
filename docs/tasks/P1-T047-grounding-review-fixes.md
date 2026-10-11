---
id: P1-T047
phase: 1
status: done
depends_on: []
specs: ["evidence-model.md"]
track: review
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/generation/grounding.ts", "packages/pipeline/src/generation/grounding.test.ts", "packages/pipeline/src/generation/sections.test.ts", "packages/pipeline/src/analysis/urls.ts", "packages/pipeline/src/analysis/urls.test.ts", "packages/pipeline/src/analysis/drafts.test.ts", "packages/pipeline/src/messages/prompt.ts", "packages/pipeline/src/messages/prepare.test.ts", "packages/pipeline/src/messages/runner.test.ts", "packages/pipeline/src/messages/check.test.ts", "packages/pipeline/src/messages/commitments.ts", "packages/pipeline/src/messages/check.ts", "packages/domain/src/evidence/numerals.ts", "packages/domain/src/evidence/numerals.test.ts"]
contract_change: none
expected_commit: "fix(P1-T047): pipeline 事實檢查：句號正規化、網址邊界、職缺名稱比對、訊息草稿的完成度上限"
---

# pipeline 事實檢查：句號正規化、網址邊界、職缺名稱比對、訊息草稿的完成度上限

## 目標

E4 補跑的 codex review（2026-10-11，P1-T019～T043 共 37 個 commit）經協調者對照目前主線後仍成立的項目，在此修正。

## 範圍

### 包含

- P1-T029：`。` 全域換成 `.` 讓「3。14 位」變成 3.14，錯誤數字通過檢查 → 句點類正規化只用在寬鬆網域（與承諾檢查的 email）辨識，數字與完整網址只做 NFKC＋去隱形字元
- P1-T024：全形逗號等 CJK 標點經 NFKC 後黏進網址，造成誤擋 → 抽完整網址前把 CJK 全形標點視為分隔
- P1-T024：職缺公司／職稱比對用子字串，LINE 會命中 pipeline → 純拉丁字母的名稱要求字詞邊界，中文名稱維持子字串
- P1-T022：網址結尾的 `)`、`]` 只在括號不成對時才去掉；Markdown `[url](url)` 以 `[`、`]` 分隔
- P1-T029：訊息草稿 prompt 沒標事實項完成度 → 沿用 generation 的完成度上限，在資料區塊外加「最高可寫」

### 不包含

- 已被後續修正解決、已知殘餘或需擁有者裁定的項目（見 docs/CURRENT_TASK.md）

## 工作區與 Context

### 必讀入口

- 範圍內各項提到的原 Task 檔完成結果
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（先寫會失敗的測試再修）
- 高風險（R1），收官前跑對抗驗證；commitments 依賴 normalizeForGrounding，要保留它對 email／網域的寬鬆辨識
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

- 最後完成：五項修正＋對抗驗證六項修正，皆附回歸測試（先確認測試失敗再修）
- 已通過驗證：`npm run verify` 全綠（2647 passed／13 skipped）
- 下一步：協調者收官
- Blocker：無

## 完成結果

- **句號正規化（P1-T029）**：`normalizeForGrounding` 改成只做 NFKC＋去隱形字元；點的變體（「。」「[.]」「 dot 」）移到新的 `normalizeLooseDots`，只給寬鬆網域（`extractLooseUrls`）與承諾檢查（`commitments.ts`，含 email 的 at／dot 寫法）用。「3。14 位成員」不再被當成 3.14：段落寫 3.14 會被擋、寫 3 會通過。訊息草稿的 `draftGroundingProblem` 透過同一個函式一起修正（check.ts 未改動）。承諾檢查對所有規則仍用含點變體的正規化，行為與修正前相同。
- **全形標點黏進網址（P1-T024）**：段落依據檢查抽完整網址前，把全形／CJK 的逗號、驚嘆號、分號、問號、括號、引號等（NFKC 後會變半形的那些）換成空白；冒號、斜線、點、@ 等網址結構字元不動，全形寫的網址仍抽得到。寬鬆網域照舊吃原文（自己正規化），所以「evil［.］com」仍會被擋。
- **職缺名稱比對（P1-T024）**：純 ASCII 名稱要求前後不是英數字，字母之間容許空白（「LINE」不命中 pipeline／online，但「at LINE now」「L I N E」「加入LINE團隊」都命中）；含中文的名稱維持去空白後的子字串比對。沒有照字面「在去空白文字上加邊界」，因為去空白會把「at LINE now」黏成 atlinenow 而漏擋。
- **網址結尾括號與 Markdown（P1-T022）**：`extractUrls` 的結尾「)」只在 token 內括號不成對時才去掉（`…/Software_(engineering)` 保留）；`[`、`]` 列為結束字元，Markdown `[url](url)` 兩段都抽得到，原文寫成 Markdown 連結時連結事實項也能通過。
- **訊息草稿的完成度上限（P1-T029）**：`messages/prompt.ts` 沿用 `generation/completion.ts` 的 `completionCap`，在資料區塊外的事實項標示加上「，最高可寫：…」（只有功能與交付物），指令也加了「完成程度不能高於最高可寫」。
- 已知殘餘：純 ASCII 名稱緊貼其他英數字時（例如「LINEPay」）不再算提到職缺名稱，這是字詞邊界的必然取捨；`check.ts` 不在本 Task 寫入範圍，訊息草稿的完整網址抽取沒有加全形標點分隔（只會多丟，不會放行）。
- **對抗驗證修正**：
  - IPv6 網址：`extractUrls` 允許 `scheme://`（可含 userinfo@）後緊接方括號 IPv6 主機，`http://[abcd::ef]/admin` 能抽出並被擋；Markdown `[url](url)` 照舊拆開。全形方括號包住的 IPv6 先轉半形再抽。
  - 職缺名稱：純 ASCII 名稱字母間容許空白、-、_、.，結尾容許 s／es／'s／ing（Engineers、LINEs、Backend-Engineer、L-I-N-E 都會擋）；公司名另比對去掉 Corp／Corporation／Inc／Ltd／Co／Limited／Company／（股份）有限公司 後的核心名稱（Line Corp 擋 LINE Corporation），法人字樣前必須有空白或標點（Costco 不會被當成 Cost＋Co）。pipeline／online 仍不命中 LINE。
  - 寬鬆網域：抽取前同樣把全形／CJK 標點當分隔；含全形括號的點寫法（evil［.］com、evil（．）com）在分隔前先轉成點，仍會被擋。路徑結束字元加上方括號，Markdown 連結不再誤擋。
  - 訊息草稿：`draftGroundingProblem` 改用段落生成的 `fullUrls`（原文先分隔再正規化），草稿與事實項兩邊都吃原文。
  - 「參」：只在緊鄰其他數字字元、阿拉伯數字、「點」「第」，或後接單位／量詞（萬、佰、拾、個、年等）時才算 3；參考／參與／參加／參觀不再被當成數字。「百分之參」改為無法辨識（擋下），「百分之參十」仍是 30%。
