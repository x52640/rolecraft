# 架構與資料物件

> 內容搬自已定稿的 `docs/spec-discussions/rolecraft-v01/spec.md`（2026-10-10，Codex 定稿確認 no_blockers）。
> F 開頭是原始功能描述，R 開頭是討論補充規則；**兩者衝突時以 R 為準**。D 編號見 `plan.md` 決策記錄。
> 權威範圍：元件、核心資料物件。

## S7. 建議架構（尚未定案）

1. **瀏覽器擴充功能**：TypeScript、Manifest V3、逐站 content script，處理授權與使用者觸發的頁面擷取。
2. **編輯器分頁**：React + TypeScript，提供資料匯入、校正、職缺管理、版本編輯、PDF 預覽及面試入口。可由擴充功能開啟。
3. **本機輔助程式**：建議 Node.js／TypeScript；負責本機資料、PDF 處理、文件索引、官方工具連接及工作狀態。以安裝精靈封裝，通訊方式在技術驗證後確定。
4. **供應商適配層**：三個服務各自處理資格檢查、登入、模型、執行、取消及配額錯誤；共同遵守訂閱限定規則。
5. **本機資料儲存**：建議 SQLite + 檔案，保存來源、確認狀態、摘要、快照與版本；不預設新增雲端帳號或資料同步。

純網頁能處理使用者選取的本機文件，但為連接本機官方 AI 工具，首版架構增加本機輔助程式。這是訂閱整合需求帶來的變更。

本機連接須限制來源並驗證請求，不讓任意網站呼叫本機程式或命令。模型與外部文件不可直接決定要執行的 shell 指令。

## 核心資料物件〔補：依 S11 修改〕

| 物件 | 必要關聯／內容 |
| --- | --- |
| Profile | 個人資料、完整經歷、技能；PDF 解析結果是否已經使用者確認（R10）；〔D30〕helper 管理的版本號、各欄出處原文（只供顯示，不是欄位值；resume-import「個人資料編輯（D30）」） |
| 照片（〔D28〕新增） | 資料區唯一一張「目前的照片」：helper 配發的照片 ID、重新編碼後的 JPEG、雜湊、尺寸；獨立於 Profile，印進匯出 PDF 後是素材（D19）（resume-output「照片」） |
| SourceDocument | 所屬資料夾、文件路徑／頁碼、內容雜湊與版本、授權狀態（待確認／已授權／已撤銷）、匯入時間（R4） |
| Claim（事實項，〔補〕新增） | 類型（功能／交付物／個人角色／成果數字／使用人數／連結）、完成狀態（D4 四態，適用功能與交付物）、依據（來源片段：SourceDocument 版本＋位置＋原文；及／或使用者確認：時間＋當時文字）、複核狀態（正常／待複核／來源已移除／來源矛盾）（R1、R2） |
| ProjectEvidence | 專案摘要與所屬事實項；摘要本身不帶確認狀態（R1） |
| JobSnapshot | 平台、URL、公司、職稱、描述、擷取時間；擷取方式（自動／手動貼上）、各欄位擷取結果、是否被使用者修改（R10） |
| ResumeVersion | 職缺快照、各段引用的事實項或逐段確認、編輯內容、版本時間；每次匯出產生不可變的匯出版本（PDF 與雜湊、引用片段副本、職缺快照副本；〔D28〕有照片時另記照片 ID 與雜湊）（R1、R3） |
| ApplicationRecord | 主動／受邀、日期、狀態、實際投出的匯出版本（只能指向不可變的匯出版本）（R3） |
| MessageDraft | 選定對話、擷取方式、回覆意圖、草稿、來源平台 |
| ProviderConnection | 服務、登入與資格狀態、可用模型、訂閱限定檢查；每次執行的 R6 確認紀錄 |
| WorkJob（工作，〔補〕新增） | 單元清單與各單元狀態、每個單元使用的服務與模型、暫停原因、重試次數（R9） |
| InterviewSession | 投遞紀錄指向的匯出版本、問答、回饋；第二階段使用 |

## 模組切分（E1，協調者定義；理由見 `docs/adr/0001-monorepo-modules.md`）

npm workspaces monorepo，全部 TypeScript（strict、ESM）。

| 路徑 | 套件名 | 職責 | 可以依賴 |
|---|---|---|---|
| `packages/contracts` | `@rolecraft/contracts` | 核心資料物件型別、橋接操作清單與訊息 schema（zod）、共用常數。跨端序列化點 | zod |
| `packages/domain` | `@rolecraft/domain` | 純邏輯：事實項狀態與 R1 匯出檢查、R2 來源變更判定、R8 預算、R9 工作單元狀態機。**不得做 I/O** | contracts |
| `packages/storage` | `@rolecraft/storage` | SQLite（`node:sqlite`）schema、migration、repository；檔案儲存；不可變匯出版本 | contracts、domain |
| `packages/sources` | `@rolecraft/sources` | 資料夾列舉、文件篩選、授權集合、安全讀檔與讀檔紀錄（R4） | contracts、domain |
| `packages/resume-import` | `@rolecraft/resume-import` | PDF 文字層擷取、頁碼、亂碼偵測 | contracts |
| `packages/providers` | `@rolecraft/providers` | 供應商適配介面、環境清理、R5 隔離、R6 確認紀錄；各家一個子資料夾 | contracts、domain |
| `packages/pipeline` | `@rolecraft/pipeline` | 分析與生成流程：文件→事實項、職缺匹配、段落生成；組裝提示 | contracts、domain、providers |
| `packages/pdf-export` | `@rolecraft/pdf-export` | 履歷模板→PDF、匯出前檢查 | contracts |
| `apps/helper` | `@rolecraft/helper` | 本機輔助程式：橋接端點、操作清單分派（R7）、服務組裝 | 所有 packages |
| `apps/extension` | `@rolecraft/extension` | MV3 擴充功能、逐站 content script、橋接客戶端 | contracts |
| `apps/editor` | `@rolecraft/editor` | React 編輯器分頁 | contracts |

規則（lint 強制）：

- 單一原始碼檔（不含測試與 fixture）上限 300 行；超過就拆模組。
- `packages/*` 不得依賴 `apps/*`；只能依賴上表「可以依賴」欄。`apps/extension` 與 `apps/editor` 只透過 contracts 與 helper 溝通，不直接 import 後端套件。
- 每個套件只從 `src/index.ts` 對外匯出；跨套件不得 deep import。
- 測試與原始碼同套件：`src/**/*.test.ts`。
