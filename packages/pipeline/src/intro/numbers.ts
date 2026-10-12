/**
 * 投遞自介提示的「可用數字」清單（P1-T071）：只列提示裡事實項（含使用者確認文字）與已確認個人資料
 * （只算送進提示的經歷與技能，不含聯絡資訊等個人資料欄位）出現的數字，按出處分行，要求模型只能用清單內的數字。
 * 正規化與擷取跟檢查（check.ts）同一套，清單上的數字照抄就對得上；寫成哪個事實項的數字仍要引用該事實項。
 */
import type { Claim } from '@rolecraft/contracts';
import { extractNumbers } from '@rolecraft/domain';

import { normalizeForGrounding } from '../generation/grounding.ts';
import { claimLabel } from '../generation/prompt.ts';

function numbersIn(texts: readonly string[]): string[] {
  const tokens = texts.flatMap((text) => extractNumbers(normalizeForGrounding(text)));
  return [...new Set(tokens.filter((t) => t.key !== null).map((t) => t.text))];
}

/** 清單內容（放進資料區塊）；完全沒有可用數字時回 null。 */
export function allowedNumbersText(
  claims: readonly Claim[],
  profileValues: readonly string[],
): string | null {
  const lines = claims.flatMap((claim, i) => {
    const numbers = numbersIn([claim.text, claim.basis.userConfirmation?.text ?? '']);
    return numbers.length > 0 ? [`${claimLabel(i)}：${numbers.join('、')}`] : [];
  });
  const fromProfile = numbersIn(profileValues);
  if (fromProfile.length > 0) lines.push(`個人資料：${fromProfile.join('、')}`);
  return lines.length > 0 ? lines.join('\n') : null;
}
