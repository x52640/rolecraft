---
id: P1-T015
phase: 1
status: blocked
depends_on: ["P1-T013", "P1-T001"]
specs: ["jobs-and-messages.md", "bridge.md"]
track: extension
primary_repo: rolecraft
write_paths: ["apps/extension/"]
contract_change: none
expected_commit: "feat(P1-T015): extension：MV3 骨架與橋接客戶端"
---
# extension：MV3 骨架與橋接客戶端

## 目標

擴充功能是職缺擷取的入口。

## 範圍

### 包含

- MV3 manifest、背景 service worker、Vite 打包
- 橋接客戶端（contracts schema）
- 工具列動作：開啟編輯器分頁
- 逐站 content script 的註冊架構（每站一個資料夾，104 先佔位）

### 不包含

- 任何站的擷取邏輯

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
- `docs/specs/bridge.md`
- 相依 Task 的「完成結果」：P1-T013
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 權限最小化：只在使用者觸發時注入（activeTab／scripting），不宣告全站 host 權限
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 打包成功；manifest 單元檢查

### 手動驗證

- Chrome 載入未封裝擴充功能，按鈕能開編輯器

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：等待相依：P1-T013、P1-T001

## 完成結果
