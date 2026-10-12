# RoleCraft

> A local, single-user AI resume editor that uses your existing Claude subscription to build source-backed resumes for each job. Work in progress, macOS only.

本機執行的 AI 履歷編輯器：用你既有的 Claude 訂閱，從專案文件整理有出處的經歷，針對職缺產生客製中文履歷 PDF。

**目前還在開發中，還不能從頭到尾產出一份履歷。** 首版定位是作者自用（[plan.md](plan.md) D17），只支援 macOS（D11）。

## 核心原則

完整裁定見 [plan.md](plan.md) 決策記錄，這裡只列最重要的幾條：

- **只用既有訂閱**：透過你已登入的官方 AI 工具（目前是 Claude Code CLI）執行，不接額外計費的 API；環境裡有 API key 也不會回退去用它（D2、D12）。
- **事實要有出處**：履歷上的每一句要能指回來源文件片段或你親自確認的內容；「文件寫已完成」不等於完成，沒經你確認不會寫成已完成（D4、D14）。
- **本機執行、資料留在本機**：資料存在本機 SQLite 與檔案，不建雲端帳號、不同步。
- **外部內容是資料不是指令**：匯入的文件、職缺頁、招募訊息不會被當成指令；模型或外部內容不能決定要執行什麼 shell 指令（D6）。
- **不自動送出**：回覆草稿只能編輯與複製，不會替你送出訊息或投遞（D7）。

## 目前狀態

已完成並有測試（`npm run verify` 涵蓋）：

| 部分 | 內容 |
|---|---|
| 資料模型與規則 | 事實項四種完成狀態、匯出前檢查、來源變更判定、輸入預算與拆批、工作單元狀態機 |
| 本機儲存 | SQLite schema、不可變的匯出版本、投遞紀錄與刪除規則 |
| 讀取專案文件 | 只讀使用者授權的資料夾內的文字文件，不讀原始碼 |
| 履歷 PDF 匯入 | 擷取 PDF 文字層（中文 PDF 尚未用真實履歷實測） |
| Claude 連接 | 呼叫 Claude Code CLI 的隔離執行、擋 API key 回退；注入測試已實際跑過 |
| 擴充功能與本機輔助程式 | Manifest V3 擴充功能骨架、透過 Native Messaging 與本機輔助程式通訊（Chrome 已實測；Arc、Edge 未測） |
| 編輯器 | React 編輯器頁骨架與路由（功能頁面尚未接上） |
| PDF 匯出 | 中文單一模板與匯出前檢查；**需要本機安裝 Google Chrome**（用它背景列印） |

開發中或尚未支援：

| 項目 | 狀態 |
|---|---|
| 104 職缺頁自動擷取 | 開發中 |
| 文件分析成事實項、職缺匹配與段落生成 | 開發中 |
| 編輯器各功能頁（匯入、職缺、事實項確認、逐段編輯、投遞紀錄、設定精靈） | 開發中 |
| 招募訊息回覆草稿 | 開發中 |
| macOS 安裝包（一般使用者免終端安裝） | 開發中；目前只能用開發者方式建置 |
| ChatGPT／Codex、Google Antigravity | 尚未支援 |
| Cake、Yourator 自動擷取 | 尚未支援 |
| Windows、Linux | 尚未支援 |

各 Task 的即時狀態見 [docs/tasks/INDEX.md](docs/tasks/INDEX.md)。

## 架構

```
瀏覽器端                                     本機端
apps/extension（MV3 擴充功能）               apps/helper（本機輔助程式）
  ├─ service worker  ◄── Native Messaging ──►  橋接端點、操作清單分派
  ├─ 逐站 content script                        │
  └─ apps/editor（React 編輯器分頁）            ├─ packages/storage        SQLite＋檔案、不可變匯出版本
        │                                       ├─ packages/sources        授權資料夾、安全讀檔
        │                                       ├─ packages/resume-import  PDF 文字層擷取
        │                                       ├─ packages/pdf-export     模板→PDF（本機 Chrome）
        │                                       └─ packages/pipeline       分析與生成
        │                                             └─ packages/providers  呼叫官方 AI CLI（Claude）
        │                                       （storage、sources、providers、pipeline 共用
        │                                        packages/domain：純邏輯、不做 I/O）
        ▼                                             ▼
packages/contracts ◄──────────── 所有套件 ────────────┘
（核心資料型別、橋接訊息 schema）
```

- 擴充功能與編輯器只透過 `packages/contracts` 和本機輔助程式溝通，不直接 import 後端套件。
- 每個套件能依賴誰、單檔 300 行上限都由 lint 強制。完整規則見 [docs/specs/architecture.md](docs/specs/architecture.md)。

