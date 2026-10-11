// 履歷服務的 storage 實作（P1-T025）：逐段接受、退回、編輯、刪除、逐段確認與匯出前檢查。
// 規則都在 helper 端套用（R1），不相信呼叫端給的狀態或時間；讀→改→寫在同一交易。
import type { DatabaseSync } from 'node:sqlite';

import type { Claim, Profile, ResumeSection, ResumeVersion } from '@rolecraft/contracts';
import { confirmSection } from '@rolecraft/domain';
import { createRepositories, nowTimestamp, transaction } from '@rolecraft/storage';

import type { ClaimGate } from '../sources/claim-gate.ts';
import { createGeneration, type GenerationEngine } from './generation.ts';
import { checkReadiness, hasUnconfirmableIssue, originalsOf } from './readiness.ts';
import { applyEdit, withDecision } from './section-rules.ts';
import type { ResumeFailureReason, ResumeResult, ResumeService } from './service.ts';

export interface ResumeServiceOptions {
  db: DatabaseSync;
  /** 測試用：逐段確認時間來源；預設現在時間。呼叫端（頁面）不能指定時間。 */
  now?: () => string;
  /** 模型執行；沒給時 resume.generate 回 not_implemented */
  generation?: GenerationEngine;
  /** 測試用：背景生成工作結束時通知 */
  onGenerationSettled?: (jobSnapshotId: string) => void;
  /** 生成讀事實項時的來源關卡（P1-T060） */
  claimGate?: ClaimGate | null;
}

const OK: ResumeResult = { ok: true };
const fail = (reason: ResumeFailureReason): ResumeResult => ({ ok: false, reason });

type SectionChange = (
  section: ResumeSection,
  version: ResumeVersion,
) => ResumeSection | null | ResumeResult;

export function createResumeService(options: ResumeServiceOptions): ResumeService {
  const { db } = options;
  const now = options.now ?? (() => nowTimestamp());
  const repos = createRepositories(db);

  /** 唯一且已確認的個人資料（與匯出同一條件）；否則 null。 */
  const confirmedProfile = (): Profile | null => {
    const profiles = repos.profiles.list();
    const [only] = profiles;
    return profiles.length === 1 && only?.pdfParseConfirmed === true ? only : null;
  };

  const citedClaims = (sections: readonly ResumeSection[]): Claim[] => {
    const ids = new Set(sections.flatMap((s) => s.citations.map((c) => c.claimId)));
    return [...ids].flatMap((id) => {
      const claim = repos.claims.get(id);
      return claim === null ? [] : [claim];
    });
  };

  /** 改一段：change 回段落＝寫回、null＝刪除整段、ResumeResult＝不寫入。 */
  function modify(versionId: string, sectionId: string, change: SectionChange): ResumeResult {
    return transaction(db, () => {
      const version = repos.resumeVersions.get(versionId);
      const section = version?.sections.find((s) => s.id === sectionId);
      if (!version || !section) return fail('version_not_found');
      const next = change(section, version);
      if (next !== null && 'ok' in next) return next;
      const sections =
        next === null
          ? version.sections.filter((s) => s.id !== sectionId)
          : version.sections.map((s) => (s.id === sectionId ? next : s));
      repos.resumeVersions.save({ ...version, sections });
      return OK;
    });
  }

  return {
    ...(options.generation && {
      generate: createGeneration({
        db,
        repos,
        engine: options.generation,
        gate: options.claimGate ?? null,
        ...(options.onGenerationSettled && { onSettled: options.onGenerationSettled }),
      }),
    }),

    list(jobSnapshotId) {
      if (repos.jobSnapshots.get(jobSnapshotId) === null) return Promise.resolve(null);
      return Promise.resolve(repos.resumeVersions.listByJobSnapshot(jobSnapshotId));
    },

    get(resumeVersionId) {
      const version = repos.resumeVersions.get(resumeVersionId);
      if (version === null) return Promise.resolve(null);
      const originals = originalsOf(version, confirmedProfile());
      return Promise.resolve({ ok: true as const, version, originals });
    },

    accept: (versionId, sectionId) =>
      Promise.resolve(modify(versionId, sectionId, (s) => withDecision(s, 'accepted'))),

    reject: (versionId, sectionId) =>
      Promise.resolve(modify(versionId, sectionId, (s) => withDecision(s, 'rejected'))),

    remove: (versionId, sectionId) => Promise.resolve(modify(versionId, sectionId, () => null)),

    edit(payload) {
      const result = modify(payload.resumeVersionId, payload.sectionId, (section) => {
        const outcome = applyEdit(section, payload, (id) => repos.claims.get(id) !== null);
        return outcome.ok ? outcome.section : fail(outcome.reason);
      });
      return Promise.resolve(result);
    },

    confirm(payload) {
      const result = modify(payload.resumeVersionId, payload.sectionId, (section) => {
        if (payload.text !== section.text) return fail('text_mismatch');
        // 檢查 2、事實項不可用、引用完整性的問題不能用逐段確認放行（R1）
        if (hasUnconfirmableIssue(section, citedClaims([section]), confirmedProfile())) {
          return fail('not_section_confirmable');
        }
        const confirmed = confirmSection(section, now());
        return confirmed.ok ? confirmed.value : fail('blank_section');
      });
      return Promise.resolve(result);
    },

    checkExport(resumeVersionId) {
      const version = repos.resumeVersions.get(resumeVersionId);
      if (version === null) return Promise.resolve(null);
      return Promise.resolve(
        checkReadiness({
          version,
          claims: citedClaims(version.sections),
          profile: confirmedProfile(),
        }),
      );
    },
  };
}
