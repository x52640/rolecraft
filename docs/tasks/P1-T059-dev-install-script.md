---
id: P1-T059
phase: 1
status: in_progress
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

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：
- 已通過驗證：
- 下一步：
- Blocker：

## 完成結果

