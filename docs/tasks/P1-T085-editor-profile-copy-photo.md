---
id: P1-T085
phase: 1
status: blocked
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

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等 P1-T074 收官後改 ready
- Blocker：相依 P1-T074 未完成

## 完成結果
