// Task 檔讀取：front matter 解析、標題、章節。所有函式都吃 repo 根目錄，方便測試用暫存目錄。
import fs from 'node:fs';
import path from 'node:path';

export const TASKS_DIR = 'docs/tasks';
export const TEMPLATE_FILE = '_TEMPLATE.md';
export const INDEX_FILE = 'INDEX.md';
export const STATUSES = ['ready', 'in_progress', 'done', 'blocked'];
export const REQUIRED_FIELDS = [
  'id',
  'phase',
  'status',
  'depends_on',
  'specs',
  'track',
  'primary_repo',
  'write_paths',
  'contract_change',
  'expected_commit',
];
export const ARRAY_FIELDS = ['depends_on', 'specs', 'write_paths'];
export const ID_PATTERN = /^P\d+-T\d{3}$/;

/** 解析單一 front matter 值：JSON 陣列／字串／數字，其餘當原字串。 */
function parseValue(raw) {
  const value = raw.trim();
  if (/^[[{"]/.test(value) || /^-?\d+$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return { invalid: value };
    }
  }
  return value;
}

/**
 * 拆出 front matter。回傳 { data, body, error }；
 * 只支援本專案用到的子集：每行 `key: value`，值是 JSON 陣列、引號字串、數字或裸字串。
 */
export function parseFrontMatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { data: null, body: text, error: '缺少 front matter' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { data: null, body: text, error: 'front matter 沒有結尾 ---' };
  const data = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '') continue;
    const match = /^([a-z_]+):(.*)$/.exec(line);
    if (!match) return { data: null, body: text, error: `front matter 無法解析：${line}` };
    data[match[1]] = parseValue(match[2]);
  }
  return { data, body: lines.slice(end + 1).join('\n'), error: null };
}

/** 第一個 `# ` 標題。 */
export function titleOf(body) {
  const line = body.split('\n').find((l) => l.startsWith('# '));
  return line ? line.slice(2).trim() : '';
}

/** `## name` 章節內容（到下一個 `## ` 或檔尾），不存在回傳 null。 */
export function sectionOf(body, name) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((l) => l.startsWith('## '));
  return (next === -1 ? rest : rest.slice(0, next)).join('\n').trim();
}

/** 讀所有 Task 檔（排除模板與 INDEX）。依檔名排序。 */
export function loadTasks(root) {
  const dir = path.join(root, TASKS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== TEMPLATE_FILE && f !== INDEX_FILE)
    .sort()
    .map((file) => {
      const rel = `${TASKS_DIR}/${file}`;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data, body, error } = parseFrontMatter(text);
      return { file, rel, text, data, body, error, title: titleOf(body) };
    });
}

/** 依 ID 排序（phase、序號）。 */
export function byId(a, b) {
  return String(a.data?.id).localeCompare(String(b.data?.id), 'en', { numeric: true });
}
