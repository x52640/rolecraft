/**
 * 來源片段位置 `SourceExcerpt.location` 的格式與定位（ADR-0006 第 2 項定案）。
 *
 * 格式：`tb1:<起始區塊序號>:<指紋1>[,<指紋2>…]`
 * - 指紋依序列出片段涵蓋的每個區塊（片段跨區塊時多於一個）。
 * - 比對只看指紋與片段原文；序號只是顯示用提示，重排後可能失準。
 */

import type { SourceDocument, SourceExcerpt } from '@rolecraft/contracts';

import { normalizeText, splitBlocks, type TextBlock } from './blocks.ts';

export const LOCATION_SCHEME = 'tb1';

export interface ExcerptLocation {
  readonly startBlock: number;
  readonly fingerprints: readonly string[];
}

const LOCATION_PATTERN = /^tb1:(0|[1-9]\d{0,8}):([0-9a-f]{64}(?:,[0-9a-f]{64})*)$/u;

export function formatLocation(location: ExcerptLocation): string {
  if (location.fingerprints.length === 0) throw new Error('位置至少要涵蓋一個區塊');
  return `${LOCATION_SCHEME}:${String(location.startBlock)}:${location.fingerprints.join(',')}`;
}

/** 解析位置字串；格式不符回傳 null（呼叫端應視為無法驗證）。 */
export function parseLocation(value: string): ExcerptLocation | null {
  const match = LOCATION_PATTERN.exec(value);
  if (!match?.[1] || !match[2]) return null;
  return { startBlock: Number(match[1]), fingerprints: match[2].split(',') };
}

/** 片段原文正規化後的所有出現位置（可重疊）。 */
export function findOccurrences(normalizedText: string, normalizedExcerpt: string): number[] {
  const positions: number[] = [];
  if (normalizedExcerpt.length === 0) return positions;
  let from = 0;
  for (;;) {
    const at = normalizedText.indexOf(normalizedExcerpt, from);
    if (at === -1) return positions;
    positions.push(at);
    from = at + 1;
  }
}

/** 與 [start, end) 有重疊的連續區塊。 */
export function blocksCovering(blocks: readonly TextBlock[], start: number, end: number) {
  return blocks.filter((b) => b.start < end && b.end > start);
}

export type LocateResult =
  | { readonly ok: true; readonly location: ExcerptLocation }
  | { readonly ok: false; readonly reason: 'empty_excerpt' | 'not_found' }
  | { readonly ok: false; readonly reason: 'ambiguous'; readonly occurrences: number }
  | {
      readonly ok: false;
      readonly reason: 'occurrence_out_of_range';
      readonly occurrences: number;
    };

/**
 * 在文件中找片段，回傳它所在的區塊。片段出現在多個不同區塊時必須指定 `occurrence`
 * （第幾次出現，0 起算），否則回傳 ambiguous，不自行猜測。
 */
export function locateExcerpt(
  documentText: string,
  excerptText: string,
  occurrence?: number,
): LocateResult {
  const text = normalizeText(documentText);
  const excerpt = normalizeText(excerptText);
  if (excerpt.trim().length === 0) return { ok: false, reason: 'empty_excerpt' };
  const blocks = splitBlocks(text);
  const positions = findOccurrences(text, excerpt);
  if (positions.length === 0) return { ok: false, reason: 'not_found' };

  const locations = positions.map((at) => {
    const covered = blocksCovering(blocks, at, at + excerpt.length);
    return {
      startBlock: covered[0]?.index ?? 0,
      fingerprints: covered.map((b) => b.fingerprint),
    };
  });
  // 片段只落在分隔用的空白上（例如只有零寬字元）：沒有區塊可綁。
  if (locations.some((l) => l.fingerprints.length === 0)) {
    return { ok: false, reason: 'empty_excerpt' };
  }
  if (occurrence !== undefined) {
    const chosen = locations[occurrence];
    if (!Number.isInteger(occurrence) || !chosen) {
      return { ok: false, reason: 'occurrence_out_of_range', occurrences: positions.length };
    }
    return { ok: true, location: chosen };
  }
  const distinct = new Set(locations.map((l) => l.fingerprints.join(',')));
  const first = locations[0];
  if (distinct.size > 1 || !first) {
    return { ok: false, reason: 'ambiguous', occurrences: positions.length };
  }
  return { ok: true, location: first };
}

export type CreateExcerptResult =
  { readonly ok: true; readonly excerpt: SourceExcerpt } | Extract<LocateResult, { ok: false }>;

/** 由文件目前版本建立來源片段（版本、雜湊、位置、原文）。 */
export function createSourceExcerpt(
  document: Pick<SourceDocument, 'id' | 'contentVersion' | 'contentHash'>,
  documentText: string,
  excerptText: string,
  occurrence?: number,
): CreateExcerptResult {
  const located = locateExcerpt(documentText, excerptText, occurrence);
  if (!located.ok) return located;
  return {
    ok: true,
    excerpt: {
      sourceDocumentId: document.id,
      contentVersion: document.contentVersion,
      contentHash: document.contentHash,
      location: formatLocation(located.location),
      text: excerptText,
    },
  };
}
