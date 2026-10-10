---
id: P1-T031
phase: 1
status: blocked
depends_on: ["P1-T030", "P1-T018"]
specs: ["providers.md", "acceptance.md"]
track: infra
primary_repo: rolecraft
write_paths: ["packaging/macos/", "scripts/release/"]
contract_change: none
expected_commit: "feat(P1-T031): macOS 安裝包與乾淨環境測試"
---
# macOS 安裝包與乾淨環境測試

## 目標

D10、S9-16：一般使用者不需打終端指令。

## 範圍

### 包含

- 自帶 Node runtime 的 helper 打包
- Native Messaging host 註冊（Chrome、Arc、Edge）
- 擴充功能載入方式（自用，D17）說明
- 乾淨環境測試腳本與步驟

### 不包含

- Windows（D11）
- 商店上架

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/providers.md`
- `docs/specs/acceptance.md`
- 相依 Task 的「完成結果」：P1-T030
- 相依 Task 的「完成結果」：P1-T018

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 安裝不得要求使用者設金鑰或打指令
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- 打包腳本可重跑

### 手動驗證

- 擁有者在乾淨使用者帳號跑一次安裝

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：尚未開始
- 已通過驗證：無
- 下一步：讀必讀入口後開工
- Blocker：等待相依：P1-T030、P1-T018；需擁有者：在乾淨 macOS 使用者帳號跑安裝測試

## 完成結果
