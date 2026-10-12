// 網頁來源的欄位出處與標黃判定（D29；resume-import「網頁來源的核對（D29）」2026-10-13 再裁定版）。
// 免標示＝值（照抄檢查的正規化後）包含於單一出處區塊的文字且沒有個資標示；其他標黃。不需要欄位對應表。
// 標黃只是提醒，不擋確認；仍要使用者按下確認才寫入（D4）。
import type { ImportWebBlock } from '@rolecraft/contracts';

import type { AiFieldLike, OriginOf } from './ai-form.ts';
import type { FieldOrigin, ProfileForm } from './form-model.ts';

const SPACES = /[\s\u200B-\u200D\u2060\uFEFF]/gu;

/** 與照抄檢查相同的正規化：全半形統一（NFKC）、去掉所有空白與零寬字元。 */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').replace(SPACES, '');
}

/** 區塊給人看的一行：標籤＋值區塊是「標籤：值」。 */
export function blockLine(block: ImportWebBlock): string {
  return block.label === null ? block.text : `${block.label}：${block.text}`;
}

/**
 * 依這次擷取的區塊算出處。一格背後有多個草稿欄位（學歷併列、同值技能）即視為跨區塊 → 標黃；
 * 出處區塊不存在也標黃（保守）。沒有任何出處區塊時不給出處。
 */
export function webOriginOf(blocks: readonly ImportWebBlock[]): OriginOf {
  const texts = new Map(blocks.map((b) => [b.id, normalizeForMatch(b.text)]));
  const contained = (field: AiFieldLike): boolean => {
    const text = field.blockId === undefined ? undefined : texts.get(field.blockId);
    return text !== undefined && text.includes(normalizeForMatch(field.value));
  };
  return (fields) => {
    const blockId = fields.find((f) => f.blockId !== undefined)?.blockId;
    if (blockId === undefined) return undefined;
    if (fields.some((f) => f.containsPersonalData === true)) return { blockId, flag: 'personal' };
    const single = fields.length === 1 && fields.every(contained);
    return { blockId, flag: single ? null : 'cross_block' };
  };
}

/** 表單裡目前標黃的欄位數（確認區提醒用；不擋確認）。 */
export function flaggedCount(form: ProfileForm): number {
  const flagged = (o: FieldOrigin | null | undefined) => (o?.flag ? 1 : 0);
  let n = 0;
  for (const row of form.info) n += flagged(row.origin);
  for (const e of form.experiences) {
    for (const origin of Object.values(e.origins ?? {})) n += flagged(origin);
  }
  for (const origin of form.skillOrigins ?? []) n += flagged(origin);
  return n;
}
