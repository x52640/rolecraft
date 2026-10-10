/**
 * 來源片段位置 `SourceExcerpt.location` 的格式與定位（ADR-0006 第 2 項定案）。
 *
 * 格式：`tb2:<起始區塊序號>:<第幾份>/<共幾份>:<指紋1>[,<指紋2>…]`
 * - 指紋依序列出片段涵蓋的每個區塊（片段跨區塊時多於一個）。
 * - 「份」：文件中指紋序列完全相同的連續區塊（例如兩段一字不差的段落）。記下共幾份與引用的
 *   是第幾份（0 起算），判定時份數變了就算區塊有變，避免改掉引用那份、另一份還在卻判成沒變。
 * - 只有一份時，起始序號只是顯示用提示（重排不算變更）；多於一份時起始序號也要一致。
 * - 舊格式 `tb1:<起始區塊序號>:<指紋,…>` 仍可解析，視為「第 0 份／共 1 份」：
 *   新文件裡同一序列超過一份就保守判定區塊有變。
 */

import type { SourceDocument, SourceExcerpt } from '@rolecraft/contracts';

import { normalizeExcerpt, normalizeText, splitBlocks, type TextBlock } from './blocks.ts';

export const LOCATION_SCHEME = 'tb2';

export interface ExcerptLocation {
  readonly startBlock: number;
  /** 引用的是第幾份相同指紋序列（0 起算） */
  readonly ordinal: number;
  /** 文件中相同指紋序列共幾份 */
  readonly count: number;
  readonly fingerprints: readonly string[];
}

const NUM = '(0|[1-9]\\d{0,8})';
const FPS = '([0-9a-f]{64}(?:,[0-9a-f]{64})*)';
const TB2_PATTERN = new RegExp(`^tb2:${NUM}:${NUM}/${NUM}:${FPS}$`, 'u');
const TB1_PATTERN = new RegExp(`^tb1:${NUM}:${FPS}$`, 'u');

export function formatLocation(location: ExcerptLocation): string {
  const { startBlock, ordinal, count, fingerprints } = location;
  if (fingerprints.length === 0) throw new Error('位置至少要涵蓋一個區塊');
  if (!(ordinal >= 0 && ordinal < count)) throw new Error('第幾份必須小於共幾份');
  return `${LOCATION_SCHEME}:${String(startBlock)}:${String(ordinal)}/${String(count)}:${fingerprints.join(',')}`;
}

/** 解析位置字串（tb2，或舊格式 tb1）；格式不符回傳 null（呼叫端應視為無法驗證）。 */
export function parseLocation(value: string): ExcerptLocation | null {
  const tb2 = TB2_PATTERN.exec(value);
  if (tb2?.[1] && tb2[2] && tb2[3] && tb2[4]) {
    const ordinal = Number(tb2[2]);
    const count = Number(tb2[3]);
    if (ordinal >= count) return null;
    return { startBlock: Number(tb2[1]), ordinal, count, fingerprints: tb2[4].split(',') };
  }
  const tb1 = TB1_PATTERN.exec(value);
  if (tb1?.[1] && tb1[2]) {
    return { startBlock: Number(tb1[1]), ordinal: 0, count: 1, fingerprints: tb1[2].split(',') };
  }
  return null;
}

/** 指紋序列依序相同的每一段連續區塊的起始序號（可重疊）。 */
export function findFingerprintRuns(
  blocks: readonly TextBlock[],
  fingerprints: readonly string[],
): number[] {
  const starts: number[] = [];
  if (fingerprints.length === 0) return starts;
  for (let i = 0; i + fingerprints.length <= blocks.length; i++) {
    if (fingerprints.every((fp, k) => blocks[i + k]?.fingerprint === fp)) starts.push(i);
  }
  return starts;
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
  const excerpt = normalizeExcerpt(excerptText);
  if (excerpt.length === 0) return { ok: false, reason: 'empty_excerpt' };
  const blocks = splitBlocks(text);
  const positions = findOccurrences(text, excerpt);
  if (positions.length === 0) return { ok: false, reason: 'not_found' };

  const runsByKey = new Map<string, number[]>();
  const locations = positions.map((at): ExcerptLocation => {
    const covered = blocksCovering(blocks, at, at + excerpt.length);
    const startBlock = covered[0]?.index ?? 0;
    const fingerprints = covered.map((b) => b.fingerprint);
    const key = fingerprints.join(',');
    const runs = runsByKey.get(key) ?? findFingerprintRuns(blocks, fingerprints);
    runsByKey.set(key, runs);
    return { startBlock, ordinal: runs.indexOf(startBlock), count: runs.length, fingerprints };
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
  // 只落在同一組指紋序列（同一區塊，或一字不差的多份）時不算歧義：份數已記在位置裡，
  // 任何一份改動都會讓份數改變而待複核。
  const distinct = new Set(locations.map((l) => l.fingerprints.join(',')));
  const first = locations[0];
  if (distinct.size > 1 || !first) {
    return { ok: false, reason: 'ambiguous', occurrences: positions.length };
  }
  return { ok: true, location: first };
}

export type CreateExcerptResult =
  { readonly ok: true; readonly excerpt: SourceExcerpt } | Extract<LocateResult, { ok: false }>;

/**
 * 由文件目前版本建立來源片段（版本、雜湊、位置、原文）。
 * 原文存去掉首尾空白類字元後的形式（見 `normalizeExcerpt`），與檢查時的比對規則一致。
 */
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
      text: normalizeExcerpt(excerptText),
    },
  };
}
