# Task 索引

由 `npm run task:index` 從各 Task 的 front matter 產生，不要手改。

| ID | 標題 | status | phase | track | depends_on |
|---|---|---|---|---|---|
| [P0-T001](P0-T001-monorepo-scaffold.md) | monorepo 骨架與 verify 閘門 | done | 0 | infra | — |
| [P0-T002](P0-T002-docs-tooling.md) | 文件閘門腳本：verify:docs、task:index、task:close | done | 0 | infra | P0-T001 |
| [P0-T003](P0-T003-codex-review-fixes.md) | 修正 codex review 對 P0-T001、P0-T002 的發現 | done | 0 | infra | P0-T001、P0-T002 |
| [P1-T001](P1-T001-contracts-core.md) | contracts：核心資料物件與橋接 schema | done | 1 | contracts | P0-T001 |
| [P1-T002](P1-T002-domain-evidence.md) | domain：事實項狀態與 R1 匯出前檢查 | in_progress | 1 | domain | P1-T001 |
| [P1-T003](P1-T003-domain-source-change.md) | domain：R2 來源變更判定 | in_progress | 1 | domain | P1-T001 |
| [P1-T004](P1-T004-domain-budget.md) | domain：R8 輸入預算與拆批 | done | 1 | domain | P1-T001 |
| [P1-T005](P1-T005-domain-work-job.md) | domain：R9 工作單元狀態機 | done | 1 | domain | P1-T001 |
| [P1-T006](P1-T006-storage-core.md) | storage：SQLite schema 與 repository | done | 1 | storage | P1-T001 |
| [P1-T007](P1-T007-storage-export-versions.md) | storage：不可變匯出版本、投遞紀錄與刪除規則 | in_progress | 1 | storage | P1-T006 |
| [P1-T008](P1-T008-sources-authorization.md) | sources：資料夾列舉、授權集合與安全讀檔 | in_progress | 1 | sources | P1-T001 |
| [P1-T009](P1-T009-resume-import-pdf.md) | resume-import：PDF 文字層擷取 | done | 1 | import | P1-T001 |
| [P1-T010](P1-T010-providers-core.md) | providers：適配介面、環境清理與 R6 紀錄 | in_progress | 1 | providers | P1-T001 |
| [P1-T011](P1-T011-spike-claude-cli.md) | 驗證：Claude CLI 隔離與訂閱登入 | blocked | 1 | providers | P1-T010 |
| [P1-T012](P1-T012-provider-claude.md) | providers：Claude 適配器 | blocked | 1 | providers | P1-T011 |
| [P1-T013](P1-T013-spike-bridge.md) | 驗證：橋接通訊方式（Q3）與資料夾選取機制 | done | 1 | bridge | P0-T001 |
| [P1-T014](P1-T014-helper-host.md) | helper：橋接端點與操作清單分派 | in_progress | 1 | helper | P1-T013、P1-T006 |
| [P1-T015](P1-T015-extension-skeleton.md) | extension：MV3 骨架與橋接客戶端 | done | 1 | extension | P1-T013、P1-T001 |
| [P1-T016](P1-T016-editor-skeleton.md) | editor：React 骨架與路由 | in_progress | 1 | editor | P1-T015 |
| [P1-T017](P1-T017-spike-104-job.md) | 驗證：104 職缺頁條款與 DOM 樣本 | blocked | 1 | extension | P1-T015 |
| [P1-T018](P1-T018-extension-104-extractor.md) | extension：104 職缺頁擷取 | blocked | 1 | extension | P1-T017、P1-T014 |
| [P1-T019](P1-T019-job-snapshot-ui.md) | editor：職缺快照確認與手動貼上 | blocked | 1 | editor | P1-T016、P1-T014 |
| [P1-T020](P1-T020-resume-import-ui.md) | editor：履歷 PDF 匯入與校正 | blocked | 1 | editor | P1-T009、P1-T016、P1-T014 |
| [P1-T021](P1-T021-project-import-ui.md) | editor：專案資料夾匯入與預覽 | blocked | 1 | editor | P1-T008、P1-T016、P1-T014 |
| [P1-T022](P1-T022-pipeline-analysis.md) | pipeline：文件分析成事實項 | blocked | 1 | pipeline | P1-T002、P1-T003、P1-T004、P1-T005、P1-T012、P1-T008 |
| [P1-T023](P1-T023-claims-review-ui.md) | editor：事實項檢視與確認 | blocked | 1 | editor | P1-T022、P1-T016 |
| [P1-T024](P1-T024-pipeline-resume-gen.md) | pipeline：職缺匹配與段落生成 | blocked | 1 | pipeline | P1-T022、P1-T019 |
| [P1-T025](P1-T025-resume-editor-ui.md) | editor：逐段對照、接受與匯出前檢查 | blocked | 1 | editor | P1-T024、P1-T023 |
| [P1-T026](P1-T026-spike-pdf-export.md) | 驗證：中文 PDF 匯出方式 | done | 1 | pdf | P0-T001 |
| [P1-T027](P1-T027-pdf-export.md) | pdf-export：中文模板與匯出檢查 | blocked | 1 | pdf | P1-T026、P1-T007 |
| [P1-T028](P1-T028-applications-ui.md) | editor：投遞紀錄 | blocked | 1 | editor | P1-T027 |
| [P1-T029](P1-T029-message-drafts.md) | 招募訊息回覆草稿（手動貼上） | blocked | 1 | pipeline | P1-T024、P1-T016 |
| [P1-T030](P1-T030-install-wizard-ui.md) | editor：供應商狀態與設定精靈 | blocked | 1 | editor | P1-T012、P1-T016、P1-T014 |
| [P1-T031](P1-T031-macos-installer.md) | macOS 安裝包與乾淨環境測試 | blocked | 1 | infra | P1-T030、P1-T018 |
| [P1-T032](P1-T032-phase1-gate.md) | 第一階段驗收閘門 | blocked | 1 | infra | P1-T020、P1-T021、P1-T023、P1-T025、P1-T028、P1-T029、P1-T031 |

