import type { FieldOrigin } from '../form-model.ts';
import { blockLine } from '../web-origin.ts';
import { useWebSource } from '../web-source-context.ts';

const FLAG_TEXT: Record<NonNullable<FieldOrigin['flag']>, string> = {
  cross_block: '標黃：由擷取原文的多處拼成，確認前建議看一下',
  personal: '標黃：含姓名或聯絡資料，確認前建議看一下',
};

/** 欄位是否標黃（D29）：只是提醒，不擋確認。給欄位外框加樣式用。 */
export const flaggedClass = (origin: FieldOrigin | null | undefined): string =>
  origin?.flag ? ' import-flagged' : '';

/**
 * 網頁來源欄位旁的出處（D29）：標黃原因＋出處區塊原文（最多兩行，超過截斷），點一下連到原文區。
 * PDF、手動輸入或沒有出處時不顯示。
 */
export function FieldSource({ origin }: { origin: FieldOrigin | null | undefined }) {
  const web = useWebSource();
  if (!web || !origin) return null;
  const block = web.blocks.get(origin.blockId);
  const line = block ? blockLine(block) : '';
  return (
    <span className="import-origin">
      {origin.flag && (
        <span role="note" aria-label="標黃提醒" className="import-origin-flag">
          {FLAG_TEXT[origin.flag]}
        </span>
      )}
      {block && (
        <button
          type="button"
          className="import-origin-link"
          title={line}
          aria-label={`出處原文：${line}`}
          onClick={() => web.jump(origin.blockId)}
        >
          出處：{line}
        </button>
      )}
    </span>
  );
}
