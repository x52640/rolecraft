---
id: P1-T025
phase: 1
status: done
depends_on: ["P1-T024", "P1-T023"]
specs: ["resume-output.md", "evidence-model.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/resumes/", "apps/helper/src/handlers/resume/", "packages/contracts/src/bridge/editor/resume.ts", "apps/helper/src/main.ts", "apps/helper/src/handlers/export/export-create.ts", "apps/helper/src/handlers/export/export-create.test.ts", "docs/specs/bridge.md", "apps/helper/src/handlers/export/__fixtures__/"]
contract_change: none
expected_commit: "feat(P1-T025): editor：逐段對照、接受與匯出前檢查"
---
# editor：逐段對照、接受與匯出前檢查

## 目標

F07、R1：使用者逐段把關，檢查不過不能匯出。

## 範圍

### 包含

- 原文與修改稿對照；逐段接受、退回、自行編輯
- 引用編輯規則（只增不刪，刪要整段）
- R1 檢查結果顯示與處理入口（改寫、刪除、去確認事實項、逐段確認）

### 不包含

- PDF 產生

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T024
- 相依 Task 的「完成結果」：P1-T023

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 接受修改稿≠確認事實
- 引用的宣稱完成程度被調低（例如已完成→進行中）時，強制提醒使用者重看該段措辭（P1-T002 對抗驗證：domain 無法判定措辭，R1 交由 F07 把關）
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件與 handler 測試

### 手動驗證

- 無

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 變更全在 write_paths 內
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：對抗驗證修正 3 項＋接上 resume.generate 的模型執行（見下方「對抗驗證修正」）
- 已通過驗證：worktree `npm run verify` 綠（Vitest 2500 通過、13 略過；test:docs 15）
- 下一步：協調者收官
- Blocker：無

## 完成結果

- 結構：helper `apps/helper/src/handlers/resume/`：`service.ts`（介面，方法皆選填，同 ExportService）、`storage-service.ts`（`createResumeService({ db, now?, generation? })`）、`section-rules.ts`（編輯規則，純函式）、`readiness.ts`（匯出前檢查與原文對照）、`generation.ts`（resume.generate 服務）、`claude-engine.ts`（Claude 執行，重用 messages 的 `createClaudeDraftEngine`）、`failure.ts`（固定錯誤訊息）、九個 handler。editor `apps/editor/src/pages/resumes/`：`ResumesPage.tsx`、`SectionCard.tsx`、`SectionEditor.tsx`、`useResumeEditor.ts`、`labels.ts`、`resumes.css`。`assemble.ts`（服務組裝＋啟動時暫停中斷工作）。`main.ts` 只呼叫 assemble 的兩個函式（有儲存才接 resume，含使用者選定的 Claude 模型）。
- contracts（resume.* 擴充，請求 ID 仍是 OpaqueId）：`resume.get` 回應加 `originals`（經歷段落對到的 Profile 經歷描述，供原文對照）；`resume.edit_section` 請求加選填 `completionDowngradeAcknowledged: true`；`resume.check_export` 回應加 `blockers`（`pending`／`rejected`／`placement_missing`／`experience_not_found`），`ready`＝R1 通過且沒有 blocker。
- 接受與退回（F07、R1）：接受只把 decision 改成 accepted，不碰事實項、不碰逐段確認（測試鎖住事實項完全不變）；退回改 rejected。未接受或已退回的非空白段落列為 blocker，不能匯出。
- 編輯（R1 第 2 輪補）：用 domain `checkSectionEdit`，只移除引用、改生成引用紀錄一律拒絕且不寫入；新增引用必須指向存在的事實項、不可重複。任何內容變動都清掉逐段確認、decision 回到 pending（要重新接受）。
- 完成程度調低（P1-T002 對抗驗證交辦）：既有引用的宣稱完成程度變低（已完成→進行中、拿掉標示也算）時，請求沒帶 `completionDowngradeAcknowledged: true` 就拒絕；畫面列出被調低的事實項、要求重看並勾選「我已重看本段措辭」才能儲存。helper 與畫面兩邊都擋。
- 逐段確認：文字必須等於該段目前全文；該段有檢查 2、事實項不可用或引用完整性問題（domain 標為不可逐段確認）時直接拒絕、不寫入；時間只由 helper 的 `now()` 決定。
- 匯出前檢查與處理入口：domain `checkExportReadiness`（事實項取目前狀態，Profile 用唯一且已確認的那份，與 export.create 同條件）＋ blockers。畫面逐段顯示問題，入口：改寫、刪除整段（按兩次）、到事實項頁確認（檢查 2、事實項不可用時出現）、逐段確認（只在該段所有問題都可逐段確認時出現）。
- resume.generate：只用已確認的快照（`planGeneration`），先在 helper 跑一次 `prepareGeneration`（快照、Profile、可用事實項、預算），不成立直接回原因、不建工作、不啟動程式；成立才建 WorkJob、回工作 id，背景經 P1-T024 `createGenerationRunner` 執行。`commitUnit` 在同一交易寫入履歷版本與工作狀態；pipeline `placements` 對應成 contracts `ResumeSection.placement`（經歷用公司＋職稱＋起始日期），對應不到的段落不帶 placement（匯出前檢查擋）；decision 一律 pending、保留 rationale；R6 紀錄經 `runCheckRecords.append` 保存。同一職缺同時只跑一個；結束時工作仍是 running（blocked、not_sent、例外）就改為已暫停（D21）。Claude 執行經 `ClaudeService.run`，deps 一律經 `helperClaudeDeps`（靜態檢查通過）。
- 測試：helper `resume.test.ts`（dispatch→handler→真實 SQLite，18 項）、`generate.test.ts`（假 spawn 跑 Claude 真實檢查路徑，5 項：完整流程與 placement 對應、API key 不進子程序、待複核事實項不送出、未確認快照／沒選模型／沒可用事實項不啟動程式、不合格輸出有上限重試後暫停且不寫入、同職缺不重複）；editor `ResumesPage.test.ts`（8 項）。
- 手動驗證：無（真實 Claude 執行需擁有者）。
- 保守選擇：(1) 生成段落要逐段接受才可匯出，退回的段落要重新接受、改寫後接受，或刪除整段；(2) 任何編輯讓段落回到待接受；(3) 新增引用時功能／交付物預設寫成「規劃中」；(4) 逐段確認遇到不可逐段確認的問題直接拒絕，而不是記錄後讓檢查照樣擋；(5) `resume.generate` 的模型只取使用者在設定頁選定且目前可用的 Claude 模型（與 P1-T029 共用 `createClaudeDraftEngine`），沒有就回 invalid_request、不送出；輸入預算與回覆草稿同一組保守值；(6) 工作狀態查詢與續跑沒有橋接操作，本 Task 不做，畫面以「重新整理」讀新版本。
- 需擁有者裁定：(a) 生成的輸入預算沿用回覆草稿的保守值（上下文 200,000、預留輸出 8,000、工具開銷 40,000），providers 沒有各模型的上下文上限；(b) 沒有「新增段落」操作，所以 user_written 段落無法從畫面產生；(c) 匹配與待補資訊沒有持久化位置，生成結果只存段落；(d) 生成被 R6 擋下或 other 錯誤時沒有專屬暫停原因，以 `interrupted`（domain `restoreWorkRun`）標示為已暫停（同 P1-T022 待裁定 3）。

