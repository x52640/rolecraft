// 未通過檢查的自介草稿（P1-T071，D25、R1）：只存在 helper 記憶體（重開後消失），不是已存自介、不能複製。
// - 產生（或「請 AI 修正」）格式合格但檢查不通過時保留：文字、存在的引用、問題與問題片段。
// - 使用者儲存草稿上的修改：照模型內容的規則重跑檢查（含承諾字眼，草稿源自模型；checkModelIntro）。
//   通過才在同一交易寫成正式自介，寫入前職缺快照必須仍是草稿產生時那份確認、已存自介仍是當時那份
//   （期間使用者改過就不覆蓋）；沒通過把修改與新的問題留在草稿上。
import type { ApplicationIntro, Claim, IntroDraft, Profile } from '@rolecraft/contracts';
import {
  checkModelIntro,
  introProblemFragments,
  usableClaims,
  type IntroDraftContent,
} from '@rolecraft/pipeline';
import { transaction, type Repositories } from '@rolecraft/storage';
import type { DatabaseSync } from 'node:sqlite';

import { introCheckView } from './check-view.ts';
import type { UpdateIntroResult } from './service.ts';

export interface HeldDraft {
  readonly draft: IntroDraft;
  /** 最近一次的模型輸出：儲存時文字不同才標為經使用者編輯 */
  readonly modelText: string;
  /** 草稿產生前的已存自介（儲存草稿時要仍是它，才不會蓋掉使用者之後的修改） */
  readonly before: ApplicationIntro | null;
  readonly snapshotConfirmedAt: string;
}

export function holdDraft(
  content: IntroDraftContent,
  before: ApplicationIntro | null,
  snapshotConfirmedAt: string,
  at: string,
): HeldDraft {
  const draft: IntroDraft = {
    text: content.text,
    citations: [...content.citations],
    problem: content.problem,
    fragments: [...content.fragments],
    generatedAt: at,
  };
  return { draft, modelText: content.text, before, snapshotConfirmedAt };
}

export const sameIntro = (a: ApplicationIntro | null, b: ApplicationIntro | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export interface SaveDraftDeps {
  readonly db: DatabaseSync;
  readonly repos: Repositories;
  readonly drafts: Map<string, HeldDraft>;
  /** 過來源關卡後的全部事實項 */
  readonly claims: () => Promise<readonly Claim[]>;
  readonly profile: () => Profile | null;
  /** 已確認職缺快照的公司名稱與職稱 */
  readonly jobNames: (jobSnapshotId: string) => readonly string[];
  readonly now: () => string;
}

/** 儲存草稿上的修改；通過檢查才成為正式自介（呼叫端已確認快照存在、沒有執行中的產生）。 */
export async function saveDraft(
  deps: SaveDraftDeps,
  jobSnapshotId: string,
  text: string,
): Promise<UpdateIntroResult> {
  const { db, repos, drafts } = deps;
  const held = drafts.get(jobSnapshotId);
  if (!held) return { ok: false, reason: 'no_draft' };
  const all = await deps.claims();
  const profile = deps.profile();
  // 等待期間草稿被新的產生取代：不用舊的引用存檔
  if (drafts.get(jobSnapshotId) !== held) return { ok: false, reason: 'no_draft' };
  const jobNames = deps.jobNames(jobSnapshotId);
  const ctx = { claims: usableClaims(all), profile, jobNames };
  const { citations } = held.draft;
  const problem = checkModelIntro(text, citations, ctx);
  if (problem) {
    const fragments = introProblemFragments(text, citations, ctx, problem);
    const draft = { ...held.draft, text, problem, fragments, generatedAt: deps.now() };
    drafts.set(jobSnapshotId, { ...held, draft });
    return { ok: false, reason: 'draft_failed' };
  }
  const saved = transaction(db, () => {
    const snapshot = repos.jobSnapshots.get(jobSnapshotId);
    if (snapshot?.confirmedAt !== held.snapshotConfirmedAt) return 'snapshot_changed' as const;
    const current = repos.applicationIntros.get(jobSnapshotId);
    if (!sameIntro(current, held.before)) return 'intro_changed' as const;
    return repos.applicationIntros.save({
      jobSnapshotId,
      text,
      citations: [...citations],
      generatedAt: deps.now(),
      userEdited: text !== held.modelText,
    });
  });
  if (typeof saved === 'string') return { ok: false, reason: saved };
  drafts.delete(jobSnapshotId);
  return { ok: true, intro: saved, check: introCheckView(saved, all, profile, jobNames) };
}
