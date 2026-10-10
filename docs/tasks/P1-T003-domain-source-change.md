---
id: P1-T003
phase: 1
status: done
depends_on: ["P1-T001"]
specs: ["evidence-model.md"]
track: domain
primary_repo: rolecraft
write_paths: ["packages/domain/src/source-change/", "packages/domain/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T003): domain：R2 來源變更判定"
---
# domain：R2 來源變更判定

## 目標

D4：來源改了，舊的確認不能照樣沿用。

## 範圍

### 包含

- 文件切區塊（標題或空行分隔）
- 新舊版本比對：引用片段所在區塊未變／有變／片段消失 → 對應事實項狀態
- 來源刪除或撤銷授權 → 來源已移除規則
- 同文件或跨文件矛盾標示的資料結構（矛盾偵測本身由 pipeline 判斷，這裡只處理標記與狀態）

### 不包含

- 重新分析流程（P1-T022）

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

- 純函式
- 遵守 `docs/specs/architecture.md` 模組規則（單檔 300 行、相依方向）

## 驗證

### 自動驗證

- S9-15 的四種情境各一組測試

### 手動驗證

- 無

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：`packages/domain/src/source-change/` 實作與測試；ADR-0006 第 2 項定案；`claim.ts` 只改 location 註解
- 已通過驗證：`npm run verify` 綠（Vitest 16 檔 127 測試，其中 source-change 49 個）
- 下一步：協調者收官前跑 E3 對抗驗證
- Blocker：無

## 完成結果

- 區塊切分（`blocks.ts`）：空行（只含空白類字元，含全形空白、NBSP、零寬字元）或 ATX 標題分隔，標題自成一塊；CRLF／CR→LF、去開頭 BOM，其餘原樣比對；指紋＝SHA-256(JSON [章節標題路徑, 區塊原文])，標題改字或區塊搬到別章節都算變更。SHA-256 自帶純函式（不用 node:、Web Crypto 只有非同步）。
- 片段位置（`location.ts`）：`tb1:<起始區塊序號>:<指紋,…>`，跨區塊依序列出；`createSourceExcerpt`／`locateExcerpt` 遇到片段出現在不同區塊時回 ambiguous，要求指定第幾次出現，不自行猜。
- 判定（`evaluate.ts`）：`checkExcerpt` → unchanged／block_changed／excerpt_missing／unverifiable（位置格式錯、同版本雜湊不同、版本倒退）／source_removed（刪除、已撤銷、待確認）；`evaluateClaimSources` 任一片段非 unchanged／source_removed → 待複核；全部 source_removed → 來源已移除；狀態只升不降；版本或雜湊變了的文件列入 `documentsToReanalyze`；缺來源現況丟錯不預設成移除。`isUsableForGeneration`：待複核、矛盾不可；來源已移除只有使用者確認過的可以。
- 矛盾標記（`conflict.ts`）：`SourceConflictMark`（跨文件／同文件、事實項、≥2 片段、說明）＋`applyConflictMarks`；標記不合法或指向不存在事實項丟錯。
- 已知限制：空行之後新增的更正、Setext 標題（`===`／`---` 底線）改字不會讓既有區塊變更，靠 `documentsToReanalyze` 觸發 pipeline 重新分析找矛盾（R2 原文設計）；矛盾解除（使用者確認）不在本 Task。

### 對抗驗證修正

- 重複區塊：同一文件有兩份標題路徑與原文都相同的區塊時，改、撤回或刪除被引用那份仍判沒變。位置升版 `tb2:<起始區塊序號>:<第幾份>/<共幾份>:<指紋,…>`：判定時相同指紋序列的份數不同 → 區塊有變；份數相同取第幾份，多於一份時起始序號也要相同（無法證明是同一份就待複核）。舊 `tb1` 視為第 0 份／共 1 份，新文件裡同序列超過一份即判區塊有變。ADR-0006 第 2 項與 `claim.ts` location 註解同步。
- 片段首尾換行／分隔字元：`createSourceExcerpt` 接受 `'完成登入\n'` 但同版本檢查永遠判區塊有變。新增 `normalizeExcerpt`（正規化後去掉首尾空白類字元），建立（存修剪後原文）與檢查都用它；舊資料原文帶首尾換行也能正確比對。
- 回歸測試：`adversarial.test.ts`（含 PoC：重複區塊改／撤回／刪被引用那份 → 待複核、不可生成；尾換行片段同版本 → 沒變）。
