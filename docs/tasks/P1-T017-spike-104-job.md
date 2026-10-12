---
id: P1-T017
phase: 1
status: ready
depends_on: ["P1-T015"]
specs: ["jobs-and-messages.md", "open-verifications.md"]
track: extension
primary_repo: rolecraft
write_paths: ["docs/adr/0004-104-job-page.md", "apps/extension/src/sites/104/fixtures/", "docs/specs/open-verifications.md"]
contract_change: none
expected_commit: "docs(P1-T017): 驗證：104 職缺頁條款與 DOM 樣本"
---
# 驗證：104 職缺頁條款與 DOM 樣本

## 目標

D16：104 職缺頁是首版發布門檻。

## 範圍

### 包含

- 查 104 使用條款對個人擴充功能讀取已開啟頁面的規範（只記錄查到的原文與網址，不推論）
- 擁有者在已登入狀態開數個代表性職缺頁，存去識別化 DOM 樣本作回歸 fixture
- （2026-10-12 擁有者加入）同時查條款是否允許讀取使用者自己的 104 履歷頁；擁有者存一份自己履歷頁的去識別化 DOM 樣本，供之後「讀 104 履歷頁匯入」使用
- 對照 R10 列出必要欄位的定位方式
- 投遞流程能否附自訂 PDF（D20）

### 不包含

- 擷取實作

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/jobs-and-messages.md`
- `docs/specs/open-verifications.md`
- 相依 Task 的「完成結果」：P1-T015

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 樣本去識別化；不擷取 cookie
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 無

### 手動驗證

- 擁有者開啟職缺頁協助存樣本

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：無；手動驗證需擁有者：登入 104、開幾個職缺頁協助存樣本

## 完成結果
