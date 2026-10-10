---
id: P1-T024
phase: 1
status: blocked
depends_on: ["P1-T022", "P1-T019"]
specs: ["resume-output.md", "evidence-model.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/generation/", "packages/pipeline/src/index.ts", "packages/contracts/src/entities/resume-version.ts"]
contract_change: none
expected_commit: "feat(P1-T024): pipeline：職缺匹配與段落生成"
---
# pipeline：職缺匹配與段落生成

## 目標

F07：對照職缺產生有引用的履歷段落。

## 範圍

### 包含

- 匹配：職缺需求 ↔ 已確認事實項，產出能力、證據、待補資訊
- 段落生成：每段附引用事實項與宣稱完成程度；公司、職稱、日期由 Profile 帶入不交給模型
- 修改理由簡述

### 不包含

- UI、PDF

## 工作區與 Context

### 必讀入口

- `plan.md`（只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`
- `docs/specs/evidence-model.md`
- 相依 Task 的「完成結果」：P1-T022
- 相依 Task 的「完成結果」：P1-T019

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 只用可用狀態的事實項（R1、R2）
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- fake provider 測試；R1 檢查整合

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
- Blocker：等待相依：P1-T022、P1-T019

## 完成結果
