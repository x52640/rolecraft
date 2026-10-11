---
id: P1-T059
phase: 1
status: done
depends_on: []
specs: ["bridge.md", "architecture.md"]
track: tooling
primary_repo: rolecraft
write_paths: ["scripts/dev/", "package.json", "README.md", "docs/specs/bridge.md"]
contract_change: none
expected_commit: "feat(P1-T059): 開發用安裝腳本：註冊 helper、準備資料區與字型"
---

# 開發用安裝腳本：註冊 helper、準備資料區與字型

## 目標

正式安裝程式（P1-T031）要等 104 擷取完成。在那之前，擁有者需要一個開發用腳本，在自己的 Mac 上把真的 helper 接上瀏覽器擴充功能，才能整套測試。

## 範圍

### 包含

- `scripts/dev/install-helper.mjs`（加 `npm run dev:install`、`npm run dev:uninstall`）：
  - 參數：`--browser chrome|edge|arc`（預設 chrome）、`--extension-id <id>`（必填，Load unpacked 後從擴充功能頁複製）、`--data-dir`（預設 `~/Library/Application Support/RoleCraft-dev`）、`--yes`（沒有就只印出會做的事、不寫任何檔）
  - 產生 wrapper（`.sh`，寫死 node 絕對路徑與 `apps/helper/src/main.ts` 絕對路徑），設 `ROLECRAFT_ALLOWED_ORIGINS=chrome-extension://<id>/`、`ROLECRAFT_DATA_DIR`、`ROLECRAFT_FONTS_DIR`（放資料區下 `fonts/`）
  - 寫入使用者層級 Native Messaging host manifest（`com.rolecraft.helper`，目錄依 ADR-0003）
  - 字型不存在就呼叫 `packages/pdf-export/scripts/fetch-fonts.mjs --out <fonts dir>`
  - `--uninstall`：只刪自己寫的 manifest 與 wrapper，不刪資料區
  - 參考 `scripts/spikes/bridge/install.mjs` 的做法
- README 開發段：完整步驟（npm install → npm run build → Chrome Load unpacked → 複製 ID → dev:install → 重開瀏覽器）與如何確認接上
- bridge.md 補一句開發安裝與正式安裝（T031）的差別

### 不包含

- 正式安裝程式、內建 Node、固定擴充功能 ID（P1-T031）
- 實際在擁有者機器上執行（擁有者自己跑）

## 工作區與 Context

### 必讀入口

- `docs/adr/0003-bridge-transport.md`（manifest 目錄、手動步驟）
- `scripts/spikes/bridge/install.mjs`
- `apps/helper/src/services/runtime.ts`、`apps/helper/src/bridge/origin.ts`（環境變數規則）
- P1-T031 Task 檔（不要做它的範圍）
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 中風險，不跑對抗驗證
- **測試與開發過程不准寫入真的家目錄**：所有路徑可注入，測試一律用暫存目錄；不准真的執行安裝
- 沒有 `--yes` 不寫任何檔案；路徑一律絕對路徑；ID 格式檢查（32 個 a–p 字元）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；helper 原始碼 R7 靜態掃描不放寬（helper 內不得直接用 fs／child_process）

## 驗證

### 自動驗證

- 乾跑不寫檔；`--yes` 在暫存目錄產生正確 manifest、wrapper（含三個環境變數）；`--uninstall` 只刪自己的檔；ID 格式錯誤拒絕

### 手動驗證

- 擁有者自己執行並在擴充功能頁確認接上（需擁有者）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：開發安裝腳本、測試、README 開發段、bridge.md 補充（工作者）
- 已通過驗證：`npm run verify`（含新的 `test:scripts` 8 案）
- 下一步：協調者收官；擁有者在自己的 Mac 依 README 執行並確認接上
- Blocker：無

## 完成結果

- `scripts/dev/install-helper.mjs`：`npm run dev:install`／`dev:uninstall`。參數 `--browser chrome|edge|arc`、`--extension-id`（必填，32 個 a–p）、`--data-dir`（必須絕對路徑、不可含控制字元；預設 `~/Library/Application Support/RoleCraft-dev`）、`--yes`；未知參數與多餘位置參數一律拒絕。沒有 `--yes` 只印出會做的事，不建目錄、不寫檔、不下載。
- 包裝檔 `com.rolecraft.helper.sh` 與 manifest `com.rolecraft.helper.json` 放在瀏覽器的 NativeMessagingHosts 目錄（ADR-0003）；包裝檔寫死 node 與 `apps/helper/src/main.ts` 絕對路徑（Node 直接跑 .ts），設 `ROLECRAFT_ALLOWED_ORIGINS`、`ROLECRAFT_DATA_DIR`、`ROLECRAFT_FONTS_DIR`（資料區下 `fonts/`），值一律 shell 引號包住。
- 字型：資料區 `fonts/` 缺任何一個隨附字型檔才呼叫 `fetch-fonts.mjs --out`（雜湊由它驗）；下載步驟可注入。
- 安全邊界：manifest 的 description＋path、包裝檔第二行標記用來認「自己寫的檔」；目錄已有不是開發安裝寫的同名檔（例如將來的正式安裝）時，安裝拒絕覆寫、移除拒絕刪除。`--uninstall` 只刪這兩個檔，不刪資料區。
- 測試 `scripts/dev/install-helper.test.mjs`（node:test，接進 `verify` 的 `test:scripts`）：家目錄、helper 進入點、字型下載全部注入暫存目錄與假函式；含乾跑不寫檔、`--yes` 內容與實際執行包裝檔檢查三個環境變數（含空白與單引號路徑）、字型已存在不下載、Edge 目錄、移除只刪自己的檔、外來檔拒絕、各種參數錯誤拒絕且不寫檔。
- README 開發段補完整步驟與如何確認接上（編輯器「設定」頁能取得服務狀態）；bridge.md R7 補一句開發安裝與正式安裝（P1-T031）的差別。
- 手動驗證（在擁有者的 Mac 實際安裝並確認接上）需擁有者，本 Task 沒有對真實路徑執行安裝。
