# 協調者工具

多 agent 平行開發時，協調者收官用的腳本（從 repo 根執行）。

- `gate.sh <TaskID> <commit> '<範圍正規式>'`：把工作者 worktree 的 commit cherry-pick 進 main → 範圍稽核 → task:index → `npm run verify`。自動處理 `*/src/index.ts` 匯出行、`package-lock.json`、ADR-0006 表格的衝突；其他衝突會停下。不收官。
- `close.sh <TaskID> <worktree-agent-id> [解鎖的 TaskID...]`：`task:close` → 在 `docs/REVIEW_QUEUE.md` 加待審 commit → 移除 worktree 與分支 → 解鎖並開工指定 Task → commit。`task:close` 失敗就停。
- `adversarial-verify.workflow.js`：高風險 Task 的對抗驗證（plan.md E3：2 review＋2 verify）。用 Workflow 工具的 `scriptPath` 執行，`args` 給 `{taskId, commit, repo, scratch, specs[], lenses[2]}`。
