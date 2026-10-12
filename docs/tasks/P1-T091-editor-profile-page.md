---
id: P1-T091
phase: 1
status: in_progress
depends_on: ["P1-T090"]
specs: ["resume-import.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/profile/", "apps/editor/src/app/routes.ts", "apps/editor/src/app/App.test.ts", "apps/editor/src/app/router.ts", "apps/editor/src/app/router.test.ts", "apps/editor/src/app/App.tsx"]
contract_change: none
expected_commit: "feat(P1-T091): editor：個人資料頁（逐欄修改、刪除、新增，顯示出處）"
---

# editor：個人資料頁（D30）

## 目標

編輯器新增「個人資料」頁：讀取唯一那份已確認的 Profile，逐欄修改、刪除、新增基本資料列（含學歷）、經歷、技能，每欄顯示出處原文；使用者按儲存才以 `profile.update` 寫入，版本衝突時不蓋掉別處的內容。

## 範圍

### 包含

- 新頁面 `pages/profile/` 並登記導覽列（`routes.ts`，放在「匯入」之後）
- 讀取 `profile.get`；沒有 Profile 時導向匯入頁；多份時顯示固定原因
- 逐欄編輯、刪除、新增；每欄旁顯示出處原文（最多兩行，可展開到存下的全文；有截斷就標示）、「已修改」、「自行新增」
- 儲存：送 `profile.update`（基準版本號＋每列來源列）；成功後以回傳內容更新畫面並顯示固定提示（resume-import「個人資料編輯（D30）」）；改或刪經歷的公司、職稱、開始，或刪整段經歷時，儲存前提示對不到的代價（刪經歷不套 D19、不刪 PDF，D30 (b)；畫面不得提示會刪除任何匯出版本）
- 衝突（`profile_conflict`）：顯示固定訊息、重新讀取，未儲存修改直接捨棄、不自動套回、不另外保留（D30 (c)）；其他失敗顯示原因、畫面上已存的內容不變
- 有未儲存修改時標示「尚未儲存」

### 不包含

- helper／contracts 變更（P1-T090）
- 匯入頁的連結與提示（P1-T089；本頁上線後若要在匯入頁加連結，另開小 Task）
- 履歷頁的過期提示（D30 (a)，P1-T092）

## 工作區與 Context

### 必讀入口

- `plan.md` D30、D4
- `docs/README.md`
- `docs/specs/resume-import.md`「個人資料編輯（D30）」；`bridge.md` `profile.get`、`profile.update`、錯誤碼
- P1-T090 完成結果；`apps/editor/src/app/routes.ts`；可參考 `apps/editor/src/pages/import/ProfileForm.tsx`（只讀，不改）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- **高風險（D4 使用者確認、資料覆寫、並行）**：只有按儲存才送 `profile.update`，沒有自動儲存；一律帶畫面讀到的版本號，衝突後不得自動以新版本號重送；請求不帶任何出處文字。收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 不呼叫模型
- 與 P1-T089（`pages/import/`）write_paths 不重疊，可平行（E5）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- resume-import「個人資料編輯（D30）」驗收中屬畫面的各項：修改、刪除、新增後儲存送出正確的來源列與版本號；不按儲存不送；出處、「已修改」、「自行新增」顯示正確
- 回 `profile_conflict` 時重新讀取、顯示固定訊息、不自動重送
- 改經歷公司／職稱／開始或刪經歷時出現儲存前提示；儲存成功出現固定提示
- 沒有 Profile、多份 Profile 的畫面

### 手動驗證

- 協調者以開發入口匯入一次後到個人資料頁改一欄、刪一段經歷、加一個技能，重新整理後內容一致

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：審查項修正＋codex 複審 beforeunload returnValue（worker，2026-10-13）
- 已通過驗證：見完成結果
- 下一步：協調者合併、範圍稽核、收官
- Blocker：無
- 審查待修（codex＋worker 殘餘，協調者 2026-10-13 指派，另一個 commit）：
  1. 基本資料值用單行 input，學歷等多行值的換行被吃掉並寫回 → 改 textarea
  2. 出處以標籤查找沒用 `Object.hasOwn`：標籤 `constructor`／`toString` 取到繼承成員，頁面當掉
  3. 出處依字數決定能否展開：窄視窗少於 41 字也會被截成兩行而無法展開 → 一律可展開
  4. 有未存修改時從導覽列切頁不攔 → 通用「離開前確認」，個人資料頁註冊
  5. 單行欄位一律修剪頭尾空白，未動的欄位也被改寫並標「已修改」→ 只修剪使用者改過的欄位

