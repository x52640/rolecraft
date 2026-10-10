// verify:docs 的各項檢查。每個函式回傳錯誤訊息陣列（空陣列＝通過）。
import fs from 'node:fs';
import path from 'node:path';

import { CURRENT_TASK_FILE, INDEX_PATH, expectedOutputs } from './index-gen.mjs';
import { ARRAY_FIELDS, ID_PATTERN, REQUIRED_FIELDS, STATUSES, loadTasks } from './tasks.mjs';

export const CURRENT_TASK_MAX_LINES = 100;
export const SPECS_DIR = 'docs/specs';
/** 歷史來源，不做連結檢查（docs/README.md）。 */
export const LINK_CHECK_SKIP = ['Spec.md', 'docs/spec-discussions/'];

const toPosix = (p) => p.split(path.sep).join('/');

/** repo 內所有 .md（略過點開頭目錄與 node_modules），回傳 POSIX 相對路徑。 */
export function listMarkdown(root, dir = root) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdown(root, abs));
    else if (entry.name.endsWith('.md')) out.push(toPosix(path.relative(root, abs)));
  }
  return out.sort();
}

/** 抽出 markdown 連結目標（去掉 code fence 與 inline code）。 */
export function extractLinks(text) {
  const stripped = text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
  const links = [];
  for (const m of stripped.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    links.push(m[1]);
  }
  return links;
}

/** 解不開的 % 保留原字（例如檔名 100%.md），不讓整個閘門當掉（codex review P0-T002）。 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 內部相對連結的目標檔必須存在。外部 URL 與純錨點略過。 */
export function checkLinks(root) {
  const errors = [];
  for (const rel of listMarkdown(root)) {
    if (LINK_CHECK_SKIP.some((skip) => rel === skip || rel.startsWith(skip))) continue;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const link of extractLinks(text)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
      const target = safeDecode(link.split('#')[0].split('?')[0]);
      const abs = target.startsWith('/')
        ? path.join(root, target)
        : path.resolve(root, path.dirname(rel), target);
      if (!fs.existsSync(abs)) errors.push(`${rel}：連結目標不存在 ${link}`);
    }
  }
  return errors;
}

function checkTaskFields(task, errors) {
  const { rel, data } = task;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) errors.push(`${rel}：front matter 缺欄位 ${field}`);
  }
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'invalid' in value) {
      errors.push(`${rel}：${field} 不是合法 JSON：${value.invalid}`);
    }
  }
  for (const field of ARRAY_FIELDS) {
    if (field in data && !Array.isArray(data[field])) errors.push(`${rel}：${field} 必須是陣列`);
  }
  if ('status' in data && !STATUSES.includes(data.status)) {
    errors.push(`${rel}：status「${data.status}」不合法（${STATUSES.join('／')}）`);
  }
  if (typeof data.id !== 'string' || !ID_PATTERN.test(data.id)) {
    errors.push(`${rel}：id「${data.id}」格式不合（例 P1-T001）`);
  } else if (!new RegExp(`^${data.id}-[a-z0-9][a-z0-9-]*\\.md$`).test(task.file)) {
    errors.push(`${rel}：檔名應為 ${data.id}-<slug>.md`);
  }
  if (!task.title) errors.push(`${rel}：缺少 # 標題`);
}

/** front matter 欄位、status、ID 唯一與檔名一致、depends_on、specs。 */
export function checkTasks(root) {
  const errors = [];
  const tasks = loadTasks(root);
  const seen = new Map();
  for (const task of tasks) {
    if (task.error) {
      errors.push(`${task.rel}：${task.error}`);
      continue;
    }
    checkTaskFields(task, errors);
    const id = task.data.id;
    if (seen.has(id)) errors.push(`${task.rel}：ID ${id} 與 ${seen.get(id)} 重複`);
    else seen.set(id, task.rel);
  }
  for (const task of tasks) {
    if (!task.data) continue;
    const deps = Array.isArray(task.data.depends_on) ? task.data.depends_on : [];
    for (const dep of deps) {
      if (dep === task.data.id) errors.push(`${task.rel}：depends_on 指向自己`);
      else if (!seen.has(dep)) errors.push(`${task.rel}：depends_on 指向不存在的 Task ${dep}`);
    }
    const specs = Array.isArray(task.data.specs) ? task.data.specs : [];
    for (const spec of specs) {
      if (!fs.existsSync(path.join(root, SPECS_DIR, spec))) {
        errors.push(`${task.rel}：specs 指向不存在的檔案 ${SPECS_DIR}/${spec}`);
      }
    }
  }
  return errors;
}

/** CURRENT_TASK 行數上限。 */
export function checkCurrentTask(root) {
  const abs = path.join(root, CURRENT_TASK_FILE);
  if (!fs.existsSync(abs)) return [`${CURRENT_TASK_FILE} 不存在`];
  const lines = fs.readFileSync(abs, 'utf8').replace(/\n$/, '').split('\n').length;
  return lines > CURRENT_TASK_MAX_LINES
    ? [`${CURRENT_TASK_FILE} 有 ${lines} 行，超過上限 ${CURRENT_TASK_MAX_LINES}`]
    : [];
}

/** specs/README.md 表格列出的檔案要與 docs/specs/ 實際檔案一致。 */
export function checkSpecsIndex(root) {
  const dir = path.join(root, SPECS_DIR);
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) return [`${SPECS_DIR}/README.md 不存在`];
  const listed = new Set();
  for (const line of fs.readFileSync(readme, 'utf8').split('\n')) {
    const m = /^\|\s*`([^`]+\.md)`\s*\|/.exec(line);
    if (m) listed.add(m[1]);
  }
  const actual = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md'));
  const errors = [];
  for (const f of actual) if (!listed.has(f)) errors.push(`${SPECS_DIR}/README.md 索引缺少 ${f}`);
  for (const f of listed)
    if (!actual.has(f)) errors.push(`${SPECS_DIR}/README.md 列了不存在的 ${f}`);
  return errors;
}

/** INDEX.md 與 CURRENT_TASK index 區塊要與 front matter 一致（產生物新鮮度）。 */
export function checkIndexFresh(root) {
  let expected;
  try {
    expected = expectedOutputs(root);
  } catch (error) {
    return [error.message];
  }
  const errors = [];
  const read = (rel) => {
    const abs = path.join(root, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  };
  if (read(INDEX_PATH) !== expected.index) {
    errors.push(`${INDEX_PATH} 過期，請跑 npm run task:index`);
  }
  if (expected.current !== null && read(CURRENT_TASK_FILE) !== expected.current) {
    errors.push(`${CURRENT_TASK_FILE} index 區塊過期，請跑 npm run task:index`);
  }
  return errors;
}

/** 全部檢查。 */
export function verifyDocs(root) {
  return [
    ...checkLinks(root),
    ...checkTasks(root),
    ...checkCurrentTask(root),
    ...checkSpecsIndex(root),
    ...checkIndexFresh(root),
  ];
}
