---
id: P1-T042
phase: 1
status: ready
depends_on: []
specs: ["architecture.md"]
track: readme
primary_repo: rolecraft
write_paths: ["README.md", "CONTRIBUTING.md"]
contract_change: none
expected_commit: "feat(P1-T042): README 與開源說明文件"
---

# README 與開源說明文件

## 目標

專案已開源（MIT），需要一份讓陌生人看懂專案目的、現況、怎麼跑測試與參與規則的 README。

## 範圍

### 包含

- README：一句話定位（同 GitHub 簡介）、核心原則（只用既有訂閱、事實有出處、本機執行、不自動送出）、目前狀態（開發中；已完成與未完成清單，誠實標示 Codex／Antigravity 未支援、104 擷取未完成）、架構圖（文字）、開發指令（npm install、npm run verify、build）、文件導覽（plan.md、docs/README.md、docs/specs）、授權
- CONTRIBUTING：冷啟動協定摘要（指向 CLAUDE.md／docs/README.md）、一 Task 一 commit、verify 閘門、不得提交個人資料與金鑰

### 不包含

- 網站、徽章服務

## 工作區與 Context

### 必讀入口

- `docs/specs/architecture.md`
- 相依 Task 的完成結果；`docs/RESIDUALS.md` 相關條目

### 不應載入

- `Spec.md`、`docs/spec-discussions/`

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 繁體中文為主；不得宣稱尚未驗證的功能可用（S9-3）；不要重抄 spec，只指向
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
