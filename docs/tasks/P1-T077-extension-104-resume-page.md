---
id: P1-T077
phase: 1
status: blocked
depends_on: ["P1-T017", "P1-T075", "P1-T076"]
specs: ["web-resume-capture.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/src/sites/104/resume/", "apps/extension/src/sites/registry.ts", "apps/extension/src/sites/registry.test.ts", "docs/adr/0004-104-job-page.md"]
contract_change: none
expected_commit: "feat(P1-T077): extension：登記 104 履歷頁並以真實 Chrome 比對 fixture 區塊"
---

# extension：104 履歷頁登記與 fixture 比對

## 目標

把 104 履歷頁接上共用流程：依 P1-T017 的履歷頁樣本決定窄網址規則、本文根節點、姓名元素（Q2），並以含樣式的 fixture 在真實 Chrome 比對預期區塊。這是「104 可用」三個條件之一（resume-import「匯入入口與來源」）。

## 範圍

### 包含

- Q2 提案並記入 ADR-0004 第 5 節：讀哪一種頁（預覽／編輯）、網址規則（窄到只符合那一種頁，不與 `/job/` 重疊）、根節點選擇器、姓名元素選擇器（樣本驗證不到就不登記）、收合未展開的內容是否存在
- registry 為 104 加履歷頁設定；`src/sites/104/resume/content.ts` 入口呼叫 P1-T075 的共用流程
- 預期區塊檔（放在本 Task 目錄）＋真實 Chrome 測試：載入 P1-T017 的履歷頁 fixture，抽出的區塊與預期逐項相符（與現有 Chrome 測試同一類，需環境變數）
- 條款：照 D27（104 會員規約沒有明文禁止讀自己的履歷頁，擁有者裁定照常開放），在 ADR-0004 引用即可，不重查

### 不包含

- 改 fixture 本身或去識別化（P1-T017 負責）
- 共用抽取規則（P1-T075）
- 擁有者真實帳號實跑（P1-T087 的開工條件）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/web-resume-capture.md`「頁型登記」「區塊抽取規則」「驗收」
- `docs/adr/0004-104-job-page.md`（第 1、5 節）、P1-T017 完成結果與履歷頁 fixture（`apps/extension/src/sites/104/fixtures/` 下的 resume 檔）
- P1-T075、P1-T076 完成結果

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 非高風險：協調者收官閘門＋codex review（fixture 去識別化由 P1-T017 負責；本 Task 不得把真實個資寫進預期區塊）
- write_paths 與 P1-T018 的 `apps/extension/src/sites/104/` 前綴重疊：兩者不可同時跑
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 真實 Chrome：fixture 區塊與預期逐項相符（含截斷與否、`continues`、姓名元素文字）
- registry：104 履歷頁網址規則符合樣本網址、不符合職缺頁與 104 其他頁；與職缺頁規則不重疊

### 手動驗證

- 協調者設好 Chrome 測試所需環境變數實跑一次

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等相依完成後改 ready
- Blocker：相依未完成。只依賴 P1-T017 的「履歷頁部分」（ADR-0004 第 5 節與履歷頁 fixture）；若 P1-T017 因 D20 投遞流程、條款頁 403 等其他項仍 in_progress，履歷頁部分完成後協調者可改 ready

## 完成結果
