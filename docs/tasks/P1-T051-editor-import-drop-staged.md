---
id: P1-T051
phase: 1
status: done
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

- [x] 「包含」各項完成
- [x] `npm run verify` 綠
- [x] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：拿掉匯入頁「暫存校正」按鈕與 `import.save_corrections` 呼叫，加上「存入前離開頁面，修改不會保留」提醒
- 已通過驗證：`npm run verify` 全綠
- 下一步：擁有者確認後把狀態改成 done
- Blocker：無

## 完成結果

- 匯入頁核對畫面拿掉「暫存校正」按鈕；編輯器不再送 `import.save_corrections`，只剩「確認並寫入個人資料」（即存入 Profile）。contracts 與 helper 的對應操作保留不動。
- 原本只給暫存用的提示狀態（notice）一併移除，`submit` 不再分暫存／確認兩條路。
- 核對畫面新增提醒「存入前離開頁面，修改不會保留。」（`role="note"`、標籤「尚未存入提醒」）。原頁面沒有其他提到暫存的說明文字。
- 測試：`ImportPage.test.ts` 把舊的暫存測試換成新測試，檢查畫面上沒有任何「暫存」字樣、有離開提醒、確認時只送 `import.confirm` 不送 `save_corrections`；先跑過確認新測試會失敗再實作。
- 手動驗證：無（Task 標示不需要）。
