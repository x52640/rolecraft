// 自介檢查結果（P1-T064）：R1 類問題停用複製；承諾字眼只提示（D25 擁有者裁定）；
// 另列引用的事實項對照（內容、目前狀態、寫成的完成程度），讓使用者在複製前把關措辭（R1）。
import {
  introLength,
  type ApplicationIntro,
  type Claim,
  type IntroCheckView,
  type IntroCitedClaim,
  type Profile,
} from '@rolecraft/contracts';
import { checkIntro, introCommitmentWarning, usableClaims } from '@rolecraft/pipeline';

function citedView(intro: ApplicationIntro, all: readonly Claim[], usable: readonly Claim[]) {
  const byId = new Map(all.map((claim) => [claim.id, claim]));
  const usableIds = new Set(usable.map((claim) => claim.id));
  return intro.citations.map(({ claimId, statedCompletion }): IntroCitedClaim => {
    const claim = byId.get(claimId);
    return {
      claimId,
      text: claim?.text ?? null,
      type: claim?.type ?? null,
      completionStatus: claim?.completionStatus ?? null,
      statedCompletion: statedCompletion ?? null,
      usable: usableIds.has(claimId),
    };
  });
}

/** all：過來源關卡後的全部事實項。 */
export function introCheckView(
  intro: ApplicationIntro,
  all: readonly Claim[],
  profile: Profile | null,
): IntroCheckView {
  const usable = usableClaims(all);
  return {
    length: introLength(intro.text),
    problem: checkIntro(intro.text, intro.citations, { claims: usable, profile }),
    warning: introCommitmentWarning(intro.text),
    citations: citedView(intro, all, usable),
  };
}