## 開發

需求：macOS、Node.js 24 以上；PDF 匯出需要 Google Chrome；連接 AI 需要已登入的 Claude Code CLI。

```bash
npm install        # 安裝相依（npm workspaces）
npm run verify     # 唯一品質閘門：格式、lint、typecheck、測試、文件檢查
npm run build      # 建置擴充功能（含編輯器頁）到 apps/extension/dist/unpacked/
```

`npm run build` 的輸出可在 Chrome「載入未封裝項目」載入。

### 開發用：把本機輔助程式接上瀏覽器

正式安裝包（P1-T031）完成前，用開發腳本把 repo 裡的本機輔助程式（helper）註冊給瀏覽器。
它是給開發者自己的 Mac 用的：包裝檔寫死目前 `node` 與 repo 的絕對路徑，換 Node 版本或搬動 repo 後要重跑。

1. `npm install`
2. `npm run build`
3. 開 `chrome://extensions`（Edge：`edge://extensions`；Arc：`arc://extensions`），打開「開發人員模式」，「載入未封裝項目」選 `apps/extension/dist/unpacked/`。
4. 複製擴充功能卡片上的 ID（32 個英文小寫字母）。
5. 先看會做什麼（乾跑，不寫任何檔）：
   `npm run dev:install -- --extension-id <ID>`
   可加 `--browser edge` 或 `--browser arc`（預設 chrome）、`--data-dir <絕對路徑>`（預設 `~/Library/Application Support/RoleCraft-dev`）。
6. 確認後加 `--yes` 實際執行：`npm run dev:install -- --extension-id <ID> --yes`。
   會建立資料區、缺字型時下載 Noto Sans TC（約 14 MB，比對 sha256），並在瀏覽器的 NativeMessagingHosts 目錄寫入 `com.rolecraft.helper.json` 與 `com.rolecraft.helper.sh`。
7. 完全關閉瀏覽器（Cmd+Q）再重開。

確認接上：點工具列的 RoleCraft 圖示開編輯器 →「設定」頁。看到 AI 服務狀態清單就是接上了；顯示「無法取得服務狀態」就是沒接上（常見原因：ID 打錯、從不同資料夾載入擴充功能導致 ID 變了、沒重開瀏覽器）。

移除：`npm run dev:uninstall -- --browser <同上> --yes`。只刪上面兩個檔，資料區保留；要清資料請自己刪資料區資料夾。
若目錄裡已有不是開發腳本寫的同名檔（例如正式安裝），腳本會拒絕覆寫或刪除。

### 開發用：在一般分頁測編輯器

`npm run dev:harness -- --pdf <履歷.pdf> --folders <資料夾,...>`：編輯器跑在 `http://127.0.0.1:<port>/?token=...`，接真的 helper，選取器回傳指定路徑。只供自測、會呼叫真實 Claude；說明見 [docs/dev-harness.md](docs/dev-harness.md)。

預設跳過、需要環境變數才跑的實測：

| 環境變數 | 測試 | 需要 |
|---|---|---|
| `RUN_LIVE=1` | Claude CLI 注入測試與正式路徑（加 `RUN_LIVE_MODELS=1` 逐一驗證模型） | 已登入的 Claude Code CLI；**會消耗訂閱額度** |
| `RUN_CHROME=1` | PDF 匯出用本機 Chrome 真的列印；擴充功能履歷頁擷取在真實 Chrome 比對 fixture 與渲染判定（`apps/extension/src/sites/104/resume`） | Google Chrome |
| `RUN_RACE=1` | 讀檔的真並行競態測試 | 無 |

例：`RUN_CHROME=1 npx vitest run packages/pdf-export`。

## 文件導覽

| 文件 | 用途 |
|---|---|
| [plan.md](plan.md) | 產品目標、邊界、決策記錄（裁定的唯一來源） |
| [docs/README.md](docs/README.md) | 文件治理規則與權威順序 |
| [docs/specs/README.md](docs/specs/README.md) | 技術規格索引 |
| [docs/CURRENT_TASK.md](docs/CURRENT_TASK.md) | 現在在做什麼、下一步 |
| [docs/RESIDUALS.md](docs/RESIDUALS.md) | 已知殘餘問題 |
| [docs/REVIEW_QUEUE.md](docs/REVIEW_QUEUE.md) | 待補的 codex review |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 參與規則 |

`Spec.md` 與 `docs/spec-discussions/` 是歷史來源，不是現行需求。

## 授權

[MIT](LICENSE)
