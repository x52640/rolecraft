---
id: P1-T009
phase: 1
status: done
depends_on: ["P1-T001"]
specs: ["resume-import.md"]
track: import
primary_repo: rolecraft
write_paths: ["packages/resume-import/"]
contract_change: none
expected_commit: "feat(P1-T009): resume-import：PDF 文字層擷取"
---
# resume-import：PDF 文字層擷取

## 目標

F02：本機擷取履歷文字並保留頁碼。

## 範圍

### 包含

- 用 pdfjs-dist 擷取文字層，保留頁碼與位置
- 無文字層／亂碼比例過高／讀取順序異常 → 回傳明確失敗原因，不當成成功
- 解析結果結構化成待校正欄位草稿（姓名、日期、公司、職稱、經歷、技能），全部標「未確認」

### 不包含

- OCR（D18 首版不做）
- 校正 UI

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 欄位草稿規則可以很粗，但不得捏造缺的欄位
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 以程式產生的測試 PDF（單欄、雙欄、無文字層）測試

### 手動驗證

- 擁有者提供 104 匯出 PDF 後驗證文字層（見 P1-T020）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：實作與測試（待協調者收官）
- 已通過驗證：`npm run verify` 綠（Vitest 15 檔 93 測試，其中 resume-import 2 檔 16 測試；test:docs 11）
- 下一步：協調者收官；擁有者 104 PDF 到位後跑 P1-T020 手動驗證
- Blocker：無

## 完成結果

- 公開入口 `extractResumePdf(bytes)` → 成功（各頁依閱讀順序的行，含頁碼、欄序號、座標；`pagesWithoutText`；欄位草稿）或明確失敗 `invalid_pdf`／`encrypted`／`no_text_layer`／`garbled_text`／`reading_order_unreliable`。
- 模組：`pdf/read-text-layer.ts`（pdfjs-dist 6.4 legacy build，本機 cmaps／standard_fonts，不連網、不 OCR）、`pdf/quality.ts`（可見字 < 20 → 無文字層；U+FFFD／私用區／控制字元 > 20% → 亂碼；旋轉或同基線疊字 > 20% → 讀取順序異常）、`pdf/layout.ts`（基線分行；頁面中段找 ≥ 12pt 直向空白帶判定雙欄，跨欄行切段，每段先左後右）、`draft/`（中英文標籤、日期區間、公司字尾、職稱關鍵字、經歷／技能段落；全部 `unconfirmed` 並記來源頁碼與行號，找不到不填）。
- 型別暫放套件內（contract_change: none）；草稿要進 contracts 時另開 Task。
- 測試 PDF 由 pdf-lib（devDependency）在測試中產生：單欄、內容串流倒序、雙欄（先寫右欄）、無文字層、疊字、旋轉、非 PDF。中文規則只在文字層級測試（Helvetica 無 CJK、不打包系統字型）；中文 PDF 實測留給 P1-T020。
- 未測：加密 PDF（pdf-lib 無法產生加密檔，只有分類邏輯）、真實亂碼 PDF（亂碼只做單元測試）。
