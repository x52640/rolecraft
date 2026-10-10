---
id: P1-T036
phase: 1
status: in_progress
depends_on: []
specs: ["sources-and-authorization.md", "resume-import.md", "resume-output.md"]
track: data
primary_repo: rolecraft
write_paths: ["packages/storage/", "packages/sources/", "packages/resume-import/"]
contract_change: none
expected_commit: "fix(P1-T036): codex 補審修正：storage、sources、resume-import"
---

# codex 補審修正：storage、sources、resume-import

## 目標

E4 全面補審（2026-10-10，`docs/REVIEW_QUEUE.md`）中、對照主線後仍成立的發現。協調者分類結果在 scratchpad `reviews/triage-A.txt`。

## 範圍

### 包含

- triage-A.txt 中 packages/storage 的 2 項（P1-T033 引進）＋ triage-B.txt 全部 7 項

### 不包含

- 分類為 resolved／invalid／known／spike-only 的項目

## 工作區與 Context

### 必讀入口

- `docs/specs/sources-and-authorization.md`
- `docs/specs/resume-import.md`
- `docs/specs/resume-output.md`

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

- 最後完成：9 項修正與回歸測試（每項測試在修正前皆失敗、修正後通過）
- 已通過驗證：`npm run verify`；分類員 PoC（tx、poc1～poc6）改指向本工作區重跑皆為正確結果
- 下一步：協調者審查後關閉
- Blocker：無

## 完成結果

| 項目 | 修法 | 回歸測試 |
| --- | --- | --- |
| storage：拒絕 async 時原 Promise 失敗未處理 | `transaction.ts` 丟 TypeError 前 `then(undefined, () => {})` | `transaction.test.ts`（監聽 unhandledRejection） |
| storage：清暫存檔蓋掉原錯誤 | `file-store.ts` 清理包 try 忽略 | `files/file-store-cleanup.test.ts`（mock rename／rm 失敗） |
| storage：`.DS_Store` 讓清掃崩潰 | `listHashes` 用 withFileTypes，只走兩碼 hex 子目錄 | 同上 |
| sources：掃子層時根被換未中止 | `lstatDirChain` 失敗回報 `level`；根（level 0）失敗或 lstat 丟錯時根已不符 → list 丟錯 | `node-folder-access-review.test.ts` |
| sources：單層不受筆數上限 | 剩餘額度傳進 `#listDir`，收滿即停 | 同上（計 lstat 次數） |
| resume-import：CMap 用 file:// 讀不到 | `pdfjsAssetDir` 回傳檔案系統路徑＋`path.sep` | `review-fixes.test.ts`：中文 CID 字型 PDF 抽出「中文履歷」並產生中文草稿 |
| resume-import：欄間距先挑最寬再驗 | 每個候選先驗左右段數再挑最寬 | 同上 |
| resume-import：逐頁錯誤未分類 | getPage／getTextContent 失敗包成 `invalid_pdf` | 同上（頁樹指向不存在物件） |
| resume-import：大間距欄位被併成一句 | `toLine` 間距 > 1.5 倍字高輸出 `\t`；標籤公司／職稱只取第一段、技能也以 `\t` 切 | 同上 |

中文 CID fixture：`__fixtures__/make-pdf.ts` 的 `makeCidChinesePdf`，程式手寫 PDF 物件（Type0／CIDFontType0、不嵌入字型、Adobe 預定義 CMap UniCNS-UCS2-H），不含任何字型檔；解碼用的 CMap 是 pdfjs-dist 隨附的 `cmaps/`（既有相依）。
