/**
 * R1 匯出前檢查 1–3（D4、D14）。純函式，失敗即擋（fail closed）：
 * 資料不符 schema、事實項 ID 重複、數字無法解析，一律當成不通過。
 */
import {
  CLAIM_TYPES_WITH_COMPLETION,
  Claim,
  Profile,
  ResumeSection,
  type ClaimCitation,
} from '@rolecraft/contracts';

import { isUsableForGeneration } from '../source-change/index.ts';

import {
  SECTION_CONFIRMABLE,
  type ExportCheckKind,
  type ExportCheckResult,
  type ExportIssue,
  type ExportIssueCode,
} from './issues.ts';
import { extractNumbers, isBlankForNumbers, numberKeys } from './numbers.ts';

export interface ExportCheckInput {
  readonly sections: readonly ResumeSection[];
  readonly claims: readonly Claim[];
  /** 個人資料；PDF 解析未經使用者確認時不算數字出處 */
  readonly profile: Profile | null;
}

/** 只收合法且 ID 唯一的事實項；ID 重複的視為不存在（無法判定是哪一筆）。 */
function buildClaimMap(claims: readonly unknown[]): Map<string, Claim> {
  const map = new Map<string, Claim>();
  const duplicated = new Set<string>();
  for (const raw of claims) {
    const parsed = Claim.safeParse(raw);
    if (!parsed.success) continue;
    const { id } = parsed.data;
    if (map.has(id) || duplicated.has(id)) {
      map.delete(id);
      duplicated.add(id);
      continue;
    }
    map.set(id, parsed.data);
  }
  return map;
}

function profileNumberKeys(raw: unknown): Set<string> {
  const parsed = Profile.safeParse(raw);
  if (!parsed.success || !parsed.data.pdfParseConfirmed) return new Set();
  const p = parsed.data;
  const texts = [
    ...Object.values(p.personalInfo),
    ...p.experiences.flatMap((e) => [
      e.company,
      e.title,
      e.startDate,
      e.endDate ?? '',
      e.description,
    ]),
    ...p.skills,
  ];
  return numberKeys(texts.join('\n'));
}

/**
 * 事實項能不能被段落引用（協調者裁定，重用 R2 的 isUsableForGeneration）：
 * 待複核、來源矛盾、來源已移除且未經使用者確認、完全沒有依據的，引用它的段落一律不能匯出，
 * 不論寫成哪種完成程度，也不能用逐段確認繞過。
 */
function unusableReason(claim: Claim): string | null {
  const { sourceExcerpts, userConfirmation } = claim.basis;
  if (sourceExcerpts.length === 0 && userConfirmation === null) {
    return '事實項沒有任何來源或使用者確認，不能引用';
  }
  if (!isUsableForGeneration(claim)) {
    return `事實項處於「${claim.reviewStatus}」，到事實項上處理前不能引用`;
  }
  return null;
}

/** 寫成已完成時，事實項必須是使用者確認完成、確認文字與現在內容一致（複核狀態由 unusableReason 把關）。 */
function completedViolation(claim: Claim): { code: ExportIssueCode; message: string } | null {
  if (claim.completionStatus !== 'user_confirmed_done') {
    return {
      code: 'completed_not_user_confirmed',
      message: `事實項狀態是「${claim.completionStatus ?? '無'}」，未經使用者確認完成，不能寫成已完成`,
    };
  }
  const confirmation = claim.basis.userConfirmation;
  if (confirmation === null || confirmation.text !== claim.text) {
    return {
      code: 'completed_confirmation_stale',
      message: '事實項沒有使用者確認紀錄，或確認後內容已改變，需重新確認',
    };
  }
  return null;
}

class SectionIssues {
  readonly list: ExportIssue[] = [];
  private readonly sectionId: string;
  constructor(sectionId: string) {
    this.sectionId = sectionId;
  }

  add(
    check: ExportCheckKind,
    code: ExportIssueCode,
    message: string,
    extra: { claimId?: string; number?: string } = {},
  ): void {
    this.list.push({
      sectionId: this.sectionId,
      check,
      code,
      message,
      ...extra,
      resolvableBySectionConfirmation: SECTION_CONFIRMABLE.has(check),
    });
  }
}

function checkIntegrity(section: ResumeSection, out: SectionIssues): void {
  if (section.generatedCitations === undefined) {
    if (section.origin === 'generated') {
      out.add(
        'citation_integrity',
        'generated_citations_missing',
        '生成段落缺少生成當下的引用紀錄，無法確認引用未被移除',
      );
    }
    return;
  }
  const current = new Set(section.citations.map((c) => c.claimId));
  for (const original of section.generatedCitations) {
    if (!current.has(original.claimId)) {
      out.add(
        'citation_integrity',
        'citation_removed',
        '生成段落的引用不能只移除；要去掉引用只能刪除整段',
        {
          claimId: original.claimId,
        },
      );
    }
  }
}

