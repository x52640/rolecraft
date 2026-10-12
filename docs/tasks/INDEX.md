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
| [P1-T017](P1-T017-spike-104-job.md) | 驗證：104 職缺頁條款與 DOM 樣本 | in_progress | 1 | extension | P1-T015 |
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
| [P1-T029](P1-T029-message-drafts.md) | 招募訊息回覆草稿（手動貼上） | done | 1 | pipeline | P1-T024、P1-T016 |
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
| [P1-T044](P1-T044-provider-storage-review-fixes.md) | providers／storage：Claude 版本驗證逾時與取消、清理失敗不中斷、額度狀態 | done | 1 | review | — |
| [P1-T045](P1-T045-bridge-picker-timeout.md) | 橋接：選取器操作的逾時配合原生對話框 | done | 1 | review | — |
| [P1-T046](P1-T046-analysis-review-fixes.md) | pipeline 分析：預算失敗保留來源更新、避免重複分析、跨單元去重、取消後的錯誤 | done | 1 | review | — |
| [P1-T047](P1-T047-grounding-review-fixes.md) | pipeline 事實檢查：句號正規化、網址邊界、職缺名稱比對、訊息草稿的完成度上限 | done | 1 | review | — |
| [P1-T048](P1-T048-helper-review-fixes.md) | helper：訊息意圖不蓋掉並行編輯、刪除失敗可重試、啟動回收原子化 | done | 1 | review | — |
| [P1-T049](P1-T049-editor-review-fixes-a.md) | 編輯器：匯入、職缺、專案、訊息頁的競態與表單修正 | done | 1 | review | — |
| [P1-T050](P1-T050-editor-review-fixes-b.md) | 編輯器：事實項、履歷、投遞紀錄頁的競態與顯示修正 | done | 1 | review | — |
| [P1-T051](P1-T051-editor-import-drop-staged.md) | 編輯器：拿掉匯入頁「暫存校正」按鈕 | done | 1 | editor | — |
| [P1-T052](P1-T052-helper-single-instance-sweep.md) | helper：一個資料區只准一個 helper、孤兒 PDF 刪不掉不擋啟動 | done | 1 | helper | — |
| [P1-T053](P1-T053-reauthorize-restore-claims.md) | 事實項：重新授權且內容未變時恢復原狀態 | done | 1 | domain | — |
| [P1-T054](P1-T054-editor-helper-busy-notice.md) | 編輯器：helper 被另一個瀏覽器占用時顯示提示 | done | 1 | editor | — |
| [P1-T055](P1-T055-providers-stale-refresh.md) | providers：逾時後的過期驗證不再覆寫狀態 | done | 1 | review | — |
| [P1-T056](P1-T056-grounding-url-numeral-fixes.md) | 事實檢查：網址查詢參數方括號、零寬字元點、參字數量詞 | done | 1 | review | — |
| [P1-T057](P1-T057-editor-resume-claim-races.md) | 編輯器：履歷過期載入清空畫面、事實項存檔中繼續編輯被丟掉 | done | 1 | review | — |
| [P1-T058](P1-T058-persist-helper-state.md) | helper：授權資料夾、選定模型、已驗證 Claude 版本存進資料區 | done | 1 | helper | — |
| [P1-T059](P1-T059-dev-install-script.md) | 開發用安裝腳本：註冊 helper、準備資料區與字型 | done | 1 | tooling | — |
| [P1-T060](P1-T060-helper-analysis-flow.md) | helper：分析授權資料夾產生事實項、查詢進度與手動續跑 | done | 1 | helper | P1-T058 |
| [P1-T061](P1-T061-unassigned-claims.md) | 事實項頁列出未歸專案的事實項 | done | 1 | helper | P1-T060 |
| [P1-T062](P1-T062-claude-reverify-recovery.md) | Claude 重新驗證：中斷不算失敗、失敗只綁版本、可手動重新啟用 | done | 1 | providers | P1-T058 |
| [P1-T063](P1-T063-project-grouping.md) | AI 建議專案分組、使用者確認建立，重新分析自動歸入 | done | 1 | helper | P1-T061 |
| [P1-T064](P1-T064-application-intro.md) | 針對職缺產生 300 字內投遞自介 | done | 1 | helper | P1-T060、P1-T062 |
| [P1-T065](P1-T065-multipage-disorder-check.md) | 104 履歷 PDF 匯入：多頁誤判讀取順序、部首相似字 | done | 1 | resume-import | P1-T009 |
| [P1-T066](P1-T066-resume-import-104-layout.md) | 104 履歷 PDF 版面辨識 | done | 1 | resume-import | P1-T065 |
| [P1-T067](P1-T067-import-page-layout.md) | 匯入頁版面重整 | done | 1 | editor | P1-T020 |
| [P1-T068](P1-T068-dev-web-harness.md) | 開發用網頁測試入口（協調者自測用） | done | 1 | dev-tooling | P1-T059 |
| [P1-T069](P1-T069-resume-import-ai-parse.md) | 履歷 PDF 用 AI 整理欄位 | done | 1 | resume-import | P1-T066、P1-T064 |
| [P1-T070](P1-T070-claude-state-after-restart.md) | helper 重開後 Claude 狀態歸零 | done | 1 | providers | P1-T062 |
| [P1-T071](P1-T071-intro-failed-draft-visible.md) | 自介沒通過檢查時看不到草稿 | done | 1 | pipeline | P1-T064 |
| [P1-T072](P1-T072-resume-experience-tailoring.md) | 客製履歷沒有改寫工作經歷 | done | 1 | pipeline | P1-T025 |
| [P1-T073](P1-T073-claims-page-usability.md) | 事實項頁實用性 | done | 1 | editor | P1-T063 |
| [P1-T074](P1-T074-web-import-contracts.md) | contracts：網頁履歷匯入、照片、個人資料讀取的橋接契約 | done | 1 | contracts | P1-T041、P1-T069 |
| [P1-T075](P1-T075-extension-resume-blocks.md) | extension：履歷頁區塊抽取與擷取共用流程 | in_progress | 1 | extension | P1-T074 |
| [P1-T076](P1-T076-extension-resume-trigger.md) | extension：點圖示／快捷鍵依頁型觸發與發送者驗證 | in_progress | 1 | extension | P1-T074 |
| [P1-T077](P1-T077-extension-104-resume-page.md) | extension：104 履歷頁登記與 fixture 比對 | blocked | 1 | extension | P1-T017、P1-T075、P1-T076 |
| [P1-T078](P1-T078-pipeline-web-resume-parse.md) | pipeline：網頁區塊來源的去個資、提示與照抄檢查 | ready | 1 | pipeline | P1-T074 |
| [P1-T079](P1-T079-helper-import-session-web.md) | helper：網頁擷取與手動輸入的匯入工作階段、確認更新唯一 Profile、profile.get | in_progress | 1 | helper | P1-T074 |
| [P1-T080](P1-T080-helper-web-ai-parse.md) | helper：網頁來源的 AI 整理接線 | blocked | 1 | helper | P1-T078、P1-T079 |
| [P1-T081](P1-T081-editor-web-import-page.md) | editor：匯入頁接網頁擷取與手動輸入 | in_progress | 1 | editor | P1-T074 |
| [P1-T082](P1-T082-storage-photo-material.md) | storage：照片保存與照片素材的 D19 刪除 | in_progress | 1 | storage | P1-T074 |
| [P1-T083](P1-T083-helper-photo-ops.md) | helper：照片選取與處理、photo.* 操作 | blocked | 1 | helper | P1-T082、P1-T079 |
| [P1-T084](P1-T084-export-photo.md) | 匯出 PDF 加照片 | blocked | 1 | pdf-export | P1-T082 |
| [P1-T085](P1-T085-editor-profile-copy-photo.md) | editor：履歷頁的個人資料複製與照片管理 | in_progress | 1 | editor | P1-T074 |
| [P1-T086](P1-T086-editor-section-copy.md) | editor：客製履歷段落「複製」按鈕 | done | 1 | editor | P1-T025、P1-T064 |
| [P1-T087](P1-T087-editor-hide-pdf-import.md) | editor：拿掉 PDF 匯入入口（Q10） | blocked | 1 | editor | P1-T077、P1-T080、P1-T081 |

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
- P1-T009：P1-T001 → P1-T020、P1-T065
- P1-T010：P1-T001 → P1-T011
- P1-T011：P1-T010 → P1-T012
- P1-T012：P1-T011 → P1-T022、P1-T030、P1-T039
- P1-T013：P0-T001 → P1-T014、P1-T015
- P1-T014：P1-T013、P1-T006 → P1-T018、P1-T019、P1-T020、P1-T021、P1-T030、P1-T034
- P1-T015：P1-T013、P1-T001 → P1-T016、P1-T017、P1-T034
- P1-T016：P1-T015 → P1-T019、P1-T020、P1-T021、P1-T023、P1-T029、P1-T030、P1-T034
- P1-T017：P1-T015 → P1-T018、P1-T077
- P1-T018：P1-T017、P1-T014 → P1-T031
- P1-T019：P1-T016、P1-T014、P1-T041 → P1-T024
- P1-T020：P1-T009、P1-T016、P1-T014、P1-T041 → P1-T032、P1-T043、P1-T067
- P1-T021：P1-T008、P1-T016、P1-T014、P1-T041 → P1-T032、P1-T043
- P1-T022：P1-T002、P1-T003、P1-T004、P1-T005、P1-T012、P1-T008 → P1-T023、P1-T024
- P1-T023：P1-T022、P1-T016 → P1-T025、P1-T032
- P1-T024：P1-T022、P1-T019 → P1-T025、P1-T029
- P1-T025：P1-T024、P1-T023 → P1-T032、P1-T072、P1-T086
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
- P1-T041：P1-T034 → P1-T019、P1-T020、P1-T021、P1-T028、P1-T030、P1-T040、P1-T074
- P1-T042：— → —
- P1-T043：P1-T020、P1-T021、P1-T028、P1-T040 → —
- P1-T044：— → —
- P1-T045：— → —
- P1-T046：— → —
- P1-T047：— → —
- P1-T048：— → —
- P1-T049：— → —
- P1-T050：— → —
- P1-T051：— → —
- P1-T052：— → —
- P1-T053：— → —
- P1-T054：— → —
- P1-T055：— → —
- P1-T056：— → —
- P1-T057：— → —
- P1-T058：— → P1-T060、P1-T062
- P1-T059：— → P1-T068
- P1-T060：P1-T058 → P1-T061、P1-T064
- P1-T061：P1-T060 → P1-T063
- P1-T062：P1-T058 → P1-T064、P1-T070
- P1-T063：P1-T061 → P1-T073
- P1-T064：P1-T060、P1-T062 → P1-T069、P1-T071、P1-T086
- P1-T065：P1-T009 → P1-T066
- P1-T066：P1-T065 → P1-T069
- P1-T067：P1-T020 → —
- P1-T068：P1-T059 → —
- P1-T069：P1-T066、P1-T064 → P1-T074
- P1-T070：P1-T062 → —
- P1-T071：P1-T064 → —
- P1-T072：P1-T025 → —
- P1-T073：P1-T063 → —
- P1-T074：P1-T041、P1-T069 → P1-T075、P1-T076、P1-T078、P1-T079、P1-T081、P1-T082、P1-T085
- P1-T075：P1-T074 → P1-T077
- P1-T076：P1-T074 → P1-T077
- P1-T077：P1-T017、P1-T075、P1-T076 → P1-T087
- P1-T078：P1-T074 → P1-T080
- P1-T079：P1-T074 → P1-T080、P1-T083
- P1-T080：P1-T078、P1-T079 → P1-T087
- P1-T081：P1-T074 → P1-T087
- P1-T082：P1-T074 → P1-T083、P1-T084
- P1-T083：P1-T082、P1-T079 → —
- P1-T084：P1-T082 → —
- P1-T085：P1-T074 → —
- P1-T086：P1-T025、P1-T064 → —
- P1-T087：P1-T077、P1-T080、P1-T081 → —
