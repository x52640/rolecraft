---
id: P1-T065
phase: 1
status: done
depends_on: ["P1-T009"]
specs: ["resume-import.md"]
track: resume-import
primary_repo: rolecraft
write_paths: ["packages/resume-import/src/pdf/", "packages/resume-import/src/draft/rules.ts", "packages/resume-import/src/index.test.ts"]
contract_change: none
expected_commit: "fix(P1-T065): 重疊檢查逐頁計算、部首相似字換回一般漢字"
---

# 104 履歷 PDF 匯入：多頁誤判讀取順序、部首相似字

## 目標

擁有者 P1-T032 實測（2026-10-12）：8 頁的 104 履歷 PDF 匯入時被判 `reading_order_unreliable`（84%）。原因是 `assessQuality` 把所有頁的文字段攤平後才算重疊，不同頁在同一高度的文字被當成疊字。逐頁計算時各頁 0%～2.1%，合計 0.5%。任何多頁 PDF 都可能被誤擋。

## 範圍

### 包含

- 重疊與旋轉比例改成逐頁計算（只比較同一頁的文字段），全份比例＝各頁異常字元合計／全份可見字元
- 門檻、亂碼與無文字層的判斷不變
- 測試：兩頁各自正常但座標相同 → 通過；單頁真的疊字 → 仍判失敗
- 同一份 PDF 另一個問題：約 500 字是「部首相似字」（康熙部首 U+2F00–2FDF，如「⼯」「⿈」；部首補充如「⻑」），外觀同一般漢字但比對不到，段落標題「工作經驗」「專長」都認不出 → 讀文字層時換回一般漢字（只轉這幾個區塊，不對全文做 NFKC）
- 段落標題補 104 用的「求職條件」「專案成就」「語文能力」（歸 other，讓經歷段正確結束）
- 對抗驗證（2026-10-12）屬實項：
  - 只有少數頁疊字或全旋轉的多頁 PDF 被正常頁稀釋而通過（10 頁中 1 頁全疊字 0.182）→ 加逐頁檢查：可見字元達 MIN_TEXT_CHARS 的頁，異常比例超過門檻也判 `reading_order_unreliable`（門檻值不變）
  - 部首補充對照表漏 ⻇（角）、⻣（骨）→ 補上，並一併補 ⺝（月）、⺩（王）、⻊（足）

### 不包含

- 調整門檻數值、版面重組（`layout.ts`）、欄位草稿規則

## 工作區與 Context

### 必讀入口

- `docs/specs/resume-import.md`
- `packages/resume-import/src/pdf/quality.ts`、`extract.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 擁有者的真實 PDF 只在本機診斷，不進 repo、不印內容；測試用合成座標
- 遵守 `docs/specs/architecture.md`

## 驗證

### 自動驗證

- 見「範圍」的測試項

### 手動驗證

- 擁有者重新匯入同一份 PDF，應能進入欄位校正

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：首次修正（ed71e31）；對抗驗證屬實 2 項修正（c699d7f）
- 已通過驗證：主樹 `npm run verify` 綠（3318 通過、13 略過）；codex 主體與修正 diff 皆無發現；擁有者真實 PDF 本機重跑通過
- 下一步：協調者收官
- Blocker：無（手動驗證需擁有者，併 P1-T032）

## 完成結果

- `quality.ts`：重疊／旋轉改逐頁計算（`disorderedChars` 只看同一頁），全份比例＝各頁合計／全份字元；另加 `worstPageDisorder`，可見字元達 `MIN_TEXT_CHARS` 的頁單頁超過門檻也擋（訊息標「部分頁面」）。門檻值不變。
- `normalize-cjk.ts`：讀文字層時把康熙部首（NFKC）、相容表意字（NFKC）、部首補充（對照表 ⺝⺠⺩⻄⻆⻇⻊⻑⻘⻝⻣⻤⻩）換回一般漢字；不對全文做 NFKC。
- 段落標題補「求職條件」「專案成就」「語文能力」（other）。
- 擁有者 8 頁 104 PDF：修正前 84% 被擋；修正後通過，部首相似字 0 個剩餘，經歷與技能有草稿；姓名為大字標題無標籤，草稿留空（既有規則：找不到不填）。
