import { useState } from 'react';

import type { Source } from '../profile-model.ts';

const KIND_TEXT = { web: '網頁', pdf: 'PDF' } as const;

/** 超過這個長度或有換行才提供展開（預設最多顯示兩行）。 */
const LONG = 40;

interface SourceNoteProps {
  /** 基準的出處；沒有出處為 null */
  source: Source;
  /** 自行新增的欄位（沒有來源列） */
  added: boolean;
  /** 畫面上的值與基準不同（尚未儲存的修改） */
  changed: boolean;
}

/**
 * 欄位旁的出處（D30）：出處原文最多兩行，可展開到存下的全文；被截斷的標示；
 * 改過的標「已修改」（顯示的仍是原本的出處）；自行新增的標「自行新增」、沒有出處。只供顯示，不會送回 helper。
 */
export function SourceNote({ source, added, changed }: SourceNoteProps) {
  const [open, setOpen] = useState(false);
  if (added) {
    return (
      <span className="pf-source">
        <span className="pf-tag pf-tag-added">自行新增</span>
      </span>
    );
  }
  const modified = changed || source?.modified === true;
  const long = source !== null && (source.text.length > LONG || source.text.includes('\n'));
  return (
    <span className="pf-source">
      {modified ? <span className="pf-tag pf-tag-modified">已修改</span> : null}
      {source === null ? (
        <span className="pf-source-none">沒有出處原文</span>
      ) : (
        <>
          <span
            className={open ? 'pf-source-text' : 'pf-source-text pf-clamp'}
            data-testid="field-source"
          >
            出處（{KIND_TEXT[source.kind]}）：{source.text}
          </span>
          {source.truncated ? (
            <span className="pf-source-cut">（原文超過 300 字，已截斷）</span>
          ) : null}
          {long ? (
            <button
              type="button"
              className="pf-link"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? '收合出處' : '展開出處'}
            </button>
          ) : null}
        </>
      )}
    </span>
  );
}
