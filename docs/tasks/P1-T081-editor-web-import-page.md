---
id: P1-T081
phase: 1
status: in_progress
depends_on: ["P1-T074"]
specs: ["resume-import.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/"]
contract_change: none
expected_commit: "feat(P1-T081): editor：匯入頁顯示網頁擷取、區塊預覽、按鈕 AI 整理、姓名確認與手動輸入"
---

# editor：匯入頁接網頁擷取與手動輸入

## 目標

匯入頁顯示最近一次網頁擷取，使用者按「使用這份」核對區塊、按「用 AI 整理」才送模型；一律提供「手動輸入」；確認前明示會取代目前的個人資料。可先對假橋接開發。

## 範圍

### 包含

- `import.latest_capture`：顯示平台、擷取時間、是否截斷與「使用這份」；擷取送達不改變正在核對的內容
- 預覽依來源顯示「第 N 頁第 M 行」或「區塊 bN」；截斷時持續顯示「內容不完整」
- 網頁來源一律按鈕：`useAiParse` 的自動開始對網頁來源關閉；開啟、切換工作階段、查詢都不送 `import.ai_parse`；PDF 維持現行（104 按鈕、其他自動）
- 姓名確認：helper 回「需確認姓名」時顯示輸入（預填既有 Profile 姓名、可修改、可加多個寫法），確認後才送
- 草稿欄位有「還原出姓名或聯絡資料」旗標時在該欄標示「含姓名或聯絡資料」
- AI 失敗或不可用時顯示擷取到的區塊供手動輸入
- 「手動輸入」入口一律顯示（`import.start_manual`）
- 確認列明示「會取代目前的個人資料」；helper 回多份 Profile 時顯示原因

### 不包含

- 拿掉 PDF 入口（P1-T087）
- helper 與 pipeline 行為

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入工作階段」「網頁來源的 AI 整理」
- P1-T074 完成結果；P1-T069 完成結果中編輯器部分；`apps/editor/src/pages/import/`（`ImportPage.tsx`、`useAiParse.ts`、`ParsePreview.tsx`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（計費：網頁來源不得自動呼叫模型）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 網頁來源：擷取送達、`latest_capture` 查詢、開啟或切換工作階段都不送 `import.ai_parse`；按「用 AI 整理」才送
- PDF 自動整理行為照舊（既有測試通過）
- 姓名確認、截斷標示、含個資標示、手動輸入、取代提示各有測試

### 手動驗證

- 無（端到端在 P1-T087 前的擁有者實跑）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：2026-10-12 「包含」各項已實作並 commit（工作者 worktree，未 push）
- 已通過驗證：`npm run verify` 全綠（Vitest 3821 通過、13 略過）；新測試 `ImportPage.web.test.ts` 10 項，另以「網頁來源 auto 改 true」突變確認計費測試會失敗
- 下一步：codex 審查 2 項已修（另一個 commit）；協調者收官——E3 對抗驗證＋修正 diff 複審，再標 done
- Blocker：無

## codex 審查待修（2026-10-12，main 119d202）

1. `ImportPage.tsx`：helper 回 name_required 後表單解鎖，使用者可先改欄位；「確認姓名並用 AI 整理」繞過 edited／rerunArmed 保護，默默蓋掉修改 → 改走與「用 AI 重新整理」相同的覆寫確認，並保留已確認的姓名
2. `SkillChips.tsx`：技能的含個資標示靠與原值完全相等比對，編輯後（「林測試開發」→「林測試開發工具」）標示消失但姓名還在 → 標示跟著技能項目（索引隨編輯與刪除同步）走，編輯後仍保留

## 完成結果

- 計費（Q4＝B）：`useAiParse` 改吃 `AiSession { key, importId, auto }`，effect 只看 `key`；`ImportPage.open` 只有 PDF 非 104 版面 `auto: true`，網頁擷取一律 `auto: false`，手動與解析失敗 `null`。送 `import.ai_parse` 的路徑只剩 auto（PDF）與按鈕／確認姓名（`restart`）。`useLatestCapture` 只送 `import.latest_capture`；「使用這份」只送 `import.get`
- 新檔：`useLatestCapture.ts`；`ImportReview.tsx`（核對畫面，從 ImportPage 拆出）；`components/LatestCapturePanel.tsx`（平台、時間、截斷、「使用這份」「重新查詢」）、`WebPreview.tsx`（「區塊 bN」＋種類，截斷持續顯示「內容不完整」）、`NameConfirm.tsx`（`profile.get` 預填、多寫法、`checkNames` 驗 1～8 個×64 字）、`PersonalMark.tsx`
- 改檔：`useAiParse.ts`（`needs_name` 狀態對應 `reason: name_required`；成功草稿依 `source` 取 `webDraft`／`draft`；`restart(names?)`）；`ai-form.ts`（`AiDraftLike` 結構型別共用 PDF／網頁草稿；`formFromAiDraft` 帶個資旗標）；`form-model.ts`（`InfoRow.personal`、`ExperienceRow.personal`、`ProfileForm.personalSkills`，不進 `toProfileInput`）；`AiParsePanel.tsx`（`web` 時首按鈕「用 AI 整理」、失敗提示對照區塊手動輸入、其他段落個資標示）；`ConfirmBar.tsx`（「會取代目前的個人資料」）；`InfoRows`／`ExperienceCard`／`SkillChips`（「含姓名或聯絡資料」）；`ImportPage.tsx`（「手動輸入」入口在初始、完成、核對畫面都有；`multiple_profiles` 顯示原因）
- 保守選擇：(1) 最近擷取只在開頁與按「重新查詢」時查，不輪詢；(2) 查不到擷取只在擷取區塊提示，不出錯誤警示；(3) 網頁來源使用者先改過欄位再按「用 AI 整理」也要再按一次確認（會覆蓋）；(4) 個資標示跟著列／欄位走、使用者改值後仍保留（技能以值比對）；(5) 姓名確認只在 helper 回 `name_required` 時顯示，確認過的姓名在同一次核對內重新整理時一併帶上
- codex 審查 2 項已修（先寫 `ImportPage.web-guard.test.ts` 重現、修前 2 項失敗）：(1) `ImportPage.confirmNames` 先記住姓名，改過欄位就武裝覆寫確認（`NameConfirm` 加 `confirmingRerun`，按鈕變「確定重新整理（放棄目前的修改）」並顯示覆蓋提醒），第二次按才帶姓名送出；(2) `ProfileForm.personalSkills` 改成與 skills 同索引的 boolean 陣列，`ProfileFormFields` 刪除／新增時同步、編輯保留，`SkillChips` 依索引標示，`ai-form.skillRows` 去重時任一同值有旗標即標示。verify 綠（Vitest 3824 通過、13 略過）
- 殘餘：表單欄位不顯示各自的出處區塊編號（只在右側預覽列區塊）；編輯器已開著時新擷取送達要按「重新查詢」才看得到
