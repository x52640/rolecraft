// 匯出前檢查（P1-T025）：R1（domain checkExportReadiness）＋段落阻擋。
// 段落阻擋：生成段落要逐段把關（F07），尚未接受或已退回的不能匯出；
// 缺段落歸屬或對不到 Profile 經歷的不能匯出（P1-T040 的組裝規則）。
// 「實質空白」段落不印也不檢查（與 R1、匯出組裝一致）。
import type {
  Claim,
  ExportIssueView,
  Profile,
  ResumeSection,
  ResumeVersion,
  SectionBlockerView,
} from '@rolecraft/contracts';
import { checkExportReadiness, type ExportIssue } from '@rolecraft/domain';

import type { CheckExportResult } from './service.ts';

/**
 * R1 會跳過「實質空白」段落（去掉不可見字元後沒內容）。domain 沒有公開這個判定，
 * 用公開的 checkExportReadiness 探測：非空白、無引用、未確認的段落一定會有「沒有引用」問題。
 */
export function isPrintable(section: ResumeSection): boolean {
  const probe = checkExportReadiness({
    sections: [
      {
        id: section.id,
        origin: 'user_written',
        text: section.text,
        citations: [],
        sectionConfirmation: null,
      },
    ],
    claims: [],
    profile: null,
  });
  return !probe.ok;
}

/** 經歷段落對到的 Profile 經歷（公司＋職稱＋起始日期，與匯出組裝同一規則）。 */
export function experienceOf(profile: Profile | null, section: ResumeSection) {
  const p = section.placement;
  if (profile === null || p?.group !== 'experience') return undefined;
  return profile.experiences.find(
    (e) => e.company === p.company && e.title === p.title && e.startDate === p.startDate,
  );
}

const BLOCK_MESSAGES: Record<SectionBlockerView['reason'], string> = {
  pending: '修改稿尚未接受：請對照原文後接受（只接受措辭，不確認事實項）、改寫或刪除',
  rejected: '已退回的段落不能匯出：請改寫後接受，或刪除整段',
  placement_missing: '段落沒有指定放在履歷哪一區，不能匯出；請刪除整段',
  experience_not_found: '段落對不到個人資料中的工作經歷，不能匯出；請刪除整段或更新個人資料',
};

function blockersOf(section: ResumeSection, profile: Profile | null): SectionBlockerView[] {
  const reasons: SectionBlockerView['reason'][] = [];
  const decision = section.decision ?? 'pending';
  if (decision !== 'accepted') reasons.push(decision);
  if (section.placement === undefined) reasons.push('placement_missing');
  else if (section.placement.group === 'experience' && profile !== null) {
    if (experienceOf(profile, section) === undefined) reasons.push('experience_not_found');
  }
  return reasons.map((reason) => ({
    sectionId: section.id,
    reason,
    message: BLOCK_MESSAGES[reason],
  }));
}

function issueView(issue: ExportIssue): ExportIssueView {
  return {
    sectionId: issue.sectionId,
    check: issue.check,
    code: issue.code,
    ...(issue.claimId === undefined ? {} : { claimId: issue.claimId }),
    ...(issue.number === undefined ? {} : { number: issue.number }),
    message: issue.message,
    resolvableBySectionConfirmation: issue.resolvableBySectionConfirmation,
  };
}

export interface ReadinessInput {
  readonly version: ResumeVersion;
  /** 段落引用的事實項（目前狀態） */
  readonly claims: readonly Claim[];
  /** 唯一且已確認的個人資料；沒有則 null（數字不認 Profile、不檢查經歷對應） */
  readonly profile: Profile | null;
}

export function checkReadiness(input: ReadinessInput): CheckExportResult {
  const r1 = checkExportReadiness({
    sections: input.version.sections,
    claims: input.claims,
    profile: input.profile,
  });
  const blockers = input.version.sections
    .filter(isPrintable)
    .flatMap((s) => blockersOf(s, input.profile));
  return {
    ok: true,
    ready: r1.ok && blockers.length === 0,
    issues: r1.issues.map(issueView),
    blockers,
  };
}

/** 該段是否有不能用逐段確認放行的 R1 問題（檢查 2、事實項不可用、引用完整性）。 */
export function hasUnconfirmableIssue(
  section: ResumeSection,
  claims: readonly Claim[],
  profile: Profile | null,
): boolean {
  const r1 = checkExportReadiness({ sections: [section], claims, profile });
  return r1.issues.some((issue) => !issue.resolvableBySectionConfirmation);
}

/** 原文對照：只有經歷段落有原文（Profile 經歷描述）。 */
export function originalsOf(version: ResumeVersion, profile: Profile | null) {
  return version.sections.flatMap((section) => {
    const experience = experienceOf(profile, section);
    return experience === undefined
      ? []
      : [{ sectionId: section.id, text: experience.description }];
  });
}
