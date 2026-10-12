---
id: P1-T074
phase: 1
status: ready
depends_on: ["P1-T041", "P1-T069"]
specs: ["bridge.md", "web-resume-capture.md", "resume-import.md", "resume-output.md", "architecture.md"]
track: contracts
primary_repo: rolecraft
write_paths: ["packages/contracts/src/", "apps/helper/src/handlers/registry.ts", "apps/helper/src/handlers/registry.test.ts", "apps/helper/src/handlers/contract-drift.test.ts", "apps/helper/src/handlers/services.ts", "apps/helper/src/handlers/import/service.ts", "apps/helper/src/handlers/import/submit-resume-capture.ts", "apps/helper/src/handlers/import/latest-capture.ts", "apps/helper/src/handlers/import/start-manual.ts", "apps/helper/src/handlers/photo/", "apps/helper/src/handlers/profile/", "apps/helper/src/bridge/__fixtures__/", "apps/helper/src/services/data-dir.ts", "docs/adr/0006-contracts-interim-fields.md"]
contract_change: additive
expected_commit: "feat(P1-T074): 網頁履歷匯入、照片、個人資料讀取的橋接契約一次定好（未接服務回 not_implemented）"
---

# contracts：網頁履歷匯入、照片、個人資料讀取的橋接契約

## 目標

D28 新增 7 個橋接操作與多個相加欄位。比照 P1-T041 一次把契約與 helper 分派表定好（未接服務回 `not_implemented`），之後擴充功能、helper、pipeline、編輯器各 Task 只改自己的目錄，可以平行（E5）。

## 範圍

### 包含

- 操作清單（`operations.ts` 的 `BridgeOperation`）相加：`submit_resume_capture`、`import.latest_capture`、`import.start_manual`、`profile.get`、`photo.pick`、`photo.get`、`photo.remove`（語意見 bridge.md）。**`CONTENT_SCRIPT_OPERATIONS` 這裡不動**：現行 `authorizeSender` 只認職缺頁並檢查 `captureMethod`，先加進白名單會讓型別或授權出錯；由 P1-T076 連同「操作×頁型」驗證一起加
- `BRIDGE_PICKER_OPERATIONS` 加 `photo.pick`（resume-output「照片」，W19）
- `submit_resume_capture` 請求 schema（web-resume-capture「`submit_resume_capture`」）：`kind` 封閉列舉、`level` 只有標題與清單項 1–6 其他 null、`label`、`text`、`continues`、`truncated`、`nameText`、`capturedAt`；`url` 只收 https 的 origin＋路徑（不得有查詢字串與 #）；上限常數（區塊 2,000、文字含標籤 UTF-8 合計 256 KiB）定在 contracts，schema 擋超量；成功回 `{ok: true}`
- 匯入回應相加（resume-import「匯入工作階段」，W4）：`import.get`／`import.ai_status` 能分辨 PDF、網頁、手動三種來源；網頁來源原文是 helper 配發編號（b1、b2…）的區塊清單＋是否截斷，欄位出處是區塊編號；PDF 既有形狀（`ImportDraftField` 頁碼／行號）不變。AI 草稿欄位相加「還原出姓名或聯絡資料」旗標（W7）；AI 草稿大小上限常數 512 KiB
- `import.ai_parse` 請求相加選填姓名（可多個寫法；長度與個數設上限）；`import.latest_capture` 回 importId、平台、擷取時間、是否截斷或 null；`import.start_manual` 回 importId
- `profile.get` 回已確認的 Profile 或 null（多份時的失敗另定固定原因）
- 照片：contracts 相加照片實體（照片 ID、格式、寬高、雜湊）；`photo.pick` 回照片資訊＋縮圖或 cancelled／busy，`photo.get` 回照片資訊＋縮圖或 null，`photo.remove`；縮圖大小設上限，讓回應低於 1 MiB。`ExportVersion` 相加選填照片 ID 與雜湊（R3）
- helper：分派表註冊全部新操作；handler 檔放各群組目錄（`handlers/import/` 三個新檔、`handlers/photo/`、`handlers/profile/`），服務方法缺席時回 `not_implemented`；`services.ts` 加 `photo`、`profile` 鍵與服務介面；確認 `data-dir.ts` 的 `needsStorage` 讓新群組在資料區被占用時回 `helper_unavailable`
- 兩份請求 fixture、contract drift 測試同步；ADR-0006 加一列說明這次的暫行欄位

### 不包含

- 任何服務實作（各 Task 自己做）
- `CONTENT_SCRIPT_OPERATIONS` 與 relay 授權（P1-T076）
- 改 PDF 既有欄位形狀

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/bridge.md`（操作清單、共同規則、信封與分塊）
- `docs/specs/web-resume-capture.md`「`submit_resume_capture`」「上限」
- `docs/specs/resume-import.md`「匯入工作階段」「網頁來源的 AI 整理」
- `docs/specs/resume-output.md`「照片」「內容回填到求職網站」
- P1-T041、P1-T069 完成結果；`packages/contracts/src/bridge/editor/import.ts`、`operations.ts`、`protocol.ts`、`apps/helper/src/handlers/registry.ts`、`services.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 只做相加（additive）：既有請求與回應 schema 對現有呼叫端照舊通過；相加後既有程式 typecheck 失敗而修正超出 write_paths 時停下回報
- 非高風險：協調者收官閘門＋codex review；上限與 1 MiB 相關常數請協調者稽核
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- schema 測試：區塊數與 256 KiB 剛好在上限內通過、超過被拒；上限內最大的 `submit_resume_capture` 請求序列化後低於 1 MiB；`kind` 不在列舉、`level` 超過 6 或用在段落、`url` 帶查詢字串或 # 或非 https 都被拒
- `BRIDGE_PICKER_OPERATIONS` 含 `photo.pick`；`CONTENT_SCRIPT_OPERATIONS` 不變
- helper：新操作在服務缺席時回 `not_implemented`、資料區被占用時回 `helper_unavailable`；contract drift 測試通過

### 手動驗證

- 無

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
