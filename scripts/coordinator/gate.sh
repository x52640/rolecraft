#!/bin/zsh
# 用法：gate.sh <TaskID> <sha> <scope-regex>
# 合併工作者 commit → 範圍稽核 → task:index → verify。不收官（收官另跑 close.sh）。
set -u
ID=$1; SHA=$2; SCOPE=$3
cd "/Users/remus/My Programs/Codex/rolecraft"
[ -n "$(git diff --name-only --diff-filter=U)" ] || true
if ! git cherry-pick $SHA >/dev/null 2>&1; then
  U=$(git diff --name-only --diff-filter=U)
  if echo "$U" | grep -qx 'package-lock.json'; then git checkout --ours package-lock.json; npm install --silent >/dev/null 2>&1; git add package-lock.json; U=$(echo "$U" | grep -vx 'package-lock.json'); fi
  if echo "$U" | grep -q 'docs/adr/0006'; then python3 scripts/coordinator/resolve_adr.py docs/adr/0006-contracts-interim-fields.md; git add docs/adr/0006-contracts-interim-fields.md; U=$(echo "$U" | grep -v 'docs/adr/0006'); fi
  # 只有套件入口 index.ts 的 export 行衝突時，兩邊都保留（union）
  if [ -z "$U" ] || ! echo "$U" | grep -qvE '/src/index\.ts$'; then
    for f in ${(f)U}; do sed -i '' -E '/^(<<<<<<<|=======|>>>>>>>)/d' $f; git add $f; done
    GIT_EDITOR=true git cherry-pick --continue >/dev/null || { echo "CONTINUE-FAILED"; exit 2; }
    echo "auto-union: $U"
  else
    echo "CONFLICT:"; echo "$U"; exit 2
  fi
fi
OUT=$(git show --name-only --format= HEAD | grep -vE "$SCOPE|^docs/tasks/$ID-|^package-lock.json$")
[ -n "$OUT" ] && { echo "OUT-OF-SCOPE:"; echo "$OUT"; } || echo "scope-ok"
npm install --silent >/dev/null 2>&1
npm run task:index >/dev/null 2>&1
npm run verify > /tmp/rolecraft-verify.log 2>&1; RC=$?
grep -E "Tests |ℹ (pass|fail)|verify:docs 通過|✖|error TS" /tmp/rolecraft-verify.log | tail -6
echo "VERIFY_EXIT=$RC"