function checkCitation(
  citation: ClaimCitation,
  claims: Map<string, Claim>,
  out: SectionIssues,
): Claim | null {
  const { claimId, statedCompletion } = citation;
  const claim = claims.get(claimId);
  if (claim === undefined) {
    out.add('citation_exists', 'claim_not_found', '引用的事實項不存在', { claimId });
    if (statedCompletion === 'completed') {
      out.add('completion', 'completed_claim_not_found', '寫成已完成的事實項不存在', { claimId });
    }
    return null;
  }
  const unusable = unusableReason(claim);
  if (unusable !== null) out.add('claim_usability', 'claim_unusable', unusable, { claimId });
  const hasCompletion = CLAIM_TYPES_WITH_COMPLETION.includes(claim.type);
  if (!hasCompletion) {
    if (statedCompletion === 'completed') {
      out.add('completion', 'completion_not_applicable', '這類事實項沒有完成狀態，不能標成已完成', {
        claimId,
      });
    }
    return claim;
  }
  if (statedCompletion === undefined) {
    out.add('completion', 'completion_not_stated', '引用功能或交付物時必須標示寫成的完成程度', {
      claimId,
    });
  } else if (statedCompletion === 'completed') {
    const violation = completedViolation(claim);
    if (violation !== null) out.add('completion', violation.code, violation.message, { claimId });
  }
  return claim;
}

function checkNumbers(
  text: string,
  citedClaims: readonly Claim[],
  profileKeys: Set<string>,
  out: SectionIssues,
): void {
  const allowed = new Set(profileKeys);
  for (const claim of citedClaims) {
    for (const key of numberKeys(claim.text)) allowed.add(key);
    const confirmed = claim.basis.userConfirmation?.text;
    if (confirmed !== undefined) for (const key of numberKeys(confirmed)) allowed.add(key);
  }
  const reported = new Set<string>();
  for (const token of extractNumbers(text)) {
    if (token.key !== null && allowed.has(token.key)) continue;
    if (reported.has(token.text)) continue;
    reported.add(token.text);
    if (token.key === null) {
      out.add('numbers', 'number_unparseable', `無法辨識的數字寫法「${token.text}」`, {
        number: token.text,
      });
    } else {
      out.add(
        'numbers',
        'number_unsourced',
        `數字「${token.text}」在引用的事實項與個人資料中找不到`,
        {
          number: token.text,
        },
      );
    }
  }
}

function sectionIdOf(raw: unknown, index: number): string {
  if (typeof raw === 'object' && raw !== null && 'id' in raw && typeof raw.id === 'string')
    return raw.id;
  return `#${index}`;
}

function checkSection(
  raw: unknown,
  index: number,
  claims: Map<string, Claim>,
  profileKeys: Set<string>,
): ExportIssue[] {
  const parsed = ResumeSection.safeParse(raw);
  if (!parsed.success) {
    const out = new SectionIssues(sectionIdOf(raw, index));
    out.add('invalid_input', 'invalid_section', '段落資料不符格式，不能匯出');
    return out.list;
  }
  const section = parsed.data;
  // 正規化後是空白（含零寬字元）的段落不會輸出任何內容
  if (isBlankForNumbers(section.text)) return [];

  const out = new SectionIssues(section.id);
  checkIntegrity(section, out);
  if (section.citations.length === 0) {
    out.add('no_citation', 'section_without_citation', '段落沒有引用任何事實項，需逐段確認或改寫');
  }
  const cited: Claim[] = [];
  for (const citation of section.citations) {
    const claim = checkCitation(citation, claims, out);
    if (claim !== null) cited.push(claim);
  }
  checkNumbers(section.text, cited, profileKeys, out);

  const confirmation = section.sectionConfirmation;
  const confirmed = confirmation !== null && confirmation.text === section.text;
  return confirmed ? out.list.filter((i) => !i.resolvableBySectionConfirmation) : out.list;
}

/** 匯出前檢查。ok 為 false 時不得匯出。 */
export function checkExportReadiness(input: ExportCheckInput): ExportCheckResult {
  const claims = buildClaimMap(input.claims);
  const profileKeys = profileNumberKeys(input.profile);
  const issues = input.sections.flatMap((raw, index) =>
    checkSection(raw, index, claims, profileKeys),
  );
  return { ok: issues.length === 0, issues };
}