### 對抗驗證修正

| 缺陷 | 修正 | 測試 |
| --- | --- | --- |
| （major）`export.create` 只看 R1，未接受／已退回段落照樣印出 | 段落阻擋抽成共用純函式 `resume/readiness.ts` `sectionBlockers`；`export.create` 對凍結快照跑完 R1 後套用同一套，有 blocker 就回 not_ready、不呼叫匯出器。缺段落歸屬也改由它先擋（回 not_ready）。`bridge.md` 補 export.create 與 resume.*（originals、completionDowngradeAcknowledged、blockers）語意 | `export-create.test.ts`：待接受、已退回、缺省 decision 都回 not_ready 且不建立匯出版本 |
| （minor）退回提示只寫改寫或刪除 | 保留「退回後可直接重新接受」，提示改為「重新接受、改寫後接受，或刪除整段」 | `resume.test.ts`：reject→accept 後 blocker 消失 |
| （minor）生成結束為 blocked／not_sent／例外時工作永久停在 running | 結束時工作仍是 running 就以 domain `restoreWorkRun` 改為已暫停（interrupted，D21 使用者手動續跑）；helper 啟動、開好資料區後 `pauseInterruptedJobs` 對所有 running 工作做同樣處理（`main.ts` 一行） | `generate.test.ts`：R6 不成立（未登入）與執行丟例外後都是 paused；啟動處理只改 running |
| （接線）resume.generate 未接模型執行 | 照 P1-T029 做法，`resume/assemble.ts` 以 providers 服務的選定且可用模型組 `createClaudeGenerationEngine`，`main.ts` 改呼叫它 | `generate.test.ts` 經假 providers＋假 spawn；`resume.test.ts`：沒有選定模型回 invalid_request、不建工作 |

- 範圍外改動（需協調者稽核）：`apps/helper/src/handlers/export/__fixtures__/testbed.ts` 的兩個樣本段落加上 `decision: 'accepted'`（2 行）。export.create 套用段落阻擋後，沿用這份樣本的 `export-service.test.ts` 等測試必須如此才會綠。
