import type { ImportWebCaptureResult } from '@rolecraft/contracts';
import { useId } from 'react';

import { PLATFORM_LABELS, formatTime } from '../../jobs/labels.ts';
import { WebRawBlocks, type RawTarget } from './WebRawBlocks.tsx';

/**
 * 網頁擷取的原文（D28／W4；D29 (b)）：預設收合，按「查看擷取原文」才展開，照原結構呈現、
 * 不顯示區塊編號與種類。截斷時「內容不完整」收合時也持續顯示。
 * 從欄位出處連過來（target）時由上層展開並捲到該區塊。
 */
export function WebPreview(props: {
  result: ImportWebCaptureResult;
  open: boolean;
  onToggle: () => void;
  target: RawTarget | null;
}) {
  const { result, open, onToggle, target } = props;
  const id = useId();
  return (
    <section aria-label="擷取預覽" className="import-source">
      <h2 className="import-section-title">擷取原文</h2>
      <p className="import-hint">
        {PLATFORM_LABELS[result.platform]}・擷取時間 {formatTime(result.capturedAt)}
        。欄位旁有出處原文，點一下可連到這裡對照。
      </p>
      {result.truncated && (
        <p role="note" aria-label="內容不完整" className="import-warning">
          內容不完整：頁面超過擷取上限，只保留了前面的區塊；缺的部分請自行補到表單。
        </p>
      )}
      <p>
        <button
          type="button"
          className="import-btn import-btn-secondary"
          aria-expanded={open}
          aria-controls={`${id}-raw`}
          onClick={onToggle}
        >
          {open ? '收合擷取原文' : '查看擷取原文'}
        </button>
      </p>
      {open && (
        <div
          id={`${id}-raw`}
          className="import-source-scroll"
          tabIndex={0}
          role="group"
          aria-label="擷取原文內容"
        >
          <WebRawBlocks blocks={result.blocks} prefix={`${id}-raw`} target={target} />
        </div>
      )}
    </section>
  );
}
