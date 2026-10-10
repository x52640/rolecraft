// 從 Task front matter 產生 docs/tasks/INDEX.md 與 CURRENT_TASK 的 index 區塊。
import fs from 'node:fs';
import path from 'node:path';

import { INDEX_FILE, TASKS_DIR, byId, loadTasks } from './tasks.mjs';

export const CURRENT_TASK_FILE = 'docs/CURRENT_TASK.md';
export const INDEX_PATH = `${TASKS_DIR}/${INDEX_FILE}`;
export const INDEX_START = '<!-- index:start -->';
export const INDEX_END = '<!-- index:end -->';

const cell = (value) => String(value).replaceAll('|', '\\|');
const list = (items) => (items.length ? items.join('、') : '—');

function validTasks(root) {
  return loadTasks(root)
    .filter((t) => t.data && typeof t.data.id === 'string')
    .sort(byId);
}

/** INDEX.md 全文。 */
export function renderIndex(tasks) {
  const dependents = new Map();
  for (const t of tasks) {
    for (const dep of t.data.depends_on ?? []) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), t.data.id]);
    }
  }
  const out = [
    '# Task 索引',
    '',
    '由 `npm run task:index` 從各 Task 的 front matter 產生，不要手改。',
    '',
    '| ID | 標題 | status | phase | track | depends_on |',
    '|---|---|---|---|---|---|',
  ];
  for (const t of tasks) {
    const d = t.data;
    out.push(
      `| [${d.id}](${t.file}) | ${cell(t.title)} | ${d.status} | ${d.phase} | ${cell(d.track)} | ${list(d.depends_on ?? [])} |`,
    );
  }
  out.push('', '## 依賴清單', '', '格式：`ID`：依賴 → 被依賴（完成後可解鎖）。', '');
  for (const t of tasks) {
    const id = t.data.id;
    out.push(`- ${id}：${list(t.data.depends_on ?? [])} → ${list(dependents.get(id) ?? [])}`);
  }
  return `${out.join('\n')}\n`;
}

/** CURRENT_TASK 中 index 區塊內部（不含標記）。 */
export function renderCurrentBlock(tasks) {
  const pick = (status) => tasks.filter((t) => t.data.status === status);
  const section = (heading, items) => [
    `## ${heading}`,
    '',
    ...(items.length ? items : ['- 無']),
    '',
  ];
  const inProgress = pick('in_progress').map((t) => `- ${t.data.id} ${t.title}（\`${t.rel}\`）`);
  const ready = pick('ready').map((t) => `- ${t.data.id} ${t.title}`);
  return [...section('進行中', inProgress), ...section('ready', ready)].join('\n');
}

/** 把 index 區塊換進 CURRENT_TASK 全文；找不到標記時丟錯。標記之外一字不動。 */
export function replaceBlock(text, block) {
  const start = text.indexOf(INDEX_START);
  const end = text.indexOf(INDEX_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${CURRENT_TASK_FILE} 缺少 ${INDEX_START}…${INDEX_END} 標記`);
  }
  return `${text.slice(0, start + INDEX_START.length)}\n${block}${text.slice(end)}`;
}

/** 計算應有內容：{ index, current }（current 為 null 表示沒有 CURRENT_TASK 檔）。 */
export function expectedOutputs(root) {
  const tasks = validTasks(root);
  const currentPath = path.join(root, CURRENT_TASK_FILE);
  const current = fs.existsSync(currentPath)
    ? replaceBlock(fs.readFileSync(currentPath, 'utf8'), renderCurrentBlock(tasks))
    : null;
  return { index: renderIndex(tasks), current };
}

/** 寫入產生物，回傳有變動的檔案清單。 */
export function writeIndex(root) {
  const { index, current } = expectedOutputs(root);
  const changed = [];
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (before !== content) {
      fs.writeFileSync(abs, content);
      changed.push(rel);
    }
  };
  write(INDEX_PATH, index);
  if (current !== null) write(CURRENT_TASK_FILE, current);
  return changed;
}
