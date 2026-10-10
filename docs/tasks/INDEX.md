# Task 索引

由 `npm run task:index` 從各 Task 的 front matter 產生，不要手改。

| ID | 標題 | status | phase | track | depends_on |
|---|---|---|---|---|---|
| [P0-T001](P0-T001-monorepo-scaffold.md) | monorepo 骨架與 verify 閘門 | done | 0 | infra | — |
| [P0-T002](P0-T002-docs-tooling.md) | 文件閘門腳本：verify:docs、task:index、task:close | done | 0 | infra | P0-T001 |
| [P0-T003](P0-T003-codex-review-fixes.md) | 修正 codex review 對 P0-T001、P0-T002 的發現 | done | 0 | infra | P0-T001、P0-T002 |
| [P1-T001](P1-T001-contracts-core.md) | contracts：核心資料物件與橋接 schema | done | 1 | contracts | P0-T001 |
| [P1-T002](P1-T002-domain-evidence.md) | domain：事實項狀態與 R1 匯出前檢查 | done | 1 | domain | P1-T001 |
| [P1-T003](P1-T003-domain-source-change.md) | domain：R2 來源變更判定 | done | 1 | domain | P1-T001 |
| [P1-T004](P1-T004-domain-budget.md) | domain：R8 輸入預算與拆批 | done | 1 | domain | P1-T001 |
| [P1-T005](P1-T005-domain-work-job.md) | domain：R9 工作單元狀態機 | done | 1 | domain | P1-T001 |
| [P1-T006](P1-T006-storage-core.md) | storage：SQLite schema 與 repository | done | 1 | storage | P1-T001 |
| [P1-T007](P1-T007-storage-export-versions.md) | storage：不可變匯出版本、投遞紀錄與刪除規則 | done | 1 | storage | P1-T006 |
| [P1-T008](P1-T008-sources-authorization.md) | sources：資料夾列舉、授權集合與安全讀檔 | done | 1 | sources | P1-T001 |
| [P1-T009](P1-T009-resume-import-pdf.md) | resume-import：PDF 文字層擷取 | done | 1 | import | P1-T001 |
| [P1-T010](P1-T010-providers-core.md) | providers：適配介面、環境清理與 R6 紀錄 | done | 1 | providers | P1-T001 |
| [P1-T011](P1-T011-spike-claude-cli.md) | 驗證：Claude CLI 隔離與訂閱登入 | done | 1 | providers | P1-T010 |
| [P1-T012](P1-T012-provider-claude.md) | providers：Claude 適配器 | done | 1 | providers | P1-T011 |
| [P1-T013](P1-T013-spike-bridge.md) | 驗證：橋接通訊方式（Q3）與資料夾選取機制 | done | 1 | bridge | P0-T001 |
| [P1-T014](P1-T014-helper-host.md) | helper：橋接端點與操作清單分派 | done | 1 | helper | P1-T013、P1-T006 |
| [P1-T015](P1-T015-extension-skeleton.md) | extension：MV3 骨架與橋接客戶端 | done | 1 | extension | P1-T013、P1-T001 |
| [P1-T016](P1-T016-editor-skeleton.md) | editor：React 骨架與路由 | done | 1 | editor | P1-T015 |
| [P1-T017](P1-T017-spike-104-job.md) | 驗證：104 職缺頁條款與 DOM 樣本 | ready | 1 | extension | P1-T015 |
| [P1-T018](P1-T018-extension-104-extractor.md) | extension：104 職缺頁擷取 | blocked | 1 | extension | P1-T017、P1-T014 |
| [P1-T019](P1-T019-job-snapshot-ui.md) | editor：職缺快照確認與手動貼上 | done | 1 | editor | P1-T016、P1-T014、P1-T041 |
| [P1-T020](P1-T020-resume-import-ui.md) | editor：履歷 PDF 匯入與校正 | done | 1 | editor | P1-T009、P1-T016、P1-T014、P1-T041 |
| [P1-T021](P1-T021-project-import-ui.md) | editor：專案資料夾匯入與預覽 | done | 1 | editor | P1-T008、P1-T016、P1-T014、P1-T041 |
| [P1-T022](P1-T022-pipeline-analysis.md) | pipeline：文件分析成事實項 | done | 1 | pipeline | P1-T002、P1-T003、P1-T004、P1-T005、P1-T012、P1-T008 |
| [P1-T023](P1-T023-claims-review-ui.md) | editor：事實項檢視與確認 | done | 1 | editor | P1-T022、P1-T016 |
| [P1-T024](P1-T024-pipeline-resume-gen.md) | pipeline：職缺匹配與段落生成 | done | 1 | pipeline | P1-T022、P1-T019 |
| [P1-T025](P1-T025-resume-editor-ui.md) | editor：逐段對照、接受與匯出前檢查 | done | 1 | editor | P1-T024、P1-T023 |
| [P1-T026](P1-T026-spike-pdf-export.md) | 驗證：中文 PDF 匯出方式 | done | 1 | pdf | P0-T001 |
| [P1-T027](P1-T027-pdf-export.md) | pdf-export：中文模板與匯出檢查 | done | 1 | pdf | P1-T026、P1-T007 |
| [P1-T028](P1-T028-applications-ui.md) | editor：投遞紀錄 | done | 1 | editor | P1-T027、P1-T041 |
| [P1-T029](P1-T029-message-drafts.md) | 招募訊息回覆草稿（手動貼上） | in_progress | 1 | pipeline | P1-T024、P1-T016 |
| [P1-T030](P1-T030-install-wizard-ui.md) | editor：供應商狀態與設定精靈 | done | 1 | editor | P1-T012、P1-T016、P1-T014、P1-T041 |
| [P1-T031](P1-T031-macos-installer.md) | macOS 安裝包與乾淨環境測試 | blocked | 1 | infra | P1-T030、P1-T018 |
| [P1-T032](P1-T032-phase1-gate.md) | 第一階段驗收閘門 | blocked | 1 | infra | P1-T020、P1-T021、P1-T023、P1-T025、P1-T028、P1-T029、P1-T031 |
| [P1-T033](P1-T033-codex-review-fixes-1.md) | 修正 codex review 對 P1-T001、P1-T005、P1-T006 的發現 | done | 1 | review | P1-T001、P1-T005、P1-T006 |
| [P1-T034](P1-T034-bridge-contract-v2.md) | 橋接 contract 升級：請求 id、錯誤碼、共用常數 | done | 1 | contracts | P1-T014、P1-T015、P1-T016 |
| [P1-T035](P1-T035-review-fixes-domain.md) | codex 補審修正：domain（預算、來源變更、數字檢查） | done | 1 | domain | — |
| [P1-T036](P1-T036-review-fixes-data.md) | codex 補審修正：storage、sources、resume-import | done | 1 | data | — |
| [P1-T037](P1-T037-review-fixes-providers.md) | codex 補審修正：providers 取消終止與 Claude spike 腳本 | done | 1 | providers | — |
| [P1-T038](P1-T038-review-fixes-output.md) | codex 補審修正：pdf-export、104 擷取提示、task:close | done | 1 | output | — |
| [P1-T039](P1-T039-claude-auto-reverify.md) | Claude CLI 版本變更時自動重新驗證 | done | 1 | providers | P1-T012、P1-T037 |
| [P1-T040](P1-T040-helper-export-wiring.md) | helper：匯出接線 | done | 1 | helper | P1-T041、P1-T027、P1-T007 |
| [P1-T041](P1-T041-bridge-editor-ops.md) | 橋接：編輯器頁面所需操作清單 | done | 1 | bridge | P1-T034 |
| [P1-T042](P1-T042-readme.md) | README 與開源說明文件 | done | 1 | readme | — |
| [P1-T043](P1-T043-helper-native-pickers.md) | helper：macOS 原生選取器與服務組裝 | done | 1 | helper | P1-T020、P1-T021、P1-T028、P1-T040 |

