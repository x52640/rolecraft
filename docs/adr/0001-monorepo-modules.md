# ADR-0001 monorepo 與模組邊界

- 日期：2026-10-10
- 狀態：採用
- 相關：plan.md E1；`docs/specs/architecture.md`「模組切分」

## 背景

擁有者要求程式模組化、不能集中在單一檔案（E1）。產品有三個執行端（擴充功能、編輯器、本機輔助程式），共用資料物件與橋接訊息。

## 決定

- npm workspaces（本機沒有 pnpm，不為此加裝全域工具）。
- 共用型別與橋接 schema 集中在 `packages/contracts`，當作序列化點；改它的 Task 要標 `contract_change`。
- 規則邏輯（R1、R2、R8、R9）放 `packages/domain`，不碰 I/O，好測。
- 單檔 300 行上限與相依方向用 ESLint 強制，不靠自覺。
- SQLite 用 Node 內建 `node:sqlite`，避免原生模組編譯問題（D10 安裝不能要求使用者處理編譯）。

## 代價

- 套件多，初期設定成本較高。
- `node:sqlite` 綁定 Node 版本；安裝包要自帶 Node runtime（P1-T031 處理）。
