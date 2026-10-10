---
id: P1-T038
phase: 1
status: in_progress
depends_on: []
specs: ["resume-output.md", "jobs-and-messages.md"]
track: output
primary_repo: rolecraft
write_paths: ["packages/pdf-export/", "apps/extension/src/sites/104/", "scripts/docs/"]
contract_change: none
expected_commit: "fix(P1-T038): codex 補審修正：pdf-export、104 擷取提示、task:close"
---

# codex 補審修正：pdf-export、104 擷取提示、task:close

## 目標

E4 全面補審（2026-10-10，`docs/REVIEW_QUEUE.md`）中、對照主線後仍成立的發現。協調者分類結果在 scratchpad `reviews/triage-D.txt`。

## 範圍

### 包含

- triage-D.txt 全部 5 項（含 1 項 valid? 需先確認）

### 不包含

- 分類為 resolved／invalid／known／spike-only 的項目

## 工作區與 Context

### 必讀入口

- `docs/specs/resume-output.md`
- `docs/specs/jobs-and-messages.md`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附回歸測試（用分類員的 PoC 情境）
- 修法若需改 write_paths 以外的檔案，停下回報

## 驗證

### 自動驗證

- 各項回歸測試

### 手動驗證

- 無

## 完成定義

- [x] 各項修正與回歸測試
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：triage-D 5 項全部修正並附回歸測試
- 已通過驗證：`npm run verify`、`npm run build`、`RUN_CHROME=1` 的 Chrome 整合測試、`npm run sample`（1 頁與 2 頁皆通過）
- 下一步：協調者審查後收官
- Blocker：無

## 完成結果

- **pdfjs 正規化誤擋**：`read-pdf.ts` 的 `getTextContent` 改用 `disableNormalization: true`，讀回 PDF 實際碼位；µ（U+00B5）不再被轉成 μ 而誤報 `text_mismatch`。康熙部首不在 pdfjs 正規化範圍，Chrome 康熙部首回測照樣擋下。
- **文字超出頁緣（valid?）判定：PDF 層面成立，已加檢查**。實測 pdfjs 只丟掉「整個」落在頁外的字形；起點在頁內、字形跨過頁緣的字仍會擷取到，碼位比對抓不到（pdf-lib PoC 於右緣與上緣皆重現）。新增 `text_out_of_page` 座標檢查（block）。另以 Chrome 實測不換行長字串：Chrome 把超出的字形整個不輸出、沒有留下半個字，由 `text_mismatch` 擋下；新檢查是 Chrome 行為改變時的防線。Chrome 測試只在 `RUN_CHROME=1` 跑。
- **sample 指令**：`package.json` 改指 `scripts/render-sample.mjs`，新增測試確認各 script 指向的檔案存在；實跑 `npm run sample` 通過。
- **104 擷取提示**：新增 `sites/104/notice.ts`，擷取不到、轉送失敗或回應 `ok:false` 時在頁面右上角顯示提示（shadow DOM、純文字、可關閉），請使用者改用編輯器手動貼上；不加權限、不改 background。
- **task:close 崩潰**：缺「## 完成結果」段時 `closeBlockers` 不再對 null 呼叫 `replace`，改回報「完成結果是空的」且不改檔。
