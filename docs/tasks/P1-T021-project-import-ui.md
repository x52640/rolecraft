---
id: P1-T021
phase: 1
status: done
depends_on: ["P1-T008", "P1-T016", "P1-T014", "P1-T041"]
specs: ["sources-and-authorization.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/projects/", "apps/helper/src/handlers/sources/", "apps/helper/src/main.ts"]
contract_change: none
expected_commit: "feat(P1-T021): editor：專案資料夾匯入與預覽"
---
# editor：專案資料夾匯入與預覽

## 目標

F03、R4：可累積 10 個以上資料夾，預覽後才讀。

## 範圍

### 包含

- 依 ADR-0003 的選取機制連續新增資料夾
- 列舉預覽、勾選／移除檔案或資料夾、確認後建立授權集合
- 增量更新時顯示待確認的新檔

### 不包含

- 分析（P1-T022）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/sources-and-authorization.md`
- 相依 Task 的「完成結果」：P1-T008
- 相依 Task 的「完成結果」：P1-T016
- 相依 Task 的「完成結果」：P1-T014

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 不接受外部傳入路徑
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試；S9-5 以 10 個暫存資料夾的整合測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成（真實系統選取器除外，見完成結果「待裁定」1）
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內（另依工作者規則在 `apps/helper/src/main.ts` 的 createServices 加一行接線）
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：editor 專案頁（新增資料夾、預覽樹、勾選、確認授權、移除）與 helper sources.* handler／服務
- 已通過驗證：`npm run verify` 綠（含 S9-5 十個暫存資料夾整合測試）
- 下一步：協調者決定真實 macOS 選取器放哪裡（見完成結果待裁定 1），接上後 pick_folders 才會真的開對話框
- Blocker：真實選取器需要子行程（osascript），被 `apps/helper/src/main.test.ts` 的 R7 靜態掃描禁止；該測試在 write_paths 外

## 完成結果

- editor（`apps/editor/src/pages/projects/`）：`ProjectsPage.tsx`（「新增資料夾」可連續按、累積清單、每個資料夾顯示待確認／已授權數、預覽、移除）、`FolderPreview.tsx`（預覽樹：子資料夾／文件勾選，勾子資料夾＝勾它底下全部文件；顯示大小與狀態待確認／已授權／不納入）、`preview-model.ts`（組樹、勾選、算變更、分批）、`failure-text.ts`。
- 授權規則（editor）：待確認文件一律不預先勾選；「勾選建議文件」只勾不送；按「確認」才送 `sources.update_authorization`：勾選且未授權 → 授權，沒勾且未標不納入 → 撤銷（所以確認後只剩真正的新檔會是待確認）；超過每則 5000 個 ID 自動分批，先撤銷再授權。
- helper（`apps/helper/src/handlers/sources/`）：五個 handler 接上；`local-sources.ts` 的 `createSourcesService({ picker?, registry?, openFolder? })` 以 `@rolecraft/sources` 的 SourceRegistry＋本機 fs 存取實作；`preview-tree.ts` 把相對路徑組成「不透明 ID＋上層 ID＋名稱」的樹（回應沒有任何路徑字串）；`failures.ts` 固定文字錯誤。
- 安全行為：資料夾只經注入的 picker 進入（只收絕對路徑，相對路徑、不存在、不是資料夾的略過；全部失敗才丟錯）；同一路徑重選沿用同一資料夾；選取器已開著回 invalid_request（不開第二個）；`update_authorization` 只接受該資料夾「最近一次預覽」回過且仍存在的文件 ID（子資料夾 ID、別的資料夾的 ID、未預覽的新檔都拒），任一項不合法整筆不套用；移除資料夾立即停止讀取；增量更新的新檔為待確認、不自動授權。
- 服務方法是選用的：服務沒提供的方法回 not_implemented。`main.ts` 的 createServices 加上 `sources: createSourcesService()`（沒給 picker，所以 `sources.pick_folders` 目前回 not_implemented，其餘四個操作可用）。
- 測試：`local-sources.test.ts`（S9-5：10 個暫存資料夾分三次選取、預覽只列文字文件、排除原始碼／node_modules／dist／憑證／隱藏檔、回應不含暫存路徑；預覽前不可授權；增量更新；檔案消失；移除；符號連結；取消／忙碌／重選／壞路徑）、`handlers.test.ts`（經 dispatch，回應皆過 contracts schema、錯誤不回填請求內容、帶 path 欄位被擋）、`preview-model.test.ts`、`ProjectsPage.test.tsx`（假 transport：連續新增、請求 payload 為空、確認才送授權、子資料夾勾選、移除、not_implemented 顯示錯誤）。
- 手動驗證：無（Task 規定）；真實對話框行為仍待 ADR-0003 的擁有者手動步驟。
- 待裁定：
  1. **真實 macOS 選取器沒做**：要 `execFile('/usr/bin/osascript', …)`，但 `apps/helper/src/main.test.ts` 的 R7 靜態掃描禁止 helper 正式原始碼出現 child_process／execFile，該測試不在 write_paths。建議另開小 Task：新增 `handlers/sources/mac-folder-picker.ts`（指令與參數寫死、不經 shell，照 `scripts/spikes/bridge/host/folder-picker.mjs`），在掃描測試加「只有這一個檔可用 execFile」的白名單，並在 createServices 傳入 picker。
  2. `SourcesService` 方法改成選用，是因為 `handlers/registry.test.ts`（write_paths 外）用 `sources: {}` 並要求所有編輯器操作回 not_implemented；若協調者偏好必填方法，需同步改那個測試。
  3. 預覽回應沒有分頁：候選文件非常多（約數千個以上）時改回固定的 invalid_request，提示改選子資料夾（見下「對抗驗證修正」）；要一次預覽超大資料夾需改 contracts 加分頁。
  4. 被篩掉的項目（原始碼、憑證等）contracts 沒有欄位可回，預覽只用一句說明帶過，不逐項列出。
- 殘餘：授權集合與讀檔紀錄只在 helper 記憶體（helper 行程重啟就要重新選取資料夾），持久化待 storage 接線；分析讀檔（P1-T022）要經 `createSourcesService(...).registry.read(文件 ID)`。

### 對抗驗證修正

- 沒有可見字元的名稱：子資料夾或文件名只有空白（含全形空白 U+3000）時，contracts 名稱驗證不過，整個預覽變 internal_error。改為顯示替代名稱「（未命名）」（`preview-tree.ts` 的 `visibleName`）。
- 預覽「最近一次」狀態：先以 contracts `SourceEntry` 驗證每一項、確認回應大小在上限內，通過後才替換最近一次預覽的 ID 集合；失敗時保留上一次的（之前已預覽的項目仍可授權，新檔不行）。
- 預覽過大：回應位元組數（host 單則上限扣 64 KiB 餘裕）超過時回 `invalid_request`＋固定訊息「這個資料夾的文件太多，無法一次預覽；請移除後改選其中的子資料夾」，不再變成 internal_error。未改 contracts。
- 回歸測試：`preview-limits.test.ts`（子資料夾名 ' ' 與 U+3000、約 5000 個檔、過大時不替換最近一次預覽）。
