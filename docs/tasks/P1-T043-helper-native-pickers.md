---
id: P1-T043
phase: 1
status: done
depends_on: ["P1-T020", "P1-T021", "P1-T028", "P1-T040"]
specs: ["sources-and-authorization.md", "bridge.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["packages/sources/src/picker/", "packages/sources/src/index.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/helper/src/handlers/sources/", "apps/helper/src/handlers/import/", "apps/helper/src/handlers/applications/", "apps/helper/src/handlers/registry.test.ts"]
contract_change: none
expected_commit: "feat(P1-T043): helper：macOS 原生選取器與服務組裝"
---

# helper：macOS 原生選取器與服務組裝

## 目標

P1-T020、T021 的選檔／選資料夾目前只有注入的假選取器，因為 helper 正式原始碼禁止子程序與檔案系統（R7 靜態掃描）；P1-T020、T028 的服務也尚未接進 `createServices`。本 Task 補上真實選取器並把已實作的服務接上，讓編輯器各頁在設定資料區後實際可用。

## 範圍

### 包含

- 在 `packages/sources/src/picker/` 實作 macOS 原生選取器（ADR-0003）：資料夾（可複選）與單一 PDF 檔；AppleScript 內容寫死、`execFile` 不經 shell、不帶任何請求內容；使用者取消回空結果；只回絕對路徑給 helper（不出 helper）
- 選取器對 PDF 只回檔名與內容（大小上限），讀檔也在 sources 套件內完成，helper 原始碼仍不碰檔案系統
- helper `createServices` 接上：sources（真實資料夾選取器）、resumeImport（真實 PDF 選取器）、applications（storage）
- `registry.test.ts` 中各群組的空服務改為反映現況（已實作的群組不再假設回 not_implemented）

### 不包含

- 授權集合、匯入暫存的持久化（另開 Task）
- Windows／Linux 選取器（D11）
- 資料區預設位置（安裝程式 P1-T031 決定）

## 工作區與 Context

### 必讀入口

- `docs/specs/sources-and-authorization.md`、`docs/specs/bridge.md`、`docs/specs/architecture.md`
- `docs/adr/0003-bridge-transport.md`；`scripts/spikes/bridge/host/folder-picker.mjs`（P1-T013 實測過的做法）
- P1-T020、T021、T028、T040 完成結果

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R7 檔案授權），收官前跑對抗驗證
- 單元測試不得真的開對話框（注入假 execFile）；真實對話框測試只在 `RUN_PICKER=1` 時跑
- helper 的 R7 靜態掃描維持不放寬
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 選取器命令固定、不經 shell；取消、非資料夾、非 PDF、超過大小上限都有測試
- `createServices` 在有 runtime 時接上 sources、resumeImport、applications

### 手動驗證

- 擁有者在真實擴充功能頁選資料夾與 PDF 各一次（需擁有者）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：sources 選取器（資料夾／PDF）、createServices 接上 sources 選取器、resumeImport、applications，registry 測試改寫
- 已通過驗證：worktree `npm run verify` 綠；協調者主樹 verify 綠；對抗驗證（E3）2 個角度均無發現
- 下一步：協調者收官（高風險 R7：對抗驗證）；擁有者手動驗證真實對話框
- Blocker：無

## 完成結果

- 選取器（`packages/sources/src/picker/`，由 `@rolecraft/sources` 匯出）：
  - `osascript.ts`：唯一用到子行程的檔案。只執行 `/usr/bin/osascript`（絕對路徑，不靠 PATH），參數只有寫死腳本的 `-e` 行，`shell: false`、5 分鐘逾時、輸出上限 1 MiB。錯誤 -128 視為使用者取消；其他失敗丟 `PickerError`（原因代碼＋固定訊息，不帶 stderr 或路徑）。非 macOS 不執行（`not_macos`）。
  - `folder-picker.ts`：`choose folder … with multiple selections allowed`；腳本先輸出數量再逐行輸出路徑，數量對不上（例如名稱含換行）、相對路徑、不以 `/` 結尾就整批不採用（`bad_output`），不 trim（保留名稱前後空白）。取消回空陣列。絕對路徑只交給 helper 的 sources 服務登記，回應只有不透明 ID 與名稱（沿用 P1-T021）。
  - `pdf-picker.ts`：`choose file … of type {"com.adobe.pdf"}`（單選）；讀檔在 sources 內：副檔名須為 `.pdf`、`O_NOFOLLOW` 開檔（不跟隨符號連結）、fstat 必須是一般檔、上限 20 MiB（`DEFAULT_MAX_PDF_BYTES`）、讀取中變大不採用、前 1024 位元組內須有 `%PDF-`。只回 `{ fileName（不含路徑）, bytes }`；取消回 null。
- helper 組裝（`apps/helper/src/main.ts`）：`nativePickers()` 只在 macOS 建立兩個選取器（D11，其他平台對應操作回 not_implemented）；`createServices(storage, pickers = nativePickers())`：sources 一律接、有資料夾選取器時 `pick_folders` 可用；有 storage 且有 PDF 選取器才接 resumeImport（Profile 寫入 storage）；有 storage 就接 applications（投遞紀錄＋匯出版本 repository）。第二參數只供測試換假選取器。helper 原始碼的 R7 靜態掃描未放寬（helper 內沒有任何 child_process／fs）。
- 測試：`folder-picker.test.ts`、`pdf-picker.test.ts`（假 execFile：命令與參數固定、每次相同、不經 shell、取消、非 macOS、輸出格式不符；真檔案：成功只回檔名、非 .pdf、假 PDF、檔頭太後面、超過上限、剛好上限、名為 .pdf 的資料夾、符號連結、不存在；原始碼靜態檢查只在 `osascript.ts` 用 execFile）；`main.test.ts` 接線（有無 storage／選取器的組合、真選取器＋假 osascript 經 dispatch 回應不含暫存路徑與檔案內容、非 PDF 回 internal_error 後可再選）；`registry.test.ts` 改為「沒接上服務或服務缺方法回 not_implemented」，接線改由 main.test.ts 驗。`picker.dialog.test.ts` 真實對話框只在 `RUN_PICKER=1` 時跑（本 Task 未執行）。
- 手動驗證：未做（需擁有者在真實擴充功能頁選資料夾與 PDF 各一次；也可 `RUN_PICKER=1 npx vitest run packages/sources/src/picker/picker.dialog.test.ts`）。對話框是否跳到最前面、TCC 提示掛誰名下仍待 ADR-0003 手動步驟。
- 待裁定：
  1. 選到非 PDF／超過 20 MiB／符號連結時，`import.pick_pdf` 回 `internal_error`（固定訊息），編輯器無法說明原因；要友善提示需 contracts 加失敗原因（例如 `too_large`）。
  2. 選根目錄 `/` 視為輸出不符、整批不採用（保守）。
  3. osascript 繼承 helper 的環境變數（瀏覽器啟動 host 時的環境，不含請求內容）；未清空，以免影響對話框顯示。
