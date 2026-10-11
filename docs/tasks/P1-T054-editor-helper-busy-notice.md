---
id: P1-T054
phase: 1
status: in_progress
depends_on: []
specs: ["bridge.md"]
track: editor
primary_repo: rolecraft
write_paths: ["apps/editor/src/"]
contract_change: none
expected_commit: "feat(P1-T054): 編輯器：helper 被另一個瀏覽器占用時顯示提示"
---

# 編輯器：helper 被另一個瀏覽器占用時顯示提示

## 目標

擁有者裁定 #13：第二個瀏覽器連上時要告知「RoleCraft 正在另一個瀏覽器使用中」。P1-T052 已讓 helper 對需要儲存的操作回 `helper_unavailable` 加這句固定訊息，但編輯器多處把 `helper_unavailable` 改寫成自己的文字，使用者看不到。

## 範圍

### 包含

- 編輯器各頁遇到 `helper_unavailable` 時，若訊息是 helper 的「正在另一個瀏覽器使用中」固定訊息，就顯示該訊息；其餘情況維持原本的「連不到本機輔助程式」類文字。比對用一個共用常數（放在編輯器內，不改 contracts），不要逐頁複製字串
- 各頁現有對 `helper_unavailable` 的對照（例如 pages/messages/labels.ts、pages/projects/failure-text.ts、pages/jobs/labels.ts、pages/import/ImportPage.tsx）一併處理

### 不包含

- contracts、helper、擴充功能

## 工作區與 Context

### 必讀入口

- `docs/specs/bridge.md` 錯誤碼一節

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 每頁至少一個測試：helper 占用訊息會顯示、一般 helper_unavailable 文字不變
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 上述測試

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

