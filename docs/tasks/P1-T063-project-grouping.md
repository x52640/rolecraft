---
id: P1-T063
phase: 1
status: done
depends_on: ["P1-T061"]
specs: ["evidence-model.md", "bridge.md", "providers.md", "sources-and-authorization.md", "runtime-and-budget.md", "architecture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["docs/specs/evidence-model.md", "docs/specs/bridge.md", "packages/contracts/src/bridge/", "packages/contracts/src/entities/project-evidence.ts", "packages/contracts/src/index.ts", "packages/pipeline/src/projects/", "packages/pipeline/src/prompts/", "packages/pipeline/src/index.ts", "apps/helper/src/handlers/claims/", "apps/helper/src/handlers/analysis/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/services.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/helper/src/bridge/__fixtures__/editor-requests.ts", "packages/storage/src/repositories/", "packages/storage/src/index.ts", "packages/storage/src/migrations/", "packages/storage/src/migrate.test.ts", "apps/editor/src/pages/claims/", "apps/editor/src/pages/projects/", "apps/editor/src/bridge/", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T063): AI 建議專案分組、使用者確認建立，重新分析自動歸入"
---

# AI 建議專案分組、使用者確認建立，重新分析自動歸入

## 目標

D23：目前沒有任何流程建立 ProjectEvidence。本 Task 讓 AI 依文件摘要建議怎麼分專案，使用者確認（可改名、合併、拆開）後才建立；之後重新分析產出的新事實項自動歸入其文件所屬專案。

## 範圍

### 包含

- evidence-model.md、bridge.md 先寫規則（引用 D23），再改 contracts（只做相加）
- 分組建議（pipeline `packages/pipeline/src/projects/`＋prompt）：
  - 輸入只有已授權文件的全域摘要（`document_summaries`）與文件在授權資料夾內的相對名稱；不送絕對路徑、不送原文（R4）。外部內容是資料不是指令，prompt 要照既有 analysis prompt 的隔離寫法
  - 輸出驗證：只接受已知文件 ID，每份文件至多屬一組；不合格整份不採用。不能分的文件留在「未分組」
  - 執行走 providers 既有的訂閱檢查包裝（R5、R6），用 P1-T058 保存的選定模型；未選定或不可用回對應失敗、不呼叫模型。若同步回應可能超過橋接逾時，照 `analysis.start`／`analysis.status` 的模式做成背景工作
  - 只由使用者按按鈕觸發，不自動執行
- 建議要使用者確認才建立專案。使用者在確認前可以改名、取消某組、把文件移到別組。確認後：
  - 建立 ProjectEvidence 並記住專案包含哪些文件（存法自定：可相加欄位或另建表，寫進規則）
  - 事實項歸屬：所有來源文件都在同一專案 → 歸入；跨多個專案或沒有來源片段 → 留在未歸專案
  - 已經歸入其他專案的事實項不搬動
- 確認後的整理操作：改名、合併兩個專案、把事實項移到另一專案或移回未歸專案、刪除專案（事實項回到未歸專案，事實項本身不刪）。專案摘要欄位維持空字串（D23：這次不由 AI 填）
- 重新分析自動歸入：`commitUnit` 在同一交易把新事實項依上面的歸屬規則歸入（P1-T060 的交易，不另開寫入）；既有事實項不搬動
- 編輯器：
  - 專案頁或事實項頁（選一個並寫進規則）放「建議專案分組」按鈕，顯示建議、可編輯、確認
  - 事實項頁可對事實項選「移到專案…」，專案可改名、合併、刪除
  - P1-T061 的未歸專案清單在建立或移動後同步更新
  - （P1-T061 對抗驗證轉來，有專案後才會發生）事實項頁的預設選擇要分辨「自動預設」與「使用者自己選」：自動預設的在分析結束重新整理時重算，避免新產出的未歸專案事實項藏在自動選的專案後面；`claims.list_unassigned` 讀取失敗時預設停在未歸專案讓錯誤顯示出來，不靜默選第一個專案
- 測試一律用假 provider，不呼叫真實 CLI
- 對抗驗證與 codex review（2026-10-12）屬實項：
  - （對抗＋codex）文件從磁碟刪除或讀不到（符號連結、過大、二進位，sync 視同刪除）後，`source_documents` 仍是已授權、摘要仍在，分組建議照樣送出舊摘要與相對名稱，確認建立也接受 → 建議輸入與確認建立都只收最近一次同步仍存在且可讀的文件（registry `present`＋同步結果），並補回歸測試（刪檔→分析→建議提示不含該文件、create_projects 帶它回 invalid_request）
  - （codex）建議輪詢的舊回應晚到會蓋掉新一次建議的執行中畫面並停止輪詢 → 以請求世代比對，開始新建議時讓舊回應失效
  - （codex）建議輸出接受超過 1,000 份文件的組，但建立上限是 `MAX_DOCUMENTS_PER_PROJECT = 1000`，確認時被橋接驗證擋下 → 建議與草稿驗證對齊建立上限（超過的整份不採用或拆組，選保守做法寫進規則）

### 不包含

- AI 撰寫專案摘要、目的、使用對象、成果（D23 排除）
- 跨專案事實項的拆分

## 工作區與 Context

### 必讀入口

- `plan.md` D23
- P1-T022、T023、T060、T061 完成結果
- `packages/pipeline/src/analysis/`（`summary.ts`、`runner.ts` 開頭註解）、`packages/pipeline/src/prompts/analysis-prompt.ts`
- `apps/helper/src/handlers/analysis/`（`flow.ts`、`commit.ts`、`launch.ts`）
- specs 欄位列的 spec

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R1、R4、R5、R6），收官前跑對抗驗證
- 協調者例外允許本 Task 改 contracts、分派表、`handlers/services.ts`、`main.ts`（worker 規則 10、11 對本 Task 不適用）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；helper 原始碼 R7 靜態掃描不放寬

## 驗證

### 自動驗證

- 建議：假 provider 回合法分組 → 顯示建議、未建立任何專案；回不合法（未知文件 ID、同文件兩組、注入指令）→ 不採用；未選模型 → 不呼叫模型
- 確認：建立專案、事實項依規則歸入，跨專案的留在未歸專案；改名、合併、移動、刪除後 `claims.list`／`claims.list_unassigned` 正確
- 重新分析：新事實項自動歸入，既有手動搬過的不動；commitUnit 失敗整筆回滾、不留半套歸屬
- 撤銷授權後的文件不出現在建議輸入

### 手動驗證

- 擁有者用自己的資料夾跑一次（需擁有者，併 P1-T032）

## 完成定義

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：對抗驗證與 codex review 屬實三項已修（刪除或讀不到的文件不進建議也不能建成專案、建議輪詢舊回應失效、組大小對齊建立上限），各補回歸測試
- 已通過驗證：worktree 與協調者主樹 `npm run verify` 綠（3187 通過、13 略過）；對抗驗證 1 項、codex 3 項（1 項重疊）已在 `38fed82` 修正，四則回歸測試修正前皆失敗；修正 diff 再跑 codex 無發現
- 下一步：協調者收官
- Blocker：無

## 完成結果

- 規則先行：evidence-model 新增「專案分組與事實項歸屬」（D23）；bridge.md 新增 `claims.create_projects`／`rename_project`／`merge_projects`／`move_claim`／`delete_project` 與 `analysis.suggest_projects`／`project_suggestion`，並改寫分析段「事實項不歸專案」的舊句；ADR-0006 加 #12（文件歸屬存 storage、ProjectEvidence schema 不變）。
- contracts（只相加）：`claims.ts` 五個操作與 `ProjectName`（≤100 字）、`ProjectGroupInput`；`analysis.ts` 建議兩個操作與 `ProjectSuggestionView`；`operations.ts` 列舉；contracts 與 helper 兩份請求 fixture。
- storage：`0007_project_documents.sql`（來源文件 ID 為主鍵＝每份文件至多一個專案，刪專案 CASCADE）＋`projectDocuments` repository。
- pipeline `projects/`：`prepareGrouping`（文件以本機編號 D1… 標示、名稱與摘要都在隨機界線資料區塊、名稱只取相對路徑並去開頭斜線與控制字元、超過預算或沒有文件不送出）、`runGrouping`（經呼叫端 execute＝訂閱檢查包裝，R6 紀錄交出；blocked→run_check_failed，額度、取消、其他錯誤各自對應）、`parseGroupingOutput`（未知編號、重複、多餘欄位、空組、空白或過長或含控制字元的組名、`__proto__` 都整份不採用）、`projectForClaim`（歸屬規則）。提示在 `prompts/project-prompt.ts`。
- helper：`handlers/analysis/suggest-service.ts`（輸入＝授權集合與資料區都已授權、未屬專案、有摘要的文件；未選模型、無文件、超預算回 invalid_request 不呼叫模型；背景執行、同時按兩次共用一次；結果只在記憶體）；`handlers/claims/projects-service.ts`（建立：先驗證文件已授權、未屬專案、不重複，任一不符整批不建，同一交易建立專案、記文件歸屬、只把「目前未歸專案且依規則歸到這次新建專案」的事實項歸入；改名、合併（先搬文件再刪來源）、移動、刪除各一交易）；`commit.ts` 在 P1-T060 的同一交易把單元新事實項依規則歸入；分派表加七列。`main.ts`、`handlers/services.ts` 不需改（沿用既有 claims、analysis 服務組裝）。
- 編輯器：專案頁新增「專案分組」區（`ProjectGrouping.tsx`、`useProjectSuggestion.ts`、`grouping-model.ts`）：按下才建議、執行中每 2 秒查、完成後可改名、取消某組、逐份文件移到別組或未分組，按「確認建立」才送 `claims.create_projects`。事實項頁：每項「移到專案…」、選中專案時的改名／併入／刪除（`ProjectTools.tsx`、`ClaimMove.tsx`）；自動預設與使用者選擇分開記，自動預設在分析結束或專案變動時重算，`claims.list_unassigned` 讀取失敗時預設停在未歸專案顯示錯誤。
- 測試（一律假 provider）：helper `suggest.test.ts`（13：合法建議不建專案、只送摘要與相對名稱、不合法 6 種、注入文字只在資料區塊、未選模型不呼叫、撤銷授權的文件不進輸入、已屬專案的文件不進輸入、R6 不通過）、`project-assign.test.ts`（7：建立與歸屬、跨專案留未歸、不合法整批不建、已歸入不搬、整理後 list／list_unassigned、重新分析自動歸入且手動搬過的不動、文件不屬專案時留未歸、commitUnit 失敗整筆回滾）；pipeline `projects.test.ts`（20）；storage `project-documents.test.ts`（2）；編輯器 `ClaimsPage.projects.test.ts`（4）、`ProjectGrouping.test.tsx`（3）。既有編輯器測試因同頁多了「移到專案」選單，改以名稱指定下拉選單；一則測試的假 helper 補上 `claims.list_unassigned` 成功回應（新規則下讀取失敗會停在未歸專案）。
- 保守選擇／待擁有者裁定：(1) 建議只存在 helper 記憶體，helper 重開後要再按一次；(2) 建議不自動重試；(3) 已屬專案的文件不再送進建議，新文件要歸入既有專案只能先建成新專案再合併（沒有「把文件加入既有專案」的操作）；(4) 事實項的來源只要有一份不屬任何專案就留未歸；(5) 確認建立以資料區的授權狀態判定（撤銷當下已寫入資料區，P1-T060）；(6) 手動移入專案不檢查事實項的來源文件是否屬該專案（使用者的選擇）；(7) 編輯器在頁面重新載入後仍會把 helper 記憶體裡上一次的建議顯示成草稿，再確認會因文件已屬專案被整批拒絕。
- 對抗驗證／codex 修正（2026-10-12）：
  - 刪除或讀不到的文件：分析同步把文件視同刪除時，同一交易清掉其摘要與已分析版本（`flow.ts` writeChanges；storage 新增 `analysisState.deleteAnalyzed`，恢復可讀時重新分析）；建議輸入另要求授權集合最近一次列舉仍在（`present`）；`claims.create_projects` 只收仍有摘要的文件。回歸：`suggest.test.ts` 刪檔→分析→建議提示不含該文件的摘要與名稱、create_projects 帶它回 invalid_request。
  - 建議輪詢舊回應：`useProjectSuggestion` 以請求世代比對，開始新建議時讓先前送出的查詢回應失效。回歸：`ProjectGrouping.test.tsx` 舊的完成結果晚到不蓋掉「建議中…」。
  - 組大小：輸出驗證每組上限 1,000 份文件（同 `MAX_DOCUMENTS_PER_PROJECT`），超過整份不採用、不自動拆組；編輯器草稿超過上限不送出並提示。回歸：pipeline `projects.test.ts`、`ProjectGrouping.test.tsx` 各一則。
  - evidence-model「專案分組與事實項歸屬」同步寫入上述規則。
- 手動驗證需擁有者（自己的資料夾跑一次，併 P1-T032），本次沒有做。