## 依賴清單

格式：`ID`：依賴 → 被依賴（完成後可解鎖）。

- P0-T001：— → P0-T002、P0-T003、P1-T001、P1-T013、P1-T026
- P0-T002：P0-T001 → P0-T003
- P0-T003：P0-T001、P0-T002 → —
- P1-T001：P0-T001 → P1-T002、P1-T003、P1-T004、P1-T005、P1-T006、P1-T008、P1-T009、P1-T010、P1-T015
- P1-T002：P1-T001 → P1-T022
- P1-T003：P1-T001 → P1-T022
- P1-T004：P1-T001 → P1-T022
- P1-T005：P1-T001 → P1-T022
- P1-T006：P1-T001 → P1-T007、P1-T014
- P1-T007：P1-T006 → P1-T027
- P1-T008：P1-T001 → P1-T021、P1-T022
- P1-T009：P1-T001 → P1-T020
- P1-T010：P1-T001 → P1-T011
- P1-T011：P1-T010 → P1-T012
- P1-T012：P1-T011 → P1-T022、P1-T030
- P1-T013：P0-T001 → P1-T014、P1-T015
- P1-T014：P1-T013、P1-T006 → P1-T018、P1-T019、P1-T020、P1-T021、P1-T030
- P1-T015：P1-T013、P1-T001 → P1-T016、P1-T017
- P1-T016：P1-T015 → P1-T019、P1-T020、P1-T021、P1-T023、P1-T029、P1-T030
- P1-T017：P1-T015 → P1-T018
- P1-T018：P1-T017、P1-T014 → P1-T031
- P1-T019：P1-T016、P1-T014 → P1-T024
- P1-T020：P1-T009、P1-T016、P1-T014 → P1-T032
- P1-T021：P1-T008、P1-T016、P1-T014 → P1-T032
- P1-T022：P1-T002、P1-T003、P1-T004、P1-T005、P1-T012、P1-T008 → P1-T023、P1-T024
- P1-T023：P1-T022、P1-T016 → P1-T025、P1-T032
- P1-T024：P1-T022、P1-T019 → P1-T025、P1-T029
- P1-T025：P1-T024、P1-T023 → P1-T032
- P1-T026：P0-T001 → P1-T027
- P1-T027：P1-T026、P1-T007 → P1-T028
- P1-T028：P1-T027 → P1-T032
- P1-T029：P1-T024、P1-T016 → P1-T032
- P1-T030：P1-T012、P1-T016、P1-T014 → P1-T031
- P1-T031：P1-T030、P1-T018 → P1-T032
- P1-T032：P1-T020、P1-T021、P1-T023、P1-T025、P1-T028、P1-T029、P1-T031 → —
