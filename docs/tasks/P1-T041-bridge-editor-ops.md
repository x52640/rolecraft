---
id: P1-T041
phase: 1
status: in_progress
depends_on: ["P1-T034"]
specs: ["bridge.md", "architecture.md"]
track: bridge
primary_repo: rolecraft
write_paths: ["packages/contracts/src/bridge/", "packages/contracts/src/index.ts", "apps/helper/src/bridge/", "apps/helper/src/handlers/", "docs/specs/bridge.md", "apps/extension/src/relay/"]
contract_change: additive
expected_commit: "feat(P1-T041): 橋接：編輯器頁面所需操作清單"
---

# 橋接：編輯器頁面所需操作清單

## 目標

編輯器各頁（P1-T019、T020、T021、T028、T030、T040）都要新增橋接操作。先一次定好操作清單與 schema、helper 分派先回 not_implemented，各頁 Task 才能平行只實作自己的 handler 而不互相衝突。

## 範圍

### 包含

- 在 contracts 新增編輯器頁面需要的操作（request／response schema）：職缺快照（列表、取得、手動貼上建立、修改、確認）；履歷 PDF 匯入（選檔、解析結果、逐欄校正、確認）；專案資料夾（新增資料夾＝helper 開原生選取器、列舉預覽、勾選授權、移除、增量待確認清單）；投遞紀錄（列表、建立、更新、刪除）；供應商狀態（三家狀態、Claude 模型候選與驗證、登入引導）；匯出（觸發匯出、取得匯出版本與 PDF 分塊）
- 每個操作在 helper 有一個 handler 檔，先回 `not_implemented`；分派表註冊完成
- content script 只能用職缺／訊息擷取操作；其餘只限擴充功能頁（relay 的 sender 規則更新）
- `bridge.md` 操作表更新（只寫語意）
- PDF 等大回應的分塊協定（用請求 id；分塊格式與上限）

### 不包含

- 各操作的實際邏輯（由各頁 Task 實作）

## 工作區與 Context

### 必讀入口

- `docs/specs/bridge.md`
- `docs/specs/architecture.md`
- 相依 Task 的完成結果；`docs/RESIDUALS.md` 相關條目

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- R7：任何 schema 不得有路徑、指令、CLI 參數類欄位；檔案只經 helper 原生選取器進入授權集合（ADR-0003），請求只帶不透明 ID
- 高風險（R7），收官前跑對抗驗證
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 各項有測試

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無

## 完成結果
