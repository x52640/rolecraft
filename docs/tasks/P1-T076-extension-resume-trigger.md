---
id: P1-T076
phase: 1
status: ready
depends_on: ["P1-T074"]
specs: ["web-resume-capture.md", "bridge.md", "jobs-and-messages.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/src/background/", "apps/extension/src/relay/", "apps/extension/src/manifest.ts", "apps/extension/src/manifest.test.ts", "apps/extension/src/sites/registry.ts", "apps/extension/src/sites/registry.test.ts", "apps/extension/scripts/build.mjs", "packages/contracts/src/bridge/operations.ts"]
contract_change: additive
expected_commit: "feat(P1-T076): extension：履歷頁點圖示擷取、快捷鍵依頁型注入、操作×頁型發送者驗證"
---

# extension：點圖示／快捷鍵依頁型觸發與發送者驗證

## 目標

D9：在登記的履歷頁點工具列圖示就擷取、其他頁面照舊開編輯器；快捷鍵依頁型注入對應腳本；service worker 按「操作×頁型」驗證發送者，履歷擷取成功後開編輯器分頁。不加任何權限。

## 範圍

### 包含

- registry：站設定相加「履歷頁」（網址規則、根節點選擇器、選填姓名元素選擇器）；依網址回傳站與頁型（職缺頁／履歷頁／都不是）；同一站兩種規則不得重疊（測試擋）。104 的履歷頁規則不在這裡加（P1-T077），測試用注入的假 registry
- 打包：有登記履歷頁的站另打包一支履歷頁腳本（入口 `src/sites/<platform>/resume/content.ts`，輸出比照現行 `sites/<platform>.js` 另取檔名），職缺頁、履歷頁兩支分開
- 點圖示（`chrome.action.onClicked`）：分頁網址符合履歷頁 → 只注入主框架的履歷頁腳本；其他（含職缺頁、不支援、拿不到分頁或網址）→ 開編輯器、不注入
- 快捷鍵：履歷頁、職缺頁各注入對應腳本；都不符 → 圖示提示「不是支援的職缺頁或履歷頁」、不注入
- 注入失敗（圖示或快捷鍵）→ 不開編輯器，用 `showTabNotice` 的徽章與提示文字提示（取代現行只寫主控台）
- relay：`CONTENT_SCRIPT_OPERATIONS` 加 `submit_resume_capture`；`authorizeSender` 改成操作×頁型——職缺／訊息擷取只在職缺頁規則、履歷擷取只在履歷頁規則，都要主框架、平台相符；履歷擷取的 `url` 必須等於發送頁的 origin＋路徑
- 履歷擷取轉送後 helper 回成功（含截斷）→ service worker 開一個編輯器分頁；失敗照回給 content script，不開編輯器
- 說明文字：圖示提示文字、擴充功能說明、快捷鍵說明改成講清楚兩種行為；manifest 權限、無 host 權限、無 popup 照舊

### 不包含

- 區塊抽取與頁面提示（P1-T075）
- 任何站的實際履歷頁規則（P1-T077）
- 點圖示擷取職缺頁、依頁面變換圖示、新增任何權限
- 104 職缺擷取（P1-T018）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/web-resume-capture.md`「頁型登記」「觸發」「擷取結果」「發送者驗證」
- `docs/specs/bridge.md`「誰可以呼叫」
- P1-T074 完成結果；`apps/extension/src/background/`、`relay/sender.ts`、`relay/handler.ts`、`sites/registry.ts`、`manifest.ts`、`scripts/build.mjs`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（R7 發送者授權與擴充功能權限）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 與 P1-T018（write_paths 含 `packages/contracts/src/bridge/`）不可同時跑
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 觸發：點圖示時履歷頁 → 注入履歷頁腳本；職缺頁、不支援網站、沒有分頁或網址 → 開編輯器、不注入。快捷鍵：兩種頁各注入對應腳本，都不符只提示、不注入；注入失敗兩種觸發都只提示、不開編輯器
- 授權：操作與頁型錯配、`url` 與發送頁不符（含多了查詢字串）、非主框架、平台不符都被拒；職缺／訊息擷取在職缺頁照舊通過
- 履歷擷取成功開一個編輯器分頁；helper 失敗不開
- registry 同站兩種規則重疊時測試失敗；manifest 測試照舊（三個權限、無 host、無 popup）

### 手動驗證

- 無（真實頁面在 P1-T077 與 P1-T087 的擁有者實跑）

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：等 P1-T074 收官後改 ready
- Blocker：無（相依 P1-T074 已於 2026-10-12 收官）

## 完成結果
