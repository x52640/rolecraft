---
id: P1-T089
phase: 1
status: ready
depends_on: ["P1-T081"]
specs: ["resume-import.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/"]
contract_change: none
expected_commit: "feat(P1-T089): editor：網頁來源核對改版（原文收合、欄位出處、標黃提醒、不強制核對）"
---

# editor：網頁來源核對改版（D29 (b)(c)(d)、再裁定 2）

## 目標

匯入頁網頁來源：原文區改成預設收合、照原結構呈現；每個欄位旁顯示出處原文；確認從「逐欄核對」改成不強制核對（2026-10-13 再裁定 2：標黃只當提醒，確認前顯示預設收合的精簡摘要）。仍然要使用者按下確認才寫入 Profile。

## 範圍

### 包含

- (b) 原文區：預設收合的「查看擷取原文」；展開照結構呈現（標題、清單項目符號與層級縮排、標籤＋值兩欄、依標題分組）；不顯示區塊編號與種類，編號只在滑鼠移上或從欄位連過去時顯示；截斷提示收合時也看得到
- (c) 每個有出處的欄位旁顯示出處區塊原文（最多兩行），可點一下連到原文區對應區塊（自動展開）
- (d) 免標示／標黃判定（值包含於單一出處區塊且無個資標示即免標示；不需要欄位對應表），標黃只是提醒、不擋確認
- 確認流程照 resume-import「網頁來源的核對（D29）」的「確認」（再裁定 2）：網頁來源拿掉「我已逐欄核對」勾選、不做「已看過」；確認鈕旁預設收合的精簡摘要（每段經歷「公司｜職稱｜期間」、學歷）與固定提示文字（個人資料頁 P1-T091 上線前不放連結）；PDF 來源維持現行勾選

### 不包含

- PDF 來源的核對行為（維持現行）
- helper／pipeline／contracts 的任何變更
- 擷取端介面字樣過濾（P1-T088）

## 工作區與 Context

### 必讀入口

- `plan.md` D29（含再裁定 2）、D28、D4
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入工作階段」「網頁來源的 AI 整理」「網頁來源的核對（D29）」
- P1-T081 完成結果；`apps/editor/src/pages/import/`（`ImportPage.tsx`、`ai-form.ts`、`components/WebPreview.tsx`、`components/ConfirmBar.tsx`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 契約判斷（規劃時已查）

- 不改契約即可判定：`ImportWebDraftField` 有 `value`、`blockId`（第一個引用區塊）、`containsPersonalData`；`import.get` 的 `ImportWebBlock` 有 `text`。判定「只出自單一區塊」＝欄位值正規化（去空白、NFKC，與照抄檢查相同）後是 `blockId` 指到區塊文字（正規化後）的子字串；不是就代表跨多區塊 → 標黃。若發現此推論不成立就停下回報。
- 實作時若發現這個推論不成立（例如某類欄位拿不到出處區塊），停下回報，不得自行改 `packages/contracts`；屆時另開契約 Task（候選：`ImportWebDraftField` 相加 `blockIds: WebBlockId[]`）。

## 實作要求

- **高風險（放寬確認；R1／D4 只寫有出處或使用者確認的事實）**：自動帶入的欄位也只有在使用者按下確認後才寫入；不得新增任何自動呼叫 `import.confirm` 的路徑；標黃不擋確認（再裁定 2）。收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 「含姓名或聯絡資料」標示的欄位一律標黃
- 網頁來源仍不自動呼叫模型（P1-T081 的保證不得退步）
- 與 P1-T088 write_paths 不重疊，可平行（E5）；與 P1-T087（同 write_paths，目前 blocked）不可同時跑
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向；`ImportPage.web.test.ts` 已 304 行附近，新測試另開檔）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- resume-import「網頁來源的核對（D29）」驗收各項
- 不按確認不送 `import.confirm`；有標黃欄位、都沒看或改時確認鈕仍可用；沒有逐欄勾選與「已看過」；精簡摘要預設收合、展開內容正確
- PDF 來源既有測試照舊通過（逐欄勾選不變）

### 手動驗證

- 協調者以開發入口或擁有者 104 實跑看一次畫面

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
