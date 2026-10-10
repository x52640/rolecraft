// task:close：in_progress → done，前提是完成結果已填且沒有「未完成」「TODO」。
import fs from 'node:fs';
import path from 'node:path';

import { verifyDocs } from './checks.mjs';
import { writeIndex } from './index-gen.mjs';
import { loadTasks, sectionOf } from './tasks.mjs';

export const FORBIDDEN_IN_RESULT = ['未完成', 'TODO'];

/** 收官前檢查，回傳錯誤訊息陣列。 */
export function closeBlockers(task) {
  if (!task) return ['找不到這個 Task'];
  if (!task.data) return [`${task.rel}：${task.error}`];
  const errors = [];
  if (task.data.status !== 'in_progress') {
    errors.push(`${task.rel}：status 是 ${task.data.status}，只有 in_progress 能收官`);
  }
  const result = sectionOf(task.body, '完成結果');
  // 行內程式碼（反引號）裡的字是名稱，不是待辦（例如檔名 `TODO`）。
  const prose = result.replace(/`[^`\n]*`/g, '');
  if (!result) errors.push(`${task.rel}：「完成結果」是空的`);
  else {
    for (const word of FORBIDDEN_IN_RESULT) {
      if (prose.includes(word)) errors.push(`${task.rel}：「完成結果」含有「${word}」`);
    }
  }
  return errors;
}

/**
 * 收官：改 status → 重產 index → 跑 verify:docs。
 * 回傳 { ok, errors }；前置檢查失敗時不改任何檔案。
 */
export function closeTask(root, id) {
  const task = loadTasks(root).find((t) => t.data?.id === id);
  const blockers = closeBlockers(task);
  if (blockers.length) return { ok: false, errors: blockers };
  const abs = path.join(root, task.rel);
  // 只改 front matter 內的 status 行，容許引號與多餘空白（codex review P0-T002）。
  const fmEnd = task.text.indexOf('\n---', 3);
  const head = task.text
    .slice(0, fmEnd)
    .replace(/^status:[ \t]*["']?in_progress["']?[ \t]*$/m, 'status: done');
  fs.writeFileSync(abs, head + task.text.slice(fmEnd));
  const after = loadTasks(root).find((t) => t.data?.id === id);
  if (after?.data?.status !== 'done') {
    return { ok: false, errors: [`${task.rel}：status 沒有改成 done，請手動檢查 front matter`] };
  }
  writeIndex(root);
  const errors = verifyDocs(root);
  return { ok: errors.length === 0, errors };
}
