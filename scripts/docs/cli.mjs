// 文件閘門 CLI：verify | index | close <ID>。由 package.json 的 verify:docs、task:index、task:close 呼叫。
import path from 'node:path';
import process from 'node:process';

import { verifyDocs } from './checks.mjs';
import { closeTask } from './close.mjs';
import { writeIndex } from './index-gen.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const out = (line) => process.stdout.write(`${line}\n`);
const fail = (title, errors) => {
  process.stderr.write(`${title}\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exitCode = 1;
};

const [command, arg] = process.argv.slice(2);

if (command === 'verify') {
  const errors = verifyDocs(ROOT);
  if (errors.length) fail(`verify:docs 失敗（${errors.length} 項）`, errors);
  else out('verify:docs 通過');
} else if (command === 'index') {
  const changed = writeIndex(ROOT);
  out(changed.length ? `task:index 已更新：${changed.join('、')}` : 'task:index 無變動');
} else if (command === 'close') {
  if (!arg) fail('用法：npm run task:close -- <Task ID>', []);
  else {
    const { ok, errors } = closeTask(ROOT, arg);
    if (ok) out(`task:close ${arg} 完成（status → done，index 已更新，verify:docs 通過）`);
    else fail(`task:close ${arg} 失敗`, errors);
  }
} else {
  fail('用法：node scripts/docs/cli.mjs verify | index | close <ID>', []);
}
