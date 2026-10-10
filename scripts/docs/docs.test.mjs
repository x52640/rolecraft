// 文件閘門腳本的單元測試（node:test）。每個測試在暫存目錄建一個迷你 repo。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { verifyDocs } from './checks.mjs';
import { closeTask } from './close.mjs';
import { INDEX_END, INDEX_START, writeIndex } from './index-gen.mjs';
import { parseFrontMatter } from './tasks.mjs';

let root;

function write(rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function task(id, slug, { status = 'ready', deps = [], specs = [], result = '' } = {}) {
  write(
    `docs/tasks/${id}-${slug}.md`,
    [
      '---',
      `id: ${id}`,
      `phase: ${id[1]}`,
      `status: ${status}`,
      `depends_on: ${JSON.stringify(deps)}`,
      `specs: ${JSON.stringify(specs)}`,
      'track: infra',
      'primary_repo: rolecraft',
      'write_paths: []',
      'contract_change: none',
      `expected_commit: "chore(${id}): x"`,
      '---',
      `# 標題 ${id}`,
      '',
      '## 完成結果',
      '',
      result,
      '',
    ].join('\n'),
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rolecraft-docs-'));
  write('docs/specs/README.md', '| 檔案 | 範圍 |\n|---|---|\n| `a.md` | A |\n');
  write('docs/specs/a.md', '# A\n');
  write('docs/tasks/_TEMPLATE.md', '---\nid: P1-T000\n---\n# 模板\n');
  write(
    'docs/CURRENT_TASK.md',
    `# Current\n\n${INDEX_START}\n${INDEX_END}\n\n## 人寫的\n\n- 保留\n`,
  );
  write('README.md', '見 [規格](docs/specs/a.md) 與 [外部](https://example.com)、[錨點](#x)。\n');
  task('P0-T001', 'base', { status: 'done' });
  task('P0-T002', 'next', { status: 'in_progress', deps: ['P0-T001'], specs: ['a.md'] });
  writeIndex(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('乾淨的 repo 通過，task:index 第二次跑無變動', () => {
  assert.deepEqual(verifyDocs(root), []);
  assert.deepEqual(writeIndex(root), []);
});

test('task:index 只改標記之間，產生 INDEX.md', () => {
  const current = read('docs/CURRENT_TASK.md');
  assert.match(current, /## 進行中\n\n- P0-T002 標題 P0-T002/);
  assert.match(current, /## ready\n\n- 無/);
  assert.ok(current.startsWith('# Current\n\n'));
  assert.ok(current.endsWith(`${INDEX_END}\n\n## 人寫的\n\n- 保留\n`));
  const index = read('docs/tasks/INDEX.md');
  assert.match(index, /\| \[P0-T002\]\(P0-T002-next\.md\) \| 標題 P0-T002 \| in_progress \|/);
  assert.match(index, /- P0-T001：— → P0-T002/);
  assert.doesNotMatch(index, /P1-T000/);
});

test('壞連結會紅；歷史檔與 code 內的連結略過', () => {
  write('docs/x.md', '[壞](missing.md)\n`[略過](nope.md)`\n');
  write('docs/spec-discussions/old.md', '[壞](gone.md)\n');
  write('Spec.md', '[壞](gone.md)\n');
  const errors = verifyDocs(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /docs\/x\.md：連結目標不存在 missing\.md/);
});

test('重複 ID 與檔名不一致會紅', () => {
  write('docs/tasks/P0-T001-dup.md', read('docs/tasks/P0-T001-base.md'));
  write(
    'docs/tasks/P0-T009-wrong.md',
    read('docs/tasks/P0-T001-base.md').replace('P0-T001', 'P0-T003'),
  );
  const errors = verifyDocs(root).join('\n');
  assert.match(errors, /ID P0-T001 與 .* 重複/);
  assert.match(errors, /P0-T009-wrong\.md：檔名應為 P0-T003-<slug>\.md/);
});

test('缺欄位、非法 status、壞 depends_on／specs 會紅', () => {
  task('P0-T003', 'bad', { status: 'doing', deps: ['P9-T999'], specs: ['nope.md'] });
  write('docs/tasks/P0-T004-miss.md', '---\nid: P0-T004\nstatus: ready\n---\n# 缺\n');
  const errors = verifyDocs(root).join('\n');
  assert.match(errors, /status「doing」不合法/);
  assert.match(errors, /depends_on 指向不存在的 Task P9-T999/);
  assert.match(errors, /specs 指向不存在的檔案 docs\/specs\/nope\.md/);
  assert.match(errors, /P0-T004-miss\.md：front matter 缺欄位 depends_on/);
});

test('CURRENT_TASK 超過 100 行會紅', () => {
  write('docs/CURRENT_TASK.md', read('docs/CURRENT_TASK.md') + '-\n'.repeat(100));
  const errors = verifyDocs(root);
  assert.ok(errors.some((e) => /超過上限 100/.test(e)));
});

test('specs 索引與實際檔案不一致會紅', () => {
  write('docs/specs/b.md', '# B\n');
  fs.rmSync(path.join(root, 'docs/specs/a.md'));
  const errors = verifyDocs(root).join('\n');
  assert.match(errors, /索引缺少 b\.md/);
  assert.match(errors, /列了不存在的 a\.md/);
});

test('改了 status 沒跑 task:index 會紅', () => {
  const file = 'docs/tasks/P0-T001-base.md';
  write(file, read(file).replace('status: done', 'status: ready'));
  const errors = verifyDocs(root).join('\n');
  assert.match(errors, /INDEX\.md 過期/);
  assert.match(errors, /index 區塊過期/);
});

test('task:close：完成結果空白或含 TODO 拒絕且不改檔', () => {
  const file = 'docs/tasks/P0-T002-next.md';
  const before = read(file);
  assert.match(closeTask(root, 'P0-T002').errors.join(), /「完成結果」是空的/);
  write(file, before.replace('## 完成結果\n', '## 完成結果\n\n- TODO 補測試\n'));
  assert.match(closeTask(root, 'P0-T002').errors.join(), /含有「TODO」/);
  assert.match(closeTask(root, 'P0-T001').errors.join(), /只有 in_progress 能收官/);
  assert.match(closeTask(root, 'P9-T999').errors.join(), /找不到/);
  assert.match(read(file), /status: in_progress/);
});

test('task:close：缺「## 完成結果」段時回報錯誤而不是崩潰，且不改檔', () => {
  const file = 'docs/tasks/P0-T002-next.md';
  write(file, read(file).replace('## 完成結果\n', '## 其他\n'));
  const before = read(file);
  const result = closeTask(root, 'P0-T002');
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /「完成結果」是空的/);
  assert.equal(read(file), before);
});

test('task:close：成功時改 done、更新 index、verify 通過', () => {
  const file = 'docs/tasks/P0-T002-next.md';
  write(file, read(file).replace('## 完成結果\n', '## 完成結果\n\n- 全部完成\n'));
  writeIndex(root);
  assert.deepEqual(closeTask(root, 'P0-T002'), { ok: true, errors: [] });
  assert.match(read(file), /status: done/);
  assert.match(read('docs/CURRENT_TASK.md'), /## 進行中\n\n- 無/);
});

test('front matter 解析：陣列、字串、數字、壞 JSON', () => {
  const { data } = parseFrontMatter('---\na: ["x"]\nb: "y"\nc: 1\nd: z\ne: [bad\n---\n');
  assert.deepEqual(data, { a: ['x'], b: 'y', c: 1, d: 'z', e: { invalid: '[bad' } });
  assert.match(parseFrontMatter('# none').error, /缺少 front matter/);
});

test('task:close：status 帶引號或多空白也會改成 done（codex review P0-T002）', () => {
  for (const spelling of ['status: "in_progress"', 'status:   in_progress  ']) {
    const file = 'docs/tasks/P0-T002-next.md';
    task('P0-T002', 'next', {
      status: 'in_progress',
      deps: ['P0-T001'],
      specs: ['a.md'],
      result: '- 全部完成',
    });
    write(file, read(file).replace('status: in_progress', spelling));
    writeIndex(root);
    assert.deepEqual(closeTask(root, 'P0-T002'), { ok: true, errors: [] });
    assert.match(read(file), /^status: done$/m);
  }
});

test('連結目標檔名含 % 不會讓閘門當掉（codex review P0-T002）', () => {
  write('docs/100%.md', '# x\n');
  write('docs/y.md', '[百分比](100%.md) [不存在](50%.md)\n');
  const errors = verifyDocs(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /50%\.md/);
});

test('task:close：反引號內的禁用字不算（例如檔名 `TODO`）', () => {
  task('P0-T002', 'next', {
    status: 'in_progress',
    deps: ['P0-T001'],
    specs: ['a.md'],
    result: '- 允許檔名 `TODO`、`README`',
  });
  writeIndex(root);
  assert.equal(closeTask(root, 'P0-T002').ok, true);
  task('P0-T002', 'next', {
    status: 'in_progress',
    deps: ['P0-T001'],
    specs: ['a.md'],
    result: '- 還有 TODO',
  });
  writeIndex(root);
  assert.equal(closeTask(root, 'P0-T002').ok, false);
});
