---
id: P1-T081
phase: 1
status: blocked
depends_on: ["P1-T074"]
specs: ["resume-import.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/"]
contract_change: none
expected_commit: "feat(P1-T081): editor：匯入頁顯示網頁擷取、區塊預覽、按鈕 AI 整理、姓名確認與手動輸入"
---

# editor：匯入頁接網頁擷取與手動輸入

## 目標

匯入頁顯示最近一次網頁擷取，使用者按「使用這份」核對區塊、按「用 AI 整理」才送模型；一律提供「手動輸入」；確認前明示會取代目前的個人資料。可先對假橋接開發。

## 範圍

### 包含

- `import.latest_capture`：顯示平台、擷取時間、是否截斷與「使用這份」；擷取送達不改變正在核對的內容
- 預覽依來源顯示「第 N 頁第 M 行」或「區塊 bN」；截斷時持續顯示「內容不完整」
- 網頁來源一律按鈕：`useAiParse` 的自動開始對網頁來源關閉；開啟、切換工作階段、查詢都不送 `import.ai_parse`；PDF 維持現行（104 按鈕、其他自動）
- 姓名確認：helper 回「需確認姓名」時顯示輸入（預填既有 Profile 姓名、可修改、可加多個寫法），確認後才送
- 草稿欄位有「還原出姓名或聯絡資料」旗標時在該欄標示「含姓名或聯絡資料」
- AI 失敗或不可用時顯示擷取到的區塊供手動輸入
- 「手動輸入」入口一律顯示（`import.start_manual`）
- 確認列明示「會取代目前的個人資料」；helper 回多份 Profile 時顯示原因

### 不包含

- 拿掉 PDF 入口（P1-T087）
- helper 與 pipeline 行為

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入工作階段」「網頁來源的 AI 整理」
- P1-T074 完成結果；P1-T069 完成結果中編輯器部分；`apps/editor/src/pages/import/`（`ImportPage.tsx`、`useAiParse.ts`、`ParsePreview.tsx`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（計費：網頁來源不得自動呼叫模型）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 網頁來源：擷取送達、`latest_capture` 查詢、開啟或切換工作階段都不送 `import.ai_parse`；按「用 AI 整理」才送
- PDF 自動整理行為照舊（既有測試通過）
- 姓名確認、截斷標示、含個資標示、手動輸入、取代提示各有測試

### 手動驗證

- 無（端到端在 P1-T087 前的擁有者實跑）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等 P1-T074 收官後改 ready
- Blocker：相依 P1-T074 未完成

## 完成結果
