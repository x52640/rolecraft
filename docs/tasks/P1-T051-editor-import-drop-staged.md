---
id: P1-T051
phase: 1
status: in_progress
depends_on: []
specs: ["bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/pages/import/"]
contract_change: none
expected_commit: "feat(P1-T051): 編輯器：拿掉匯入頁「暫存校正」按鈕"
---

# 編輯器：拿掉匯入頁「暫存校正」按鈕

## 目標

實作擁有者 2026-10-11 的裁定（見 docs/CURRENT_TASK.md「擁有者已裁定」）。

## 範圍

### 包含

- 擁有者裁定 #12：匯入頁的「暫存校正」只存在 helper 記憶體、讀不回來，等於假承諾。拿掉這顆按鈕與對應的編輯器呼叫，只留「存入 Profile」。contracts 與 helper 的 `import.save_corrections`（或同等操作）保留不動，只是編輯器不再呼叫
- 頁面說明文字若提到暫存，一併改成「存入前離開頁面，修改不會保留」

### 不包含

- 其他待裁定項目

## 工作區與 Context

### 必讀入口

- specs 欄位列的 spec；docs/CURRENT_TASK.md「擁有者已裁定」

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每項附測試（先寫會失敗的測試再實作）
- 低風險，不跑對抗驗證
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 每項都有測試

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：
- 已通過驗證：
- 下一步：
- Blocker：無

## 完成結果

