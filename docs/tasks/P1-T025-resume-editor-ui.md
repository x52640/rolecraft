---
id: P1-T025
phase: 1
status: in_progress
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

- 最後完成：helper `handlers/resume/` 全部 9 個操作與服務、contracts resume.* 擴充、editor 履歷頁、測試
- 已通過驗證：worktree `npm run verify` 綠（Vitest 2347 通過、11 略過；test:docs 15）
- 下一步：協調者收官（高風險 R1，依 E3 跑對抗驗證）；`docs/specs/bridge.md` resume.* 語意補述與 generate 模型接線見完成結果
- Blocker：無

## 完成結果

- 結構：helper `apps/helper/src/handlers/resume/`：`service.ts`（介面，方法皆選填，同 ExportService）、`storage-service.ts`（`createResumeService({ db, now?, generation? })`）、`section-rules.ts`（編輯規則，純函式）、`readiness.ts`（匯出前檢查與原文對照）、`generation.ts`（resume.generate 服務）、`claude-engine.ts`（Claude 執行）、`failure.ts`（固定錯誤訊息）、九個 handler。editor `apps/editor/src/pages/resumes/`：`ResumesPage.tsx`、`SectionCard.tsx`、`SectionEditor.tsx`、`useResumeEditor.ts`、`labels.ts`、`resumes.css`。`main.ts` 只加一個 import 與一行（有儲存才接 resume，不接模型執行）。
- contracts（resume.* 擴充，請求 ID 仍是 OpaqueId）：`resume.get` 回應加 `originals`（經歷段落對到的 Profile 經歷描述，供原文對照）；`resume.edit_section` 請求加選填 `completionDowngradeAcknowledged: true`；`resume.check_export` 回應加 `blockers`（`pending`／`rejected`／`placement_missing`／`experience_not_found`），`ready`＝R1 通過且沒有 blocker。
- 接受與退回（F07、R1）：接受只把 decision 改成 accepted，不碰事實項、不碰逐段確認（測試鎖住事實項完全不變）；退回改 rejected。未接受或已退回的非空白段落列為 blocker，不能匯出。
- 編輯（R1 第 2 輪補）：用 domain `checkSectionEdit`，只移除引用、改生成引用紀錄一律拒絕且不寫入；新增引用必須指向存在的事實項、不可重複。任何內容變動都清掉逐段確認、decision 回到 pending（要重新接受）。
- 完成程度調低（P1-T002 對抗驗證交辦）：既有引用的宣稱完成程度變低（已完成→進行中、拿掉標示也算）時，請求沒帶 `completionDowngradeAcknowledged: true` 就拒絕；畫面列出被調低的事實項、要求重看並勾選「我已重看本段措辭」才能儲存。helper 與畫面兩邊都擋。
- 逐段確認：文字必須等於該段目前全文；該段有檢查 2、事實項不可用或引用完整性問題（domain 標為不可逐段確認）時直接拒絕、不寫入；時間只由 helper 的 `now()` 決定。
- 匯出前檢查與處理入口：domain `checkExportReadiness`（事實項取目前狀態，Profile 用唯一且已確認的那份，與 export.create 同條件）＋ blockers。畫面逐段顯示問題，入口：改寫、刪除整段（按兩次）、到事實項頁確認（檢查 2、事實項不可用時出現）、逐段確認（只在該段所有問題都可逐段確認時出現）。
- resume.generate：只用已確認的快照（`planGeneration`），先在 helper 跑一次 `prepareGeneration`（快照、Profile、可用事實項、預算），不成立直接回原因、不建工作、不啟動程式；成立才建 WorkJob、回工作 id，背景經 P1-T024 `createGenerationRunner` 執行。`commitUnit` 在同一交易寫入履歷版本與工作狀態；pipeline `placements` 對應成 contracts `ResumeSection.placement`（經歷用公司＋職稱＋起始日期），對應不到的段落不帶 placement（匯出前檢查擋）；decision 一律 pending、保留 rationale；R6 紀錄經 `runCheckRecords.append` 保存。同一職缺同時只跑一個。Claude 執行經 `ClaudeService.run`，deps 一律經 `helperClaudeDeps`（靜態檢查通過）。
- 測試：helper `resume.test.ts`（dispatch→handler→真實 SQLite，18 項）、`generate.test.ts`（假 spawn 跑 Claude 真實檢查路徑，5 項：完整流程與 placement 對應、API key 不進子程序、待複核事實項不送出、未確認快照／沒選模型／沒可用事實項不啟動程式、不合格輸出有上限重試後暫停且不寫入、同職缺不重複）；editor `ResumesPage.test.ts`（8 項）。
- 手動驗證：無（真實 Claude 執行需擁有者）。
- 保守選擇：(1) 生成段落要逐段接受才可匯出，退回的段落要改寫後接受或刪除；(2) 任何編輯讓段落回到待接受；(3) 新增引用時功能／交付物預設寫成「規劃中」；(4) 逐段確認遇到不可逐段確認的問題直接拒絕，而不是記錄後讓檢查照樣擋；(5) `main.ts` 不接模型執行，`resume.generate` 實際執行時回 not_implemented（見下）；(6) 工作狀態查詢與續跑沒有橋接操作，本 Task 不做，畫面以「重新整理」讀新版本。
- 需擁有者裁定／需範圍外調整：(a) `resume.generate` 接上真實執行需要 providers 服務公開「目前選定且可用的模型」（目前只在 providers-service 內部、只回候選 ID 與顯示名稱），並與 providers 檢查共用同一個 `ClaudeService`（版本閘門互斥），以及模型的輸入預算來源（providers 沒有上下文上限常數）；這些都在 write_paths 外，`createClaudeGenerationEngine({ service, selectModel, budget })` 已備好；(b) `export.create`（P1-T040）只看 R1，不看 decision，所以未接受／已退回段落目前只靠 `resume.check_export` 與畫面擋，export.create 本身仍會印出；建議 export 也套用 blockers；(c) `docs/specs/bridge.md` 的 resume.* 列需補述 originals、completionDowngradeAcknowledged、blockers 語意（範圍外）；(d) 沒有「新增段落」操作，所以 user_written 段落無法從畫面產生；(e) 匹配與待補資訊沒有持久化位置，生成結果只存段落；(f) 生成被 R6 擋下或 other 錯誤時工作留在 running（沒有對應的暫停原因，見 P1-T022 待裁定 3），重開 helper 後才還原為已暫停。
