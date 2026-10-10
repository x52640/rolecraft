---
id: P1-T016
phase: 1
status: in_progress
depends_on: ["P1-T015"]
specs: ["architecture.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/", "apps/extension/"]
contract_change: none
expected_commit: "feat(P1-T016): editor：React 骨架與路由"
---
# editor：React 骨架與路由

## 目標

編輯器是所有校正與確認的介面。

## 範圍

### 包含

- Vite＋React＋TypeScript；以擴充功能頁面形式提供（或依 ADR-0003）
- 路由骨架：匯入、專案、事實項、職缺、履歷、投遞、設定
- 橋接客戶端 hook
- 元件按頁面分資料夾，單檔 300 行上限

### 不包含

- 各頁面功能

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/architecture.md`
- 相依 Task 的「完成結果」：P1-T015

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- UI 文字繁體中文
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 元件 smoke 測試（Vitest＋Testing Library）

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：React 骨架、hash 路由七頁、橋接客戶端 hook、extension 打包改用 apps/editor
- 已通過驗證：`npm run verify` 綠（Vitest 42 檔 583 測試，editor 3 檔 28）；`npm run build`；Chrome e2e 8/8
- 下一步：協調者收官
- Blocker：無

## 完成結果

- 結構：`apps/editor/index.html`＋`src/main.tsx`（入口）、`src/app/`（`App.tsx` 版面與導覽、`routes.ts` 路由表、`router.ts` hash 路由）、`src/pages/<頁>/`（import、projects、claims、jobs、resumes、applications、settings，各一個佔位頁）、`src/components/PagePlaceholder.tsx`、`src/bridge/`（`transport.ts`、`client.ts`、`BridgeProvider.tsx` 的 `useBridge()`）。新增頁面：建 `src/pages/<名稱>/` 後登記在 `routes.ts`。
- 路由：自寫 hash 路由（`#/jobs`），未引入 react-router；空 hash 顯示匯入頁，未知路徑顯示「找不到這個頁面」。擴充功能頁是靜態檔，只能用 hash。
- 橋接 hook：`useBridge().send(request)` → 用 contracts `BridgeRequest` 驗 → `chrome.runtime.sendMessage({ channel: 'rolecraft.bridge', request })` 交給 service worker → 用 `BRIDGE_SCHEMAS[op].response` 再驗回應。任何失敗回 `BridgeFailure`、不丟例外；不在擴充功能頁（無 `chrome.runtime.id`）回 `internal_error`。測試可對 `App`／`BridgeProvider` 注入假 `transport`。
- 打包（擇一：extension 打包時一起打包 editor）：`apps/extension/scripts/build.mjs` 呼叫 `apps/editor/scripts/build.mjs` 的 `buildEditor()`，輸出到 `dist/unpacked/editor/`（`base: './'`，對應 `EDITOR_PAGE`）。刪除 extension 的佔位頁 `src/editor/`。單獨檢查 editor 打包：`node apps/editor/scripts/build.mjs` → `apps/editor/dist/web/`。JSX 由 Vite 內建轉換（tsconfig `jsx: react-jsx`），未裝 `@vitejs/plugin-react`。
- 依賴（apps/editor）：react、react-dom 19；dev：@types/react、@types/react-dom、@testing-library/react、jsdom、vite。
- 測試：根 `vitest.config.ts` 只收 `*.test.ts`（不在 write_paths），所以元件測試寫成 `.test.ts`＋`createElement`，檔頭 `// @vitest-environment jsdom`。
- Chrome e2e（`apps/extension/scripts/chrome-e2e.mjs`）：佔位頁檢查改成「React 載入並顯示匯入頁、導覽 7 項」與「hash 路由切到職缺頁」，共 8 項全過。
- 待裁定／後續：
  - 轉送通道名 `rolecraft.bridge` 在 editor（`src/bridge/transport.ts`）與 extension（`src/relay/messages.ts`）各一份（editor 不能 import extension）；應移到 contracts（contract_change）。
  - 根 `vitest.config.ts` 若要收 `*.test.tsx`，需另開 Task 改。