## 完成結果

- 新頁 `apps/editor/src/pages/profile/`，導覽列「個人資料」排在「匯入」之後（`routes.ts`、`App.test.ts` 改為九頁）。
- 讀 `profile.get`：沒有 Profile 顯示原因＋「到匯入頁」連結（不自動跳頁）；多份顯示固定原因、不讀不寫；讀取失敗只給「重新讀取」。
- 逐欄編輯基本資料（含學歷列，可改欄位名）、經歷（公司、職稱、開始、結束／至今、描述）、技能；每欄出處原文預設兩行、可展開，截斷有標示；「已修改」＝helper 標過或畫面值與基準不同；新增列標「自行新增」；沒有出處標「沒有出處原文」。有未存修改顯示「尚未儲存」。
- 儲存：只在按下時送 `profile.update`，帶畫面讀到的 `baseVersion`＋每列 `from`（基本資料原標籤、經歷與技能原位置、新增 null）；請求由欄位值重建，不帶出處文字。送前做與 `import.confirm` 相同的驗證（另擋欄位名空白／重複、結束未填又沒勾至今）。成功以回傳 Profile 重建畫面並顯示固定提示；儲存前一直顯示「不回溯已產生／已匯出／已投遞」提示。
- 改公司／職稱／開始或刪整段經歷：儲存前列出受影響經歷與對不到提示，再按一次才送（表單一改確認失效）；刪經歷註明不刪任何匯出版本或 PDF（D30 (b)）。
- `profile_conflict`：顯示固定訊息、重新讀取、未存修改捨棄、不重送（D30 (c)）；`profile_missing` 重讀後導向匯入；`multiple_profiles` 轉為不讀不寫；其他失敗顯示原因、保留畫面修改。
- 競態：比照 useIntro／useBlockLock，單一請求鎖（請求中表單 fieldset 與按鈕鎖住、輸入不套用）、每操作 token（卸載或 StrictMode 重跑作廢）；有未存修改時「重新讀取」要再按一次、關閉／重新整理分頁觸發 beforeunload 確認。
- 新測試：`profile-model.test.ts`、`ProfilePage.test.ts`、`ProfilePage.conflict.test.ts`（StrictMode＋記憶體假 bridge，合成資料）。
- 審查項修正（第二個 commit，先在 `ProfilePage.review.test.ts`、`router.test.ts`、`profile-model.test.ts` 寫測試重現，舊程式 5 項全紅）：
  1. 基本資料值改 textarea，多行（學歷）換行保留、原樣送回。
  2. 出處與基準值以標籤查找改走 `Object.hasOwn`，`constructor`／`toString` 標籤不再取到繼承成員。
  3. 出處一律可展開（是否被兩行截斷取決於視窗寬度，不再用字數判斷）。
  4. `app/router.ts` 加通用「離開前確認」`useLeaveGuard(message)`：有註冊時站內換頁（導覽列、頁內連結、上一頁）先 `confirm`，不確認就把 hash 換回原頁（replaceState，不新增歷史）、畫面不動；同時處理 beforeunload。只有註冊的頁面受影響；個人資料頁有未存修改時註冊。`App.tsx` 不需改。
  5. 只修剪使用者改過的欄位：與基準完全相同的值原樣送回（`sendValue`），「已修改」、對不到經歷、驗證都以要送出的值判斷。
- codex 複審（第三個 commit）：beforeunload 除 `preventDefault()` 外補回 `event.returnValue = 提示文字`（Chrome 116–118 只認舊寫法），`router.test.ts` 斷言兩者都有設。
- 殘餘：被擋下的「上一頁」會以 replaceState 把該筆歷史改回本頁網址（歷史少一筆往回的目標）；離開確認用瀏覽器原生 `confirm` 對話框。
