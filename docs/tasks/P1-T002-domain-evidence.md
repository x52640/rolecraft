---
id: P1-T002
phase: 1
status: in_progress
depends_on: ["P1-T001"]
specs: ["evidence-model.md"]
track: domain
primary_repo: rolecraft
write_paths: ["packages/domain/src/evidence/", "packages/domain/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T002): domain：事實項狀態與 R1 匯出前檢查"
---
# domain：事實項狀態與 R1 匯出前檢查

## 目標

D4、D14：履歷不能把沒確認的事寫成已完成，這是產品的核心承諾。

## 範圍

### 包含

- 三種使用者動作（接受修改稿／確認事實項／逐段確認）的狀態轉換
- R1 匯出前檢查 1–3：引用存在、宣稱完成程度合法（D14）、數字有出處
- 引用編輯規則：只能增加引用，移除引用只能整段刪除
- 檢查結果結構化回傳（哪段、哪條、原因）

### 不包含

- I/O、UI、模型呼叫

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T001

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 純函式；不得 import node: 模組
- 數字擷取要處理中文與全形數字、百分比、年份
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 逐條對照 S9-7 寫測試：計畫中／未知／待複核／來源矛盾不能寫成已完成；文件標示完成未確認不能寫成已完成；無引用段落須逐段確認；移除引用被拒

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
