import type { ImportWebBlock } from '@rolecraft/contracts';
import { useEffect, type ReactNode } from 'react';

/** 原文區塊在畫面上的元素 id（欄位出處連過去時捲到這裡）。 */
export const rawBlockDomId = (prefix: string, blockId: string): string => `${prefix}-${blockId}`;

type Run =
  | { kind: 'list'; blocks: ImportWebBlock[] }
  | { kind: 'pairs'; blocks: ImportWebBlock[] }
  | { kind: 'single'; block: ImportWebBlock };

interface Group {
  heading: ImportWebBlock | null;
  runs: Run[];
}

/** 依標題分組；組內連續的清單項併成一個清單、連續的標籤＋值併成兩欄。 */
function groupBlocks(blocks: readonly ImportWebBlock[]): Group[] {
  const groups: Group[] = [{ heading: null, runs: [] }];
  for (const block of blocks) {
    if (block.kind === 'heading' && !block.continues) {
      groups.push({ heading: block, runs: [] });
      continue;
    }
    const runs = (groups.at(-1) as Group).runs;
    const last = runs.at(-1);
    const kind =
      block.kind === 'list_item' ? 'list' : block.kind === 'label_value' ? 'pairs' : null;
    if (kind && last?.kind === kind) last.blocks.push(block);
    else if (kind) runs.push({ kind, blocks: [block] });
    else runs.push({ kind: 'single', block });
  }
  return groups.filter((g) => g.heading !== null || g.runs.length > 0);
}

/**
 * 擷取原文照原結構呈現（D29 (b)）：標題、清單（項目符號、依層級縮排）、標籤＋值兩欄、依標題分組。
 * 不顯示區塊編號與種類；編號只在滑鼠移上（title）或從欄位出處連過去（target）時顯示。
 */
export function WebRawBlocks(props: {
  blocks: readonly ImportWebBlock[];
  prefix: string;
  target: string | null;
}) {
  const { blocks, prefix, target } = props;

  useEffect(() => {
    if (target === null) return;
    const el = document.getElementById(rawBlockDomId(prefix, target));
    el?.scrollIntoView?.({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, [target, prefix]);

  const attrs = (block: ImportWebBlock) => ({
    id: rawBlockDomId(prefix, block.id),
    tabIndex: -1,
    title: `區塊 ${block.id}`,
    className: block.id === target ? 'import-raw-target' : undefined,
  });
  const idTag = (block: ImportWebBlock): ReactNode =>
    block.id === target ? <small className="import-raw-id">區塊 {block.id}</small> : null;

  const run = (r: Run, i: number) => {
    if (r.kind === 'list') {
      return (
        <ul key={i} className="import-raw-list">
          {r.blocks.map((b) => (
            <li key={b.id} {...attrs(b)} style={{ marginLeft: `${String((b.level ?? 1) - 1)}rem` }}>
              {b.text} {idTag(b)}
            </li>
          ))}
        </ul>
      );
    }
    if (r.kind === 'pairs') {
      return (
        <dl key={i} className="import-raw-pairs">
          {r.blocks.map((b) => (
            <div key={b.id} {...attrs(b)}>
              <dt>{b.continues ? '' : b.label}</dt>
              <dd>
                {b.text} {idTag(b)}
              </dd>
            </div>
          ))}
        </dl>
      );
    }
    return (
      <p key={i} {...attrs(r.block)}>
        {r.block.text} {idTag(r.block)}
      </p>
    );
  };

  return (
    <div className="import-raw">
      {groupBlocks(blocks).map((g, i) => (
        <section key={i} className="import-raw-group">
          {g.heading && (
            <div
              role="heading"
              aria-level={Math.min(6, 2 + (g.heading.level ?? 1))}
              {...attrs(g.heading)}
            >
              {g.heading.text} {idTag(g.heading)}
            </div>
          )}
          {g.runs.map(run)}
        </section>
      ))}
    </div>
  );
}
