// 專案分組測試共用（P1-T063）：兩份文件的假分析輸出＋假分組輸出。一律假 provider，不呼叫真實 CLI。
import type { FakeStep } from '@rolecraft/providers';

import { PROJECT_GROUPING_INSTRUCTIONS } from '@rolecraft/pipeline';

import {
  authorize,
  fakeEngine,
  feature,
  output,
  type FakeEngine,
  type HelperRun,
} from './analysis-env.ts';

export const A = '# 專案甲\n\n完成登入功能。';
export const B = '# 專案乙\n\n計畫中：匯出 PDF。';
export const FILES = { 'README.md': A, 'notes.md': B };

/** 分組提示（不是文件分析提示）。 */
export const isGrouping = (prompt: string) => prompt.includes(PROJECT_GROUPING_INSTRUCTIONS);

/** 分組提示中某個文件名稱對應的本機編號（D1…）。 */
export function labelOf(prompt: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const found = new RegExp(
    `(D\\d+)：\\n<<<DATA D\\d+-NAME [0-9A-Za-z]+>>>\\n${escaped}\\n`,
    'u',
  ).exec(prompt);
  if (!found?.[1]) throw new Error(`提示中找不到 ${name}`);
  return found[1];
}

/** 分析輸出：甲、乙各一項事實項，摘要分別是「甲的摘要」「乙的摘要」。 */
export function analysisStep(prompt: string): FakeStep {
  return prompt.includes('專案甲')
    ? output([feature('登入功能', '完成登入功能。')], '甲的摘要')
    : output([feature('匯出 PDF', '計畫中：匯出 PDF。', 'planned')], '乙的摘要');
}

/** 分組輸出：依提示產生；預設把兩份文件各分一組。 */
export type GroupingResponder = (prompt: string) => FakeStep;

export const twoGroups: GroupingResponder = (prompt) => ({
  text: JSON.stringify({
    groups: [
      { name: '甲專案', documents: [labelOf(prompt, 'README.md')] },
      { name: '乙專案', documents: [labelOf(prompt, 'notes.md')] },
    ],
  }),
});

export function projectsEngine(grouping: GroupingResponder = twoGroups): FakeEngine {
  return fakeEngine((prompt) => (isGrouping(prompt) ? grouping(prompt) : analysisStep(prompt)));
}

/** 授權兩份文件並分析完（有摘要、各一項事實項）。 */
export async function analyzedBoth(run: HelperRun): Promise<void> {
  await authorize(run, { authorize: ['README.md', 'notes.md'] });
  await run.call('analysis.start');
  await run.settled();
}

/** 來源文件 ID：依相對路徑找。 */
export function docId(run: HelperRun, relPath: string): string {
  const doc = run.repos.sourceDocuments.list().find((d) => d.documentPath === relPath);
  if (!doc) throw new Error(`找不到 ${relPath}`);
  return doc.id;
}

/** 事實項 ID：依文字找。 */
export function claimId(run: HelperRun, text: string): string {
  const claim = run.repos.claims.list().find((c) => c.text === text);
  if (!claim) throw new Error(`找不到事實項 ${text}`);
  return claim.id;
}

/** 取得目前的分組建議（等背景結束）。 */
export async function suggestion(run: HelperRun): Promise<Record<string, unknown>> {
  const started = await run.call('analysis.suggest_projects');
  if (started.ok !== true) return started;
  await run.suggestionSettled();
  const res = await run.call('analysis.project_suggestion');
  return res.suggestion as Record<string, unknown>;
}
