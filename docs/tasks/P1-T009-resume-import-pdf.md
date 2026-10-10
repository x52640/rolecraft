---
id: P1-T009
phase: 1
status: blocked
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：等待相依：P1-T001

## 完成結果