## 依賴清單

格式：`ID`：依賴 → 被依賴（完成後可解鎖）。

- P0-T001：— → P0-T002、P0-T003、P1-T001、P1-T013、P1-T026
- P0-T002：P0-T001 → P0-T003
- P0-T003：P0-T001、P0-T002 → —
- P1-T001：P0-T001 → P1-T002、P1-T003、P1-T004、P1-T005、P1-T006、P1-T008、P1-T009、P1-T010、P1-T015、P1-T033
- P1-T002：P1-T001 → P1-T022
- P1-T003：P1-T001 → P1-T022
- P1-T004：P1-T001 → P1-T022
- P1-T005：P1-T001 → P1-T022、P1-T033
- P1-T006：P1-T001 → P1-T007、P1-T014、P1-T033
- P1-T007：P1-T006 → P1-T027、P1-T040
- P1-T008：P1-T001 → P1-T021、P1-T022
- P1-T009：P1-T001 → P1-T020
- P1-T010：P1-T001 → P1-T011
- P1-T011：P1-T010 → P1-T012
- P1-T012：P1-T011 → P1-T022、P1-T030、P1-T039
- P1-T013：P0-T001 → P1-T014、P1-T015
- P1-T014：P1-T013、P1-T006 → P1-T018、P1-T019、P1-T020、P1-T021、P1-T030、P1-T034
- P1-T015：P1-T013、P1-T001 → P1-T016、P1-T017、P1-T034
- P1-T016：P1-T015 → P1-T019、P1-T020、P1-T021、P1-T023、P1-T029、P1-T030、P1-T034
- P1-T017：P1-T015 → P1-T018
- P1-T018：P1-T017、P1-T014 → P1-T031
- P1-T019：P1-T016、P1-T014、P1-T041 → P1-T024
- P1-T020：P1-T009、P1-T016、P1-T014、P1-T041 → P1-T032、P1-T043
- P1-T021：P1-T008、P1-T016、P1-T014、P1-T041 → P1-T032、P1-T043
- P1-T022：P1-T002、P1-T003、P1-T004、P1-T005、P1-T012、P1-T008 → P1-T023、P1-T024
- P1-T023：P1-T022、P1-T016 → P1-T025、P1-T032
- P1-T024：P1-T022、P1-T019 → P1-T025、P1-T029
- P1-T025：P1-T024、P1-T023 → P1-T032
- P1-T026：P0-T001 → P1-T027
- P1-T027：P1-T026、P1-T007 → P1-T028、P1-T040
- P1-T028：P1-T027、P1-T041 → P1-T032、P1-T043
- P1-T029：P1-T024、P1-T016 → P1-T032
- P1-T030：P1-T012、P1-T016、P1-T014、P1-T041 → P1-T031
- P1-T031：P1-T030、P1-T018 → P1-T032
- P1-T032：P1-T020、P1-T021、P1-T023、P1-T025、P1-T028、P1-T029、P1-T031 → —
- P1-T033：P1-T001、P1-T005、P1-T006 → —
- P1-T034：P1-T014、P1-T015、P1-T016 → P1-T041
- P1-T035：— → —
- P1-T036：— → —
- P1-T037：— → P1-T039
- P1-T038：— → —
- P1-T039：P1-T012、P1-T037 → —
- P1-T040：P1-T041、P1-T027、P1-T007 → P1-T043
- P1-T041：P1-T034 → P1-T019、P1-T020、P1-T021、P1-T028、P1-T030、P1-T040
- P1-T042：— → —
- P1-T043：P1-T020、P1-T021、P1-T028、P1-T040 → —
