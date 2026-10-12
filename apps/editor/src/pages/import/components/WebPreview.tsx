import type { ImportWebBlock, ImportWebCaptureResult } from '@rolecraft/contracts';

import { PLATFORM_LABELS, formatTime } from '../../jobs/labels.ts';

const KIND_TEXT: Record<ImportWebBlock['kind'], string> = {
  heading: '標題',
  list_item: '清單項',
  table_row: '表格列',
  label_value: '標籤＋值',
  paragraph: '段落',
};

/** 區塊的種類、層級（給人看）。 */
function blockMeta(block: ImportWebBlock): string {
  const level = block.level === null ? '' : ` ${String(block.level)}`;
  return `${KIND_TEXT[block.kind]}${level}${block.continues ? '・續行' : ''}`;
}

/**
 * 網頁擷取的原文預覽（D28／W4）：依順序列出區塊，出處顯示「區塊 bN」，不轉成假的頁碼／行號。
 * 截斷時持續顯示「內容不完整」。AI 失敗或不可用時，使用者照這裡的區塊手動輸入。
 */
export function WebPreview({ result }: { result: ImportWebCaptureResult }) {
  return (
    <section aria-label="擷取預覽" className="import-source">
      <h2 className="import-section-title">網頁擷取的區塊</h2>
      <p className="import-hint">
        {PLATFORM_LABELS[result.platform]}・擷取時間 {formatTime(result.capturedAt)}
        。左邊欄位都尚未確認；請對照這裡的區塊逐欄校正。
      </p>
      {result.truncated && (
        <p role="note" aria-label="內容不完整" className="import-warning">
          內容不完整：頁面超過擷取上限，只保留了前面的區塊；缺的部分請自行補到表單。
        </p>
      )}
      <div className="import-source-scroll" tabIndex={0} role="group" aria-label="擷取內容">
        <ol aria-label="擷取到的區塊" className="import-blocks">
          {result.blocks.map((block) => (
            <li key={block.id}>
              <small className="placeholder-note">
                區塊 {block.id}（{blockMeta(block)}）
              </small>{' '}
              {block.label !== null && <strong>{block.label}：</strong>}
              {block.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
