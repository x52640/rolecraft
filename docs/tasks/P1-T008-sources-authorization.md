---
id: P1-T008
phase: 1
status: in_progress
depends_on: ["P1-T001"]
specs: ["sources-and-authorization.md"]
track: sources
primary_repo: rolecraft
write_paths: ["packages/sources/"]
contract_change: none
expected_commit: "feat(P1-T008): sources：資料夾列舉、授權集合與安全讀檔"
---
# sources：資料夾列舉、授權集合與安全讀檔

## 目標

D5：只讀使用者確認過的文字文件。

## 範圍

### 包含

- 列舉資料夾（只取檔名、大小、類型），排除相依、建置產物、憑證、大型檔、原始碼副檔名
- 文件優先序（README、CLAUDE.md、AGENTS.md、plan、規格、task 等，大小寫不敏感）
- 授權集合管理：待確認／已授權／已撤銷
- 安全讀檔：realpath 仍在資料夾內、一般檔、符合類型；不跟隨外部 symlink；每次讀取記錄路徑、時間、雜湊
- 增量列舉：新檔標待確認

### 不包含

- 資料夾選取 UI 與選取機制（依 P1-T013 ADR）

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/sources-and-authorization.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 讀檔介面只接受授權集合內的項目 ID，不接受任意路徑
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- S9-14 每個子句一個測試（用暫存資料夾與 symlink）

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
