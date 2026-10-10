export const meta = {
  name: 'adversarial-verify-task',
  description: 'Adversarial review (2 lenses) + verify (2) of one high-risk RoleCraft task commit',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
};

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          rule: { type: 'string' },
          scenario: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
        },
        required: ['title', 'file', 'rule', 'scenario', 'severity'],
      },
    },
  },
  required: ['findings'],
};
const VERDICTS = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          real: { type: 'boolean' },
          evidence: { type: 'string' },
          fix_hint: { type: 'string' },
        },
        required: ['title', 'real', 'evidence', 'fix_hint'],
      },
    },
  },
  required: ['verdicts'],
};

const { taskId, commit, repo, scratch, specs, lenses } = args;
const common = `RoleCraft 專案（${repo}，主分支已含 commit ${commit}，即 Task ${taskId}）。
先讀 ${repo}/docs/tasks/ 下 ${taskId} 的 Task 檔，以及這些 spec：${specs.join('、')}（在 ${repo}/docs/specs/）。用 \`git -C "${repo}" show ${commit}\` 看改動。
**不准修改 repo 內任何檔案、不准 git 寫入。** 需要寫 PoC 測試或暫存檔只能放 ${scratch}（自己建子目錄），從那裡 import repo 內原始碼執行（Node 26 可直接跑 .ts，或用 repo 的 npx vitest --root 指到 scratch 子目錄）。`;

const results = await pipeline(
  lenses,
  (lens) =>
    agent(
      `${common}

你的角色：攻擊者。從這個角度找能繞過 spec 規則的方法：${lens}
只回報你相信真的能繞過、或實作違反 spec 的問題；每項要有具體情境（輸入、步驟、會發生什麼）。風格、命名、可讀性一律不報。沒有就回空陣列。`,
      { label: `review:${taskId}`, phase: 'Review', schema: FINDINGS },
    ),
  (review, lens) => {
    const list = review?.findings ?? [];
    if (!list.length) return { lens, verdicts: [] };
    return agent(
      `${common}

另一位審查者宣稱以下問題成立。你的角色：懷疑者。逐項**嘗試證明它不成立**；能寫 PoC 就寫並實際執行，以執行結果為準。無法重現或前提錯誤就 real=false；不確定時 real=false 並在 evidence 說明。成立的附 fix_hint。

${JSON.stringify(list, null, 2)}`,
      { label: `verify:${taskId}`, phase: 'Verify', schema: VERDICTS },
    ).then((v) => ({ lens, findings: list, verdicts: v?.verdicts ?? [] }));
  },
);
return results;
