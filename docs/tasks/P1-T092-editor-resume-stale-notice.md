---
id: P1-T092
phase: 1
status: done
depends_on: ["P1-T090"]
specs: ["resume-output.md", "bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/resumes/ResumesPage.tsx", "apps/editor/src/pages/resumes/stale/"]
contract_change: none
expected_commit: "feat(P1-T092): editor：履歷頁顯示「個人資料在此版本產生後改過」"
---

# editor：履歷頁過期提示（D30 (a)）

## 目標

履歷頁開啟某個履歷版本時，比對該版本產生時的 Profile 版本號與目前的 Profile 版本號，不同就顯示「個人資料在此版本產生後改過」；只提示，不擋匯出、複製或任何操作。

## 範圍

### 包含

- 新目錄 `pages/resumes/stale/`：讀 `profile.get` 的 hook 與提示元件（含測試）；`ResumesPage.tsx` 只加掛載點
- 比對規則照 resume-output「Profile 修改後的過期提示（D30 (a)）」：版本沒有 `profileVersion` 視為 0、Profile 沒有版本號視為 0；不同才顯示；開啟、重新整理、切換版本時重新比對，不自動輪詢
- `profile.get` 失敗、沒有 Profile、多份 Profile：不顯示提示、不顯示錯誤、不擋其他操作
- 切換版本或卸載時，舊的 `profile.get` 回應作廢（不得把 A 版本的比對結果顯示在 B 版本上）

### 不包含

- helper／contracts（P1-T090 做 `profileVersion` 記錄與回傳）
- 個人資料頁（P1-T091）
- 改動匯出前檢查、blockers、段落狀態

## 工作區與 Context

### 必讀入口

- `plan.md` D30（含 2026-10-13 補充 (a)）
- `docs/README.md`
- `docs/specs/resume-output.md`「Profile 修改後的過期提示（D30 (a)）」；`bridge.md` `profile.get`、`resume.list`／`resume.get`
- P1-T090 完成結果；`apps/editor/src/pages/resumes/ResumesPage.tsx`、`useResumeEditor.ts`（只讀）；`profile/useProfileCopy.ts`（只讀，參考 `profile.get` 呼叫方式）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 一般風險（只讀、只提示，不寫資料、不呼叫模型）：用協調者收官閘門，不跑對抗驗證
- `useResumeEditor.ts` 已 288 行，不改它；邏輯放 `stale/`
- 與 P1-T091（`pages/profile/`、`routes.ts`、`App.test.ts`）、P1-T093（pipeline）write_paths 不重疊，可平行（E5）
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- resume-output「Profile 修改後的過期提示（D30 (a)）」驗收中屬畫面的各項：版本號不同顯示、相同不顯示；版本沒有 `profileVersion` 且 Profile 版本 0 不顯示、大於 0 顯示；顯示時匯出、複製按鈕照常可用
- `profile.get` 失敗、null、多份時不顯示、不擋
- 切換版本途中舊回應晚到不影響新版本的顯示

### 手動驗證

- 協調者以開發入口產生一份履歷後，到個人資料頁（P1-T091 上線後）改一欄，回履歷頁看到提示且仍可匯出

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：stale/ hook＋提示元件＋測試，ResumesPage 掛載點（工作者 worktree，單一 commit）
- 已通過驗證：`npm run verify` 綠
- 下一步：已收官（2026-10-13 協調者：審查屬實項皆已修，最後一輪 codex review 無發現；main `npm run verify` 綠）
- Blocker：無

## 完成結果

- `pages/resumes/stale/useProfileVersion.ts`：依 trigger（畫面上的版本物件）重讀 `profile.get`；失敗、null、多份、讀取中一律回 null（不顯示、不報錯）；trigger 換掉或卸載時舊回應作廢。不輪詢。
- `pages/resumes/stale/StaleNotice.tsx`：`isStale`（版本 `profileVersion` 缺少當 0，與 `profileVersionOf` 比）；不同時在匯出狀態上方顯示「個人資料在此版本產生後改過。需要的話重新產生。」；只提示，不碰匯出檢查、複製、段落。
- `ResumesPage.tsx`：只加 `<StaleNotice key={版本 id} version=… />` 掛載點（+2 行）。比對只用 `resume.get` 的版本，不依賴 `resume.list`。
- 測試 `stale/StaleNotice.test.ts`（12 項，假 bridge）：isStale 規則；不同顯示且匯出前檢查／複製照常；相同、舊版本＋Profile 0／無版本號不顯示；舊版本＋Profile>0 顯示；失敗、null、多份不顯示且複製可用；重新整理才重新比對（不自動輪詢）；切換版本與重新整理同一版本時舊 `profile.get` 晚到不影響（已確認拿掉作廢檢查時後者會失敗）。
- 殘餘：寫入段落後 `loadView` 也會換版本物件，因此接受／退回／編輯後同樣會重讀一次 `profile.get`（多一次唯讀請求，規格未禁止）；手動驗證待 P1-T091。
