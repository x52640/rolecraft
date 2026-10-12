---
id: P1-T080
phase: 1
status: blocked
depends_on: ["P1-T078", "P1-T079"]
specs: ["resume-import.md", "providers.md", "bridge.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/import/"]
contract_change: none
expected_commit: "feat(P1-T080): helper：網頁來源 AI 整理接線（姓名四來源、未辨識不送）"
---

# helper：網頁來源的 AI 整理接線

## 目標

把 P1-T078 的網頁區塊整理接到 `import.ai_parse`／`import.ai_status`：組出已知姓名與既有 Profile 的遮蔽值，本次頁面姓名沒辨識出、又沒帶使用者確認的姓名時不呼叫模型。

## 範圍

### 包含

- 網頁來源的 AI 輸入：姓名元素文字（`cleanHeaderName`）、標籤為姓名的區塊值、資料區既有 Profile 的姓名與聯絡值、請求帶來的使用者確認姓名（可多個寫法）
- 送出條件不成立 → `import.ai_parse` 回固定原因（讓編輯器請使用者確認姓名），不呼叫模型
- 執行走既有 Claude 路徑（選定模型、R5／R6 每次重做、R6 紀錄照存），背景執行、同一筆不重送；網址、照片不進提示
- `import.ai_status` 回網頁來源草稿（區塊出處、還原個資旗標、512 KiB 上限失敗）

### 不包含

- 編輯器按鈕與姓名輸入（P1-T081）
- PDF 路徑行為變更

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「網頁來源的 AI 整理」
- `docs/specs/providers.md` R5、R6
- P1-T078、P1-T079 完成結果；`apps/helper/src/handlers/import/ai-runner.ts`、`ai-source.ts`、`assemble.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資不送模型、計費：只在使用者按下且姓名已辨識時呼叫）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 假 provider：送出的提示不含姓名（四種來源各一案例）、聯絡值、網址；只有舊 Profile 姓名時回「需確認姓名」且模型呼叫 0 次；帶使用者確認姓名後才送
- R6 不通過不送；同一筆執行中不重送；PDF 路徑既有測試照舊

### 手動驗證

- 協調者以開發入口（P1-T068）用合成網頁擷取實跑一次（便宜模型、一次呼叫）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等相依完成後改 ready
- Blocker：相依 P1-T078、P1-T079 未完成

## 完成結果
