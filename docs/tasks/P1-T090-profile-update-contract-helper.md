---
id: P1-T090
phase: 1
status: in_progress
depends_on: ["P1-T079"]
specs: ["resume-import.md", "bridge.md", "architecture.md", "evidence-model.md", "resume-output.md"]
track: contracts
primary_repo: rolecraft
write_paths: ["packages/contracts/src/", "apps/helper/src/handlers/profile/", "apps/helper/src/handlers/import/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/handlers/services.ts", "apps/helper/src/bridge/__fixtures__/", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/extension/src/bridge/client.test.ts", "packages/domain/src/evidence/profile-sources.test.ts", "packages/pipeline/src/generation/profile-sources.test.ts", "packages/pipeline/src/intro/profile-sources.test.ts", "packages/pipeline/src/resume-parse/check.ts", "packages/pipeline/src/resume-parse/web-check.ts", "packages/pipeline/src/resume-parse/types.ts", "apps/editor/src/pages/resumes/profile/useProfileCopy.ts", "apps/editor/src/pages/resumes/profile/ProfileCopy.test.ts", "apps/helper/src/handlers/resume/generation.ts", "apps/helper/src/handlers/resume/profile-version.test.ts", "docs/specs/resume-import.md", "apps/helper/src/handlers/resume/list.ts", "apps/helper/src/handlers/resume/list.test.ts", "packages/pipeline/src/resume-parse/run.ts", "packages/pipeline/src/resume-parse/draft-limit-sources.test.ts"]
contract_change: additive
expected_commit: "feat(P1-T090): profile.update 契約與 helper：個人資料編輯、版本衝突、各欄出處、履歷版本記 Profile 版本號"
---

# contracts＋helper：profile.update、Profile 版本號與各欄出處（D30）

## 目標

讓確認後的 Profile 可以經 `profile.update` 逐欄修改、刪除、新增，帶版本號防止蓋掉別處的寫入；`import.confirm` 寫入時由 helper 記下各欄出處原文，`profile.update` 搬移出處並標「已修改」。〔D30 (a)〕履歷版本產生時記下當時的 Profile 版本號，供履歷頁過期提示（P1-T092）比對。

## 範圍

### 包含

- contracts（additive）：Profile 相加選填版本號與各欄出處（出處＝來源種類＋原文最多 300 字＋是否截斷＋是否已修改）；兩者不進 `ProfileInput`（呼叫端不能把出處文字或版本號送給 `import.confirm`／`import.save_corrections`）；`profile.update` 請求／回應 schema；`invalid_request` 固定原因相加 `profile_conflict`、`profile_missing`；操作清單、fixture、`contract-drift` 一致
- helper `profile.update`：照 resume-import「個人資料編輯（D30）」與 bridge.md `profile.update`——同一個寫入比對版本號、依來源列搬移出處並判定「已修改」、新增列沒有出處、驗證同 `import.confirm`、成功回整份已確認 Profile
- helper `import.confirm`：請求形狀不變；依該工作階段草稿（AI 整理成功用 AI 草稿，否則本機預填）比對寫下出處（經歷以公司＋職稱＋開始對、技能以值、「學歷」列比所有學歷欄位接合值；正規化同照抄檢查）；出處文字一律從工作階段原文取；版本號加一
- 防退步測試（新檔，只加測試、不改這兩個套件的原始碼）：R1 檢查 3 不認出處原文裡的數字（domain）；生成與自介提示不含出處原文（pipeline）

- 協調者補充（2026-10-13，D30 文件 codex review）：
  1. pipeline 照抄檢查（`check.ts`、`web-check.ts`）目前只保留第一個引用來源；D30 要求多區塊／多行欄位的出處原文完整，須保留全部引用來源（只加欄位、不改既有檢查結果），PDF 與網頁既有測試不得退步。
  2. 既有 `apps/editor/src/pages/resumes/profile/useProfileCopy.ts` 以 `JSON.stringify` 比對整份 Profile；`profile.get` 帶出處與版本號後，比對要排除出處、版本號等中繼資料，只比欄位值。補「只有出處不同時仍可複製」回歸測試。

- 〔2026-10-13 D30 (a) 補充〕Profile 版本號即「修改序號」（不另加修改時間）；`profile.get` 回傳版本號（舊資料沒有視為 0）。
  - contracts（additive）：`ResumeVersion` 相加選填 `profileVersion`（非負整數）；`resume.get`／`resume.list` 回應照實帶出；fixture、`contract-drift` 一致。
  - helper `generation.ts`：存版本時記下這次生成**最後一次送出模型時 `loadInputs` 實際讀到**的 Profile 版本號（沒有記 0）；不得在 `commitUnit` 時另外重讀 Profile。只改 helper，不改 `packages/pipeline/src/generation/`（若做不到就停下回報）。
  - 新測試 `apps/helper/src/handlers/resume/profile-version.test.ts`：產生後版本記到當時版本號；生成途中（兩次送出之間）Profile 被 `profile.update` 改過，記的是最後一次送出讀到的值；Profile 沒有版本號記 0；段落編輯、接受不改 `profileVersion`；舊版本（沒有該欄）照常可讀。

### 不包含

- 編輯器個人資料頁（P1-T091）、匯入頁（P1-T089）、履歷頁過期提示畫面（P1-T092）
- storage migration（Profile 與履歷版本都以整份 JSON 存，相加選填欄位不需要；若發現需要就停下回報）

## 工作區與 Context

### 必讀入口

- `plan.md` D30、D29（再裁定 2）、D28 Q8、D4、D19
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入工作階段」「個人資料編輯（D30）」；`bridge.md` 共同規則、`import.confirm`、`profile.get`、`profile.update`、`resume.list`／`resume.get`、錯誤碼；`architecture.md` Profile、ResumeVersion 列；`evidence-model.md` R1 檢查 3；`resume-output.md`「Profile 修改後的過期提示（D30 (a)）」的「記錄」
- P1-T074、P1-T079 完成結果；`packages/contracts/src/entities/profile.ts`、`entities/resume-version.ts`、`apps/helper/src/handlers/resume/generation.ts`、`bridge/editor/profile.ts`、`bridge/editor/import.ts`；`apps/helper/src/handlers/profile/`、`handlers/import/confirm.ts`、`import-service.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- **高風險（R1／D4、資料覆寫、並行）**：版本比對與寫入在同一個同步寫入內完成，中間不得 await；衝突時資料完全不變；出處文字不得來自請求；出處不得進任何提示或 R1 檢查 3。收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 舊資料（沒有版本號、沒有出處）照常可讀、可更新（版本號視為 0）
- 契約只做相加；既有操作的請求形狀不變
- 與 P1-T088（extension sites）、P1-T089（editor import）、P1-T093（pipeline `redact.ts` 與新測試檔）write_paths 不重疊，可平行（E5）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- resume-import「個人資料編輯（D30）」驗收中屬 helper／契約的各項：修改、刪除、新增後讀回一致且仍已確認；版本不符回 `profile_conflict` 且資料不變；`import.confirm` 之後用舊版本號的 `profile.update` 衝突；來源列不存在或重複引用回 `invalid_request`；修改過的欄位出處保留並標已修改、新增列沒有出處；`import.confirm` 只在值相同時寫出處、請求帶出處欄位被 schema 擋
- 沒有 Profile 回 `profile_missing`、多份回 `multiple_profiles`
- 出處原文不進生成／自介提示、R1 檢查 3 不認出處裡的數字
- 履歷版本的 `profileVersion`：resume-output「Profile 修改後的過期提示（D30 (a)）」驗收中屬 helper 的各項（記錄時機、生成途中被改、沒有版本號記 0）

### 手動驗證

- 無（編輯器畫面由 P1-T091 驗）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：首個 commit（c21ad2f）後，依協調者轉來的對抗審查＋codex 3 項與協調者核准 1 項修正（第二個 commit `fix(P1-T090): 審查項…`）：
  1. （中）`profile.update` 標籤 `__proto__` 被 record 丟掉，可存出全空的已確認 Profile 或默默丟列 → contracts 擋 `__proto__` 標籤；`applyProfileUpdate` 組好後先以 `Profile` schema 驗證、與組出的內容比對一致再做空內容檢查。
  2. （中）只改標籤不改值時出處被搬到新標籤且未標已修改 → 標籤與來源標籤不同也算已修改；同步 resume-import D30「欄位對應」（協調者核准 `docs/specs/resume-import.md` 加入 write_paths）。
  3. （低）草稿 512 KiB 上限改為量測時排除 `moreLines`／`moreBlockIds`，維持 T069／T078／T080 原判定；判定通過但連同額外出處超過上限時拿掉額外出處（保住 `import.ai_status` 低於 1 MiB）。量測在 `pipeline/resume-parse/run.ts`，不在原 write_paths，因協調者指定此項修正而加入（含新測試檔 `draft-limit-sources.test.ts`）。
  4. （協調者核准擴充 write_paths）`handlers/resume/list.ts`（與 `list.test.ts`）：`resume.list` 照實帶 `profileVersion`。
- 已通過驗證：見完成結果
- 下一步：協調者收官
- Blocker：無

## 完成結果

- **contracts（additive）**：`Profile` 相加選填 `version`（非負整數）與 `sources`（`ProfileSources`：基本資料以欄位名對應、經歷／技能與 Profile 同索引；每欄 `kind`／`text`≤300 字／`truncated`／`modified`），並以 refine 鎖住出處與欄位對齊；`ProfileInput` 改為 `ProfileContent`（只有欄位值，帶 `version`／`sources` 被 strict schema 擋）。`profile.update` 請求（`baseVersion`＋每列 `from`：基本資料原標籤、經歷／技能原位置、null＝新增；欄位名不可重複）與回應（整份已確認 Profile）。`BridgeFailureReason` 加 `profile_conflict`、`profile_missing`。`ResumeVersion`、`resume.list` 項目相加選填 `profileVersion`。`ImportDraftField` 加選填 `moreLines`、`ImportWebDraftField` 加選填 `moreBlockIds`（第一個以外的其餘引用來源，只引用一個時省略）。兩份 editor-requests fixture 加 `profile.update`。
- **pipeline 照抄檢查**（`check.ts`、`web-check.ts`）：只在 `toField` 多帶其餘引用來源，檢查邏輯不變；P1-T069／T078／T080 既有測試全過。
- **helper `profile.update`**（`handlers/profile/update.ts`、`update-apply.ts`、`profile-service.ts`）：讀唯一 Profile → 比版本 → 搬移出處（值與基準不同標 `modified`，標過就保留）→ 驗證（內容全空擋，同 import.confirm）→ 寫入，全部在同一段同步程式內（node:sqlite 同步、無 await）。來源列以 `Object.hasOwn` 判斷（`constructor` 等原型名稱不算）。
- **helper `import.confirm`**（`confirm-draft.ts`、`confirm-sources.ts`）：AI 整理成功用 AI 草稿，否則 PDF 用本機預填（有 104 結構化草稿用它，否則只有姓名與技能）；網頁無 AI 草稿與手動輸入沒有出處。比對與出處文字照 resume-import「出處」；版本號 = 既有 +1（新建為 1）；出處整份重算。
- **helper `generation.ts`**：runner 的 `loadInputs` 每次記下讀到的 Profile 版本號，`commitUnit` 用最後一次的值寫 `profileVersion`，不在存檔時重讀；pipeline generation 未改。
- **editor `useProfileCopy.ts`**：只比 `personalInfo`／`experiences`／`skills`。
- **新測試**：`handlers/profile/profile-update.test.ts`、`handlers/import/confirm-sources.test.ts`、`handlers/resume/profile-version.test.ts`、`domain/evidence/profile-sources.test.ts`、`pipeline/generation/profile-sources.test.ts`、`pipeline/intro/profile-sources.test.ts`；`registry.test.ts`、`main.test.ts`、`ProfileCopy.test.ts` 補案例；`import.test.ts`、`web-session.test.ts` 的 Profile 期望值補上版本號與出處。
- **保守選擇**：(1) 只有一份但未確認的 Profile，`profile.update` 回 `profile_missing`（同 `profile.get` 當成沒有）。(2) 「已修改」只看值（基本資料改標籤但值不變不算修改）。(3) PDF 通用規則預填的經歷不寫出處（不在 helper 重做編輯器的跨行對應）。(4) 只有一個出處單位卻不含整個值時，往後補連續單位到涵蓋為止（最多 30 個），補不到只記第一個。(5) 「至今」（`endDate` 為 null）沒有出處。
- **審查修正（第二個 commit）**：
  1. `ProfileUpdateInfoRow.label` 擋 `__proto__`（實測 zod record 只丟這個鍵；`constructor`、`toString` 照常保留）；`applyProfileUpdate` 組好後先過 `Profile` schema、比對基本資料與出處的鍵數沒有少，再以驗證後的內容做空內容檢查，不合回新原因 `invalid_profile`（invalid_request、無固定原因）。
  2. 基本資料列標籤與來源標籤不同也標「已修改」；spec resume-import D30「欄位對應」同步。
  3. `pipeline/resume-parse/run.ts`：512 KiB 判定量測不含 `moreLines`／`moreBlockIds`；通過但連同額外出處超過上限時回傳拿掉額外出處的草稿（該次匯入的出處只剩第一個引用來源）。
  4. `resume.list` 照實帶 `profileVersion`（舊版本不帶）。
  - 新測試：`profile-update.test.ts` 審查項 3 則（`__proto__` 經 schema 被擋、繞過 schema 直接呼叫服務也不寫入、只改標籤標已修改）、`pipeline/resume-parse/draft-limit-sources.test.ts` 4 則（網頁與 PDF 的極端案例在模型輸出上限內：每欄 400 個引用、網頁 60 段／PDF 40 段）、`profile-version.test.ts` 的 `resume.list` 斷言、`registry.test.ts` 加 `invalid_profile`。修正前先跑過，確認這些測試會失敗。
- **殘餘**：無新增。
