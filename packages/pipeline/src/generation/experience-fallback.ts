/**
 * 經歷段落補齊（P1-T072）：每段工作經歷都要有一段，專案段落不能取代經歷。
 * 模型沒有產出、或產出的經歷段落都沒通過檢查時，由程式補一段「沿用原文」：
 * 文字就是 Profile 經歷描述（使用者確認過的文字），不引用事實項、不額外呼叫模型，
 * 和其他生成段落一樣從待接受開始，沒有引用所以匯出前要逐段確認（R1）。
 * 描述是空白的經歷沒有原文可沿用，不補（經歷標題仍由 Profile 帶入模板）。
 */
import type { Id, Profile, ResumeSection } from '@rolecraft/contracts';

import type { SectionPlacement } from './types.ts';

export const FALLBACK_RATIONALE =
  '這段經歷沒有可用的改寫稿（模型沒有產出或沒通過檢查），先沿用原文；可以接受、改寫或刪除。';

type ExperiencePlacement = Extract<SectionPlacement, { kind: 'experience' }>;

export interface FallbackSection {
  readonly section: ResumeSection;
  readonly placement: ExperiencePlacement;
}

const HAS_CONTENT = /\S/u;

/** 經歷描述是否有內容；空白的經歷沒有原文可改寫，提示要求不輸出、也不補段。 */
export function hasDescription(description: string): boolean {
  return HAS_CONTENT.test(description);
}

/** 還沒有任何段落的經歷，依 Profile 順序各補一段沿用原文。 */
export function fallbackExperienceSections(
  ctx: { readonly profile: Profile; readonly newId: () => Id },
  existing: readonly { readonly placement: SectionPlacement }[],
): FallbackSection[] {
  const covered = new Set(
    existing.flatMap(({ placement }) =>
      placement.kind === 'experience' ? [placement.experienceIndex] : [],
    ),
  );
  return ctx.profile.experiences.flatMap((experience, index): FallbackSection[] => {
    if (covered.has(index) || !hasDescription(experience.description)) return [];
    return [
      {
        section: {
          id: ctx.newId(),
          origin: 'generated',
          text: experience.description,
          citations: [],
          sectionConfirmation: null,
          generatedCitations: [],
          rationale: FALLBACK_RATIONALE,
          decision: 'pending',
        },
        placement: {
          kind: 'experience',
          experienceIndex: index,
          company: experience.company,
          title: experience.title,
          startDate: experience.startDate,
          endDate: experience.endDate,
          originalText: experience.description,
        },
      },
    ];
  });
}
