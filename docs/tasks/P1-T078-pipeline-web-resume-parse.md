---
id: P1-T078
phase: 1
status: ready
depends_on: ["P1-T074"]
specs: ["resume-import.md", "evidence-model.md"]
track: pipeline
primary_repo: rolecraft
write_paths: ["packages/pipeline/src/resume-parse/", "packages/pipeline/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T078): pipeline：網頁區塊來源的去個資、提示與照抄檢查"
---

# pipeline：網頁區塊來源的去個資、提示與照抄檢查

## 目標

沿用 P1-T069 的 AI 整理，把來源單位從「頁-行」擴成網頁區塊：送模型前在本機去個資、提示帶區塊種類與標籤、照抄檢查以區塊為單位。PDF 路徑行為不變（除了共用的 512 KiB 草稿上限）。

## 範圍

### 包含

- 準備（resume-import「網頁來源的 AI 整理」去個資）：區塊依序當行；標籤＋值區塊以「標籤：值」判斷，個資標籤整塊移除、值預填；`continues` 的同標籤續行一併移除並接回同一列（預填與遮蔽用完整值）；聯絡區移除到下一個同級或更高級標題；已知姓名四個來源由呼叫端傳入（姓名元素文字先套 `cleanHeaderName`）、別名規則；既有 Profile 的聯絡值加入遮蔽；送出條件不成立（本次頁面姓名沒辨識出、也沒有使用者確認的姓名）→ 回明確拒絕原因、不產生提示
- 提示：區塊帶「[b12 h3]」「[b13 標籤=職務類別]」格式，整份在隨機界線資料區塊內；模型輸出來源編號依來源種類驗證（PDF `頁-行`、網頁 `b<數字>`），格式不對整份不合格
- 照抄檢查：值出自引用區塊；描述分段規則；標籤不算來源文字；「至今」獨占區塊時往前找日期上下文（略過只有分隔符的區塊、去結尾分隔符後整個是 `isDateValue`、中間無標題），上下文不列入引用
- 欄位值還原出姓名或個資時標旗標（W7）
- 通過檢查的草稿序列化後 UTF-8 超過 512 KiB 整份判失敗（PDF 與網頁共用）

### 不包含

- helper 接線、記憶體狀態、姓名從哪來（P1-T080）
- 編輯器
- 改 PDF 既有規則（P1-T069 的回歸測試全部照舊通過）

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-import.md`「AI 整理欄位」「網頁來源的 AI 整理」
- `docs/specs/evidence-model.md` R1
- P1-T069 完成結果（含各輪屬實項）；`packages/pipeline/src/resume-parse/`（`prepare.ts`、`personal.ts`、`redact.ts`、`labels.ts`、`match.ts`、`check.ts`、`output.ts`）

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資不送模型、R1 不捏造）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 提示字串不含姓名、電話、email、地址；含「姓名只在無標籤標題」案例；「林測試 Alex Lin」英文別名被遮蔽；分成多行（`continues`）的地址預填與遮蔽都是完整值；送出條件不成立時不產生提示
- 照抄：以區塊為來源的捏造被丟棄；切開的多行描述、「2019/03」「~」「至今」三個區塊被接受；「2020 年得獎作品」後接「至今」、中間隔標題的「至今」被丟棄；網頁來源編號用 `頁-行` 格式整份不合格
- 模型重複照抄同一大區塊、草稿超過 512 KiB 時整份失敗（PDF 也套用）
- P1-T069 既有回歸測試全部通過

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
- 下一步：等 P1-T074 收官後改 ready
- Blocker：無（相依 P1-T074 已於 2026-10-12 收官）

## 完成結果
