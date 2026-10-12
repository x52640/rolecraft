import {
  RESUME_CAPTURE_MAX_BLOCKS,
  RESUME_CAPTURE_MAX_TEXT_BYTES,
  utf8ByteLength,
} from '@rolecraft/contracts';

import type { ResumeBlock } from './types.ts';

export interface LimitedBlocks {
  blocks: ResumeBlock[];
  truncated: boolean;
}

/**
 * 上限（W3）：區塊 2,000、文字含標籤 UTF-8 256 KiB（常數在 contracts）。
 * 超過時只留前面放得下的完整區塊並標截斷；不切開區塊、不跳過後再接著放。
 */
export function applyLimits(blocks: readonly ResumeBlock[]): LimitedBlocks {
  let bytes = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block) break;
    const size =
      utf8ByteLength(block.text) + (block.label === null ? 0 : utf8ByteLength(block.label));
    if (i >= RESUME_CAPTURE_MAX_BLOCKS || bytes + size > RESUME_CAPTURE_MAX_TEXT_BYTES) {
      return { blocks: blocks.slice(0, i), truncated: true };
    }
    bytes += size;
  }
  return { blocks: [...blocks], truncated: false };
}
