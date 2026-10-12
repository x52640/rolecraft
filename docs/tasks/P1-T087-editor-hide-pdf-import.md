---
id: P1-T087
phase: 1
status: blocked
depends_on: ["P1-T077", "P1-T080", "P1-T081"]
specs: ["resume-import.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/"]
contract_change: none
expected_commit: "feat(P1-T087): editor：104 網頁匯入可用後拿掉 PDF 匯入入口"
---

# editor：拿掉 PDF 匯入入口（Q10）

## 目標

第一個網站「可用」後，從畫面拿掉全部 PDF 匯入入口；程式與測試保留作備援（D3），「手動輸入」入口保留。

## 範圍

### 包含

- 匯入頁不再顯示選 PDF 的入口（不分平台）；`import.pick_pdf` 等 helper 程式與測試不刪
- 「手動輸入」與網頁擷取入口照常
- 不做執行期開關（resume-import「匯入入口與來源」）

### 不包含

- 刪除 PDF 匯入程式或 104 版面規則（Q7 保留備援）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入入口與來源」
- P1-T077、P1-T081 完成結果；`apps/editor/src/pages/import/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 非高風險：協調者收官閘門＋codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 匯入頁沒有 PDF 入口、手動輸入與網頁擷取入口仍在；helper PDF 測試照舊

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等開工條件成立後改 ready
- Blocker：等「104 可用」：1）條款：D27 已裁定照常開放；2）P1-T077 fixture 比對通過；3）擁有者以自己的 104 帳號在真實瀏覽器點圖示實跑整條流程通過（擷取 → 使用這份 → 用 AI 整理 → 確認），需 P1-T076、P1-T079、P1-T080、P1-T081 都已收官

## 完成結果
