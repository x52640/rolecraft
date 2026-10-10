---
id: P1-T008
phase: 1
status: in_progress
depends_on: ["P1-T001"]
specs: ["sources-and-authorization.md"]
track: sources
primary_repo: rolecraft
write_paths: ["packages/sources/"]
contract_change: none
expected_commit: "feat(P1-T008): sources：資料夾列舉、授權集合與安全讀檔"
---
# sources：資料夾列舉、授權集合與安全讀檔

## 目標

D5：只讀使用者確認過的文字文件。

## 範圍

### 包含

- 列舉資料夾（只取檔名、大小、類型），排除相依、建置產物、憑證、大型檔、原始碼副檔名
- 文件優先序（README、CLAUDE.md、AGENTS.md、plan、規格、task 等，大小寫不敏感）
- 授權集合管理：待確認／已授權／已撤銷
- 安全讀檔：realpath 仍在資料夾內、一般檔、符合類型；不跟隨外部 symlink；每次讀取記錄路徑、時間、雜湊
- 增量列舉：新檔標待確認

### 不包含

- 資料夾選取 UI 與選取機制（依 P1-T013 ADR）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/sources-and-authorization.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 讀檔介面只接受授權集合內的項目 ID，不接受任意路徑
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- S9-14 每個子句一個測試（用暫存資料夾與 symlink）

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：實作與測試完成，單一 commit（未 push）
- 已通過驗證：`npm run verify` 綠；sources 5 檔 98 測試
- 下一步：協調者收官前跑 E3 對抗驗證
- Blocker：無

## 完成結果

- 結構（`packages/sources/src/`）：`types.ts`（FolderAccess 埠與對外型別）、`path-rules.ts`（乾淨相對路徑）、`filter.ts`（白名單篩選、優先序、二進位偵測）、`registry.ts`（SourceRegistry：列舉、授權集合、增量更新、只收項目 ID 的 read、讀檔紀錄與拒絕提示）、`node-folder-access.ts`（本機 fs 實作）。
- 機制分離：registry 不碰檔案系統，列舉與讀取由注入的 `FolderAccess` 完成；P1-T013 若改成「瀏覽器讀內容送 helper」，只需另寫一個 FolderAccess（registry 測試已用記憶體假資料夾跑過同一流程）。
- 篩選：副檔名白名單（md、markdown、txt、text、rst、adoc、asciidoc、org；無副檔名只限 README、CHANGELOG、TODO、PLAN、AGENTS、CLAUDE）；檔名任一段是原始碼副檔名就排除（擋 `main.py.txt`）；隱藏檔／隱藏資料夾、憑證類（副檔名與檔名片段）、相依與建置資料夾、超過 1 MiB 排除。自訂檔名只提高優先序。
- 安全讀檔（本機版）：lstat → `O_NOFOLLOW|O_NONBLOCK` 開檔 → fstat 一般檔 → realpath 必須完全等於「資料夾實際路徑＋相對路徑」→ realpath 的 inode 與 fd 相同 → 讀至上限＋1 位元組（此流程已被下方「對抗驗證修正」取代）。registry 另做：狀態複查（讀取前後各一次，期間被取消勾選或移除資料夾就不交出內容）、類型複查、二進位／非 UTF-8 拒絕、sha256。
- 讀檔紀錄只記成功讀取（項目 ID、資料夾、路徑、時間、sha256）；被拒嘗試另存 `rejections()` 供提示，避免紀錄混入未授權路徑。
- 測試：S9-14 五子句各一（最後一句拆三個：換 symlink、換目錄、換二進位）＋ symlink 迴圈、中間資料夾換 symlink（外部／內部）、根資料夾被換、FIFO、`..`／絕對路徑、大小寫同名、隱藏檔、憑證檔名、原始碼偽裝。
- 待裁定／殘餘：(1) 讀檔紀錄目前只在記憶體＋`onRead` 回呼，持久化待 storage 接；(2) 篩選偏保守，`node.js.md`、`design-tokens.md` 這類檔名會被誤擋，使用者無法覆寫；(3) 「.md 裡其實是原始碼」無法靠檔名判斷，只擋二進位；(4) ~~開檔與 realpath 檢查之間仍有理論競態，但 inode 比對保證交出的內容來自檢查當下位於預期路徑的檔案~~——**此說法錯誤**：realpath 與 stat 各自重新解析路徑，對抗驗證約兩萬次讀取成功讀到一次資料夾外檔案，修正與殘餘風險見下節；(5) SourceDocument 的 contentVersion 與 R2 變更判定未接（不在本 Task）。

### 對抗驗證修正

- 讀檔競態（major）：macOS 實測無法從 fd 取回路徑（`realpath('/dev/fd/N')` 回傳 `/dev/fd/<檔名>`，Node 也沒有 F_GETPATH／openat），改為：逐段 lstat 三明治檢查（根與每層資料夾非 symlink、(dev, ino) 不變，檔案 lstat 與 `realpath.native` 夾在兩次逐段 lstat 之間）→ 記下檔案 inode → `O_NOFOLLOW` 開檔 → fstat 必須等於剛才記下的 inode → 讀內容 → 再跑一次完整三明治、檔案 inode 仍須等於 fd。Linux 另以 `/proc/self/fd/N` 直接比對 fd 路徑。實作在 `fs-identity.ts`、`node-folder-access.ts`。
- `revokeUnder`：路徑先去掉一個結尾 `/` 再用 `splitRelPath` 驗證；只接受列舉結果中某候選檔所在的資料夾（大小寫完全相同）；不合法或找不到就丟錯；`''` 一律拒絕（整個資料夾請用 `removeFolder`）。
- 列舉：每層 readdir（含取大小）前後逐段 lstat 根到該層，須非 symlink 且 (dev, ino) 與發現時相同（根比對建立時記下的值）。子資料夾不符就不採用該層結果、以 `symlink`／`other` 回報；根不符則 `list()` 丟錯要求重新選取。
- 硬連結視為資料夾內的檔案（不是缺陷，寫在 `types.ts` 註解）。
- 回歸測試：`node-folder-access-race.test.ts`（以 `testHooks` 在檢查、開檔、讀完之間換資料夾的確定性測試；列舉時子資料夾／根被換掉；`RUN_RACE=1` 時跑 4 秒真並行競態）、`registry.test.ts` 的 revokeUnder 不合法路徑。
- 驗證：PoC `race.ts` 對修正後程式跑 120 秒：約 239 萬次讀取，0 次讀到外部內容（成功讀到資料夾內 21,372 次，其餘為 not_found 1,905,373／outside_folder 280,036／path_changed 187,003／io_error 1）；修正前約兩萬次即洩漏一次。
- **殘餘風險（不宣稱保證）**：macOS 上仍是以路徑重新解析的非原子檢查。攻擊者若能在開檔前後兩次三明治檢查中，都恰好在「兩次資料夾 lstat 之間」把中間資料夾換成 symlink 再換回，且開檔也剛好走 symlink，理論上仍可能通過；這需要在數微秒內連續精準命中多次，實測未重現。要徹底消除需原生 openat／F_GETPATH（Node 未提供），留待 P1-T013 決定讀檔機制時評估。列舉同理：readdir 以路徑進行，三明治檢查只是大幅縮小窗口。
