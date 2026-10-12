---
id: P1-T091
phase: 1
status: ready
depends_on: ["P1-T090"]
specs: ["resume-import.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/profile/", "apps/editor/src/app/routes.ts", "apps/editor/src/app/App.test.ts"]
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

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等 P1-T090 完成後讀必讀入口開工
- Blocker：無（P1-T090 契約與 helper 已合入 main 545217e，審查中；協調者 2026-10-13 提前放行，若 T090 審查改動契約再同步）

## 完成結果
