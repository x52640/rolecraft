---
id: P1-T010
phase: 1
status: in_progress
depends_on: ["P1-T001"]
specs: ["providers.md"]
track: providers
primary_repo: rolecraft
write_paths: ["packages/providers/src/core/", "packages/providers/src/fake/", "packages/providers/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T010): providers：適配介面、環境清理與 R6 紀錄"
---
# providers：適配介面、環境清理與 R6 紀錄

## 目標

D2、D12：每次執行前都要證明走的是訂閱，不會掉進 API key 計費。

## 範圍

### 包含

- ProviderAdapter 介面：偵測安裝、登入狀態、可用模型、執行（僅純文字輸入輸出）、取消、錯誤分類（額度／暫時性／其他）
- 子程序環境清理：移除已知 API key 與雲端計費環境變數（清單集中一處）
- R6 確認流程框架與 RunCheckRecord 產生
- 狀態「尚未支援」的表示方式
- fake adapter 供其他套件測試

### 不包含

- 任何真實 CLI 呼叫（P1-T012）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/providers.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 子程序啟動一律用參數陣列，不經 shell；參數只由程式常數組成，不接受外部內容
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 環境清理測試；R6 任一項不成立就不執行的測試；fake adapter 的額度錯誤路徑

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
