---
id: P1-T053
phase: 1
status: in_progress
depends_on: []
specs: ["evidence-model.md", "sources-and-authorization.md"]
track: domain
primary_repo: rolecraft
write_paths: ["docs/specs/evidence-model.md", "packages/domain/src/source-change/", "packages/pipeline/src/analysis/plan.ts", "packages/pipeline/src/analysis/plan.test.ts", "packages/contracts/src/entities/claim.ts", "packages/contracts/src/entities/entities.test.ts", "packages/storage/src/repositories/", "packages/storage/src/migrations/", "packages/storage/src/migrate.test.ts"]
contract_change: additive
expected_commit: "feat(P1-T053): 事實項：重新授權且內容未變時恢復原狀態"
---

# 事實項：重新授權且內容未變時恢復原狀態

## 目標

實作擁有者 2026-10-11 的裁定（見 docs/CURRENT_TASK.md「擁有者已裁定」）。

## 範圍

### 包含

- 擁有者裁定 #15：文件撤銷授權後事實項變成 source_removed；之後重新授權同一來源、內容指紋（hash）與撤銷前相同時，事實項自動恢復成撤銷前的複核狀態，不呼叫模型。先在 evidence-model.md 補這條規則（只適用「僅因撤銷而變 source_removed」的事實項；撤銷期間文件內容變了、或事實項另有其他來源問題就不恢復）
- 若目前資料沒保存撤銷前的狀態，用最小、加法式的方式保存（contract_change additive），並說明舊資料（沒有保存值的）一律不恢復

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
- 高風險（R1、R2），收官前跑對抗驗證
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

