---
id: P1-T090
phase: 1
status: ready
depends_on: ["P1-T079"]
specs: ["resume-import.md", "bridge.md", "architecture.md", "evidence-model.md"]
track: contracts
primary_repo: rolecraft
write_paths: ["packages/contracts/src/", "apps/helper/src/handlers/profile/", "apps/helper/src/handlers/import/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/handlers/services.ts", "apps/helper/src/bridge/__fixtures__/", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "apps/extension/src/bridge/client.test.ts", "packages/domain/src/evidence/profile-sources.test.ts", "packages/pipeline/src/generation/profile-sources.test.ts", "packages/pipeline/src/intro/profile-sources.test.ts"]
contract_change: additive
expected_commit: "feat(P1-T090): profile.update 契約與 helper：個人資料編輯、版本衝突、各欄出處"
---

# contracts＋helper：profile.update、Profile 版本號與各欄出處（D30）

## 目標

讓確認後的 Profile 可以經 `profile.update` 逐欄修改、刪除、新增，帶版本號防止蓋掉別處的寫入；`import.confirm` 寫入時由 helper 記下各欄出處原文，`profile.update` 搬移出處並標「已修改」。

## 範圍

### 包含

- contracts（additive）：Profile 相加選填版本號與各欄出處（出處＝來源種類＋原文最多 300 字＋是否截斷＋是否已修改）；兩者不進 `ProfileInput`（呼叫端不能把出處文字或版本號送給 `import.confirm`／`import.save_corrections`）；`profile.update` 請求／回應 schema；`invalid_request` 固定原因相加 `profile_conflict`、`profile_missing`；操作清單、fixture、`contract-drift` 一致
- helper `profile.update`：照 resume-import「個人資料編輯（D30）」與 bridge.md `profile.update`——同一個寫入比對版本號、依來源列搬移出處並判定「已修改」、新增列沒有出處、驗證同 `import.confirm`、成功回整份已確認 Profile
- helper `import.confirm`：請求形狀不變；依該工作階段草稿（AI 整理成功用 AI 草稿，否則本機預填）比對寫下出處（經歷以公司＋職稱＋開始對、技能以值、「學歷」列比所有學歷欄位接合值；正規化同照抄檢查）；出處文字一律從工作階段原文取；版本號加一
- 防退步測試（新檔，只加測試、不改這兩個套件的原始碼）：R1 檢查 3 不認出處原文裡的數字（domain）；生成與自介提示不含出處原文（pipeline）

### 不包含

- 編輯器個人資料頁（P1-T091）、匯入頁（P1-T089）
- storage migration（Profile 以整份 JSON 存，相加選填欄位不需要；若發現需要就停下回報）
- 已產生履歷的過期標示（plan D30 未裁定，見 CURRENT_TASK）

## 工作區與 Context

### 必讀入口

- `plan.md` D30、D29（再裁定 2）、D28 Q8、D4、D19
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入工作階段」「個人資料編輯（D30）」；`bridge.md` 共同規則、`import.confirm`、`profile.get`、`profile.update`、錯誤碼；`architecture.md` Profile 列；`evidence-model.md` R1 檢查 3
- P1-T074、P1-T079 完成結果；`packages/contracts/src/entities/profile.ts`、`bridge/editor/profile.ts`、`bridge/editor/import.ts`；`apps/helper/src/handlers/profile/`、`handlers/import/confirm.ts`、`import-service.ts`

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
- 與 P1-T088（extension sites）、P1-T089（editor import）write_paths 不重疊，可平行（E5）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- resume-import「個人資料編輯（D30）」驗收中屬 helper／契約的各項：修改、刪除、新增後讀回一致且仍已確認；版本不符回 `profile_conflict` 且資料不變；`import.confirm` 之後用舊版本號的 `profile.update` 衝突；來源列不存在或重複引用回 `invalid_request`；修改過的欄位出處保留並標已修改、新增列沒有出處；`import.confirm` 只在值相同時寫出處、請求帶出處欄位被 schema 擋
- 沒有 Profile 回 `profile_missing`、多份回 `multiple_profiles`
- 出處原文不進生成／自介提示、R1 檢查 3 不認出處裡的數字

### 手動驗證

- 無（編輯器畫面由 P1-T091 驗）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
