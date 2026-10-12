---
id: P1-T079
phase: 1
status: blocked
depends_on: ["P1-T074"]
specs: ["resume-import.md", "bridge.md", "web-resume-capture.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/import/", "apps/helper/src/handlers/profile/", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts"]
contract_change: none
expected_commit: "feat(P1-T079): helper：網頁擷取與手動輸入的匯入工作階段，確認更新唯一 Profile，profile.get"
---

# helper：網頁擷取與手動輸入的匯入工作階段、確認更新唯一 Profile、profile.get

## 目標

helper 端接住網頁擷取與手動輸入：建立記憶體中的匯入工作階段、讓編輯器取得最近一次擷取、確認時更新唯一那份 Profile（Q8），並提供唯讀 `profile.get` 給複製按鈕。不含網頁來源的 AI 整理（P1-T080）。

## 範圍

### 包含

- `submit_resume_capture`：依順序配發區塊編號 b1、b2…，建立來源「網頁：<平台>」的工作階段（保存網址、擷取時間、截斷、`nameText`），不呼叫模型；與 PDF 共用最多 20 筆、超過丟最舊，只在記憶體（Q11）
- `import.latest_capture`：最近一次網頁擷取的 importId、平台、擷取時間、是否截斷，沒有回 null（被擠掉後也是 null）
- `import.start_manual`：沒有原文的工作階段
- `import.get`：網頁與手動來源的回應（網頁回區塊清單與截斷）；上限內最大的擷取對應的回應低於 1 MiB（測試證明）
- `import.confirm`（三種來源共用）：已有一份 Profile 就更新那一份（保留 id），沒有才新增，已有多份不寫入並回固定原因；舊段落對經歷規則不變
- `profile.get`：唯讀回唯一已確認 Profile 或 null，多份回固定原因
- `main.ts`：網頁擷取、手動輸入、`profile.get` 在有資料區時就可用，不以 PDF 選取器存在為前提（現行 `resumeImport` 只在有 PDF 選取器時組裝）

### 不包含

- 網頁來源的 AI 整理（P1-T080）
- 匯入暫存持久化（Q11＝只在記憶體）
- 多份 Profile 的選擇機制

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「匯入工作階段」
- `docs/specs/bridge.md`（import、profile 列與共同規則）
- P1-T074 完成結果；`apps/helper/src/handlers/import/`（`import-service.ts`、`confirm.ts`、`to-result.ts`）、`apps/helper/src/main.ts`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 非高風險：協調者收官閘門＋codex review；協調者稽核「更新唯一 Profile」不會新增第二份
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 擷取送達建立工作階段、不呼叫模型（假 provider 呼叫次數 0）；區塊編號依序配發；第 21 筆擠掉最舊後 `latest_capture` 與 `get` 行為正確
- 再次匯入並確認後資料區仍只有一份 Profile、id 不變；已有多份時不寫入
- 手動輸入在沒有任何擷取或 PDF 時也能建立並確認
- 上限內最大擷取的 `import.get` 回應序列化後低於 1 MiB
- 沒有 PDF 選取器時網頁擷取與 `profile.get` 仍可用

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
- 下一步：等 P1-T074 收官後改 ready
- Blocker：相依 P1-T074 未完成

## 完成結果
