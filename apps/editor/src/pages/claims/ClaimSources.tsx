import type { Claim } from '@rolecraft/contracts';

import { blockNumber } from './labels.ts';

/**
 * 來源原文（R1）：與事實項並列，讓使用者對照。原文只當文字顯示（React 會跳脫），不解讀成指令或連結。
 * 每個片段可展開／收合；預設展開，確認前一定看得到原文。
 */
export function ClaimSources({ claim }: { claim: Claim }) {
  const excerpts = claim.basis.sourceExcerpts;
  if (excerpts.length === 0) {
    return (
      <p className="claim-sources-empty">沒有來源片段；依據只有你的確認（沒有確認就視為未知）。</p>
    );
  }
  return (
    <ul className="claim-sources" aria-label="來源原文">
      {excerpts.map((excerpt, index) => {
        const block = blockNumber(excerpt.location);
        return (
          <li key={`${excerpt.sourceDocumentId}-${String(index)}`}>
            <details open>
              <summary>
                來源 {index + 1}：文件 {excerpt.sourceDocumentId}・第 {excerpt.contentVersion} 版
                {block === null ? '' : `・第 ${String(block)} 段`}
              </summary>
              <blockquote className="claim-excerpt">{excerpt.text}</blockquote>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
