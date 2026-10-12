---
id: P1-T085
phase: 1
status: done
depends_on: ["P1-T074"]
specs: ["resume-output.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/resumes/profile/", "apps/editor/src/pages/resumes/ResumesPage.tsx"]
contract_change: none
expected_commit: "feat(P1-T085): editor：履歷頁的個人資料複製與照片管理"
---

# editor：履歷頁的個人資料複製與照片管理

## 目標

履歷頁加「個人資料與照片」區塊：顯示已確認的個人資料，每欄可複製（複製前向 helper 重讀比對）；照片可加入、更換、刪除。可先對假橋接開發。

## 範圍

### 包含

- 位置：規格只說「履歷頁提供複製按鈕」、照片沒指定頁面；本 Task 放在履歷頁同一個新區塊（匯出就在這頁）。協調者若要改位置，開工前改本段
- 個人資料：`profile.get` 顯示個人資料各欄、每段經歷的公司／職稱／日期／描述、技能，各有「複製」；按下時重新 `profile.get`，與畫面一致才寫入剪貼簿，不一致就更新畫面、請使用者再按一次（Q12）；沒有或多份 Profile 時顯示原因
- 照片：顯示縮圖；加入；已有照片時「更換」先說明 D19 後果、確認後才開選取器，取消選取不變動；「刪除」先說明、確認後送；`photo.*` 失敗或逾時後一律重新 `photo.get` 以實際狀態顯示
- 請求進行中鎖住區塊按鈕，過期回應作廢（比照 `useIntro` 的做法）

### 不包含

- 客製段落複製（P1-T086）
- helper 實作（P1-T079、P1-T083）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`「照片」「內容回填到求職網站」
- P1-T074 完成結果；P1-T064 完成結果（複製規則）；`apps/editor/src/pages/jobs/useIntro.ts`、`apps/editor/src/pages/resumes/ResumesPage.tsx`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 非高風險：協調者收官閘門＋codex review
- `ResumesPage.tsx` 只加掛載新區塊；其餘程式放 `resumes/profile/`
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 複製內容等於 helper 讀回的值；與畫面不一致時不複製、先更新畫面
- 更換與刪除都要確認；取消選取不變動；逾時或失敗後畫面以 `photo.get` 為準

### 手動驗證

- 無（端到端待 P1-T079、P1-T083 收官後由協調者實跑）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## codex 審查待修

- [x] `ProfileCopyList.tsx`：初次 `profile.get` 逾時或 helper_unavailable 時只顯示錯誤、沒有重試方式，helper 恢復後也無法再讀，要離開再開頁。加「重新讀取個人資料」按鈕（受同一把區塊鎖保護，鎖定與 token 作廢規則照舊）

## 中斷／接手紀錄

- 最後完成：codex 審查 1 項已修（個人資料讀取失敗可重試）
- 已通過驗證：`npm run verify` 綠（Vitest 3830 通過、13 略過）
- 下一步：已收官（2026-10-12 協調者：審查屬實項皆已修，修正 diff 的 codex review 無發現；main `npm run verify` 綠，Vitest 4014 通過）
- Blocker：無

## 完成結果

- 新區塊 `resumes/profile/ProfilePhotoPanel.tsx`（`ProfilePhotoPanel`），`ResumesPage.tsx` 只加 import 與掛載一行（頁尾，與職缺／版本無關，一律顯示）
- 請求鎖 `useBlockLock`（begin／restart／current／end，比照 `useIntro`）：整個區塊共用，進行中全部按鈕停用；token 不符或已卸載的回應作廢
- 個人資料 `useProfileCopy`＋`ProfileCopyList`＋`profile-labels.ts`（`profileGroups`、`findItem`）：personalInfo 各欄、每段經歷的公司／職稱／任職期間／描述、技能各一顆「複製」；按下重新 `profile.get`，讀回的「整份」Profile 與畫面完全一致才寫入該欄；不一致→更新畫面＋請再按一次；讀回 null／multiple_profiles／not_implemented→畫面改成對應原因、不複製；逾時等一般失敗→畫面不動、不複製
- 照片 `usePhoto`＋`PhotoManager`：縮圖（data URI）＋尺寸；更換／刪除先顯示 D19 說明、確認後才送（更換確認後才開選取器）；`photo.pick` 非 selected（取消、busy、失敗、逾時）與 `photo.remove` 失敗後一律重讀 `photo.get` 顯示實際狀態；`photo.get` 為 not_implemented 時顯示「服務尚未接上」提示、只留「重新讀取照片」
- 測試：`ProfileCopy.test.ts`（8：一致才複製且內容＝讀回值、不一致更新畫面再按才複製、整份比對、讀回 null、逾時、無／多份／未實作三種原因、鎖與卸載作廢；StrictMode 下跑）、`PhotoManager.test.ts`（10：加入、加入前發現已有照片、更換確認與取消、選取視窗取消不變動、刪除確認、逾時以 photo.get 為準、刪除失敗、未實作提示兩種、狀態不明可重讀）；測試替身 `profile.test-helpers.ts`
- 保守選擇：(1) 比對整份 Profile 而非單欄（任何欄位變了都先更新畫面）；(2) 「加入照片」送出前先重讀 `photo.get`，本機已有照片就不開選取器、改走更換確認，避免未經 D19 確認就換掉舊照片；(3) 取消與 busy 也重讀 `photo.get`；(4) 技能合成一段以「、」分隔複製（規格沒說逐項或整段）；任職期間複製為「起 – 迄／至今」；(5) 空白欄位不能複製；(6) 照片狀態不明（逾時、連不上）時不提供加入／更換／刪除，只能重新讀取
- codex 審查修正：`ProfileCopyList` 在沒有 Profile、多份、未實作、讀取失敗（逾時、連不上）時都顯示「重新讀取個人資料」，由 `ProfilePhotoPanel` 的 `reload`（與重新讀取照片共用）送出，受同一把區塊鎖、token 作廢規則不變；新增 3 個測試（逾時／連不上後恢復可讀可複製、重讀中鎖住區塊且卸載後作廢），修前重現失敗
- 殘餘：P1-T086 的 `copy/copy-context.ts` 全域 store 未動（範圍外；本 Task 已能改 `ResumesPage.tsx`，之後可改成由頁面傳 props）；personalInfo 欄位順序依 helper 回傳的鍵順序；縮圖 data URI 是否受擴充功能頁 CSP 影響未在真實 Chrome 實測（MV3 預設 CSP 不限 img-src，待 P1-T083 後端到端確認）
