#!/bin/zsh
# 用法：close.sh <TaskID> <worktree-agent-id> [解鎖的 TaskID...]
# 收官：task:close → 待補 codex 清單 → 移除 worktree → 解鎖 → commit。
set -u
ID=$1; AG=$2; shift 2
cd "/Users/remus/My Programs/Codex/rolecraft"
H=$(git log --format='%h %s' | grep -E "^[0-9a-f]+ [a-z]+\($ID\): " | grep -v "收官" | cut -d' ' -f1 | tail -r | sed 's/.*/`&`/' | paste -sd'、' -)
R=$(npm run task:close -- $ID 2>&1); echo "$R" | tail -2; echo "$R" | grep -q "完成（status → done" || { echo "CLOSE-FAILED"; exit 3; }
python3 - "$ID" "$H" <<'PY'
import sys,re
p='docs/REVIEW_QUEUE.md'; s=open(p).read().rstrip('\n')
s=s+f"\n- {sys.argv[1]} {sys.argv[2]}\n"
open(p,'w').write(s)
PY
git worktree remove --force .claude/worktrees/agent-$AG 2>/dev/null; git branch -D worktree-agent-$AG >/dev/null 2>&1
for T in "$@"; do f=$(ls docs/tasks/$T-*.md); sed -i '' -e '1,/^status: /s/^status: blocked$/status: in_progress/' -e 's/^- Blocker：等待相依：[^；]*；需擁有者：/- Blocker：無；手動驗證需擁有者：/' -e 's/^- Blocker：等待相依：.*$/- Blocker：無/' $f; done
npm run task:index >/dev/null && npm run verify:docs 2>&1 | tail -1
git add -A && git commit -q -m "docs($ID): 收官${*:+；開 $*}

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" && git log --oneline | head -1
