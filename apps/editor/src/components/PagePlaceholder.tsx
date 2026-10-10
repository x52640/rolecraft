import type { ReactNode } from 'react';

interface PagePlaceholderProps {
  title: string;
  /** 這一頁之後要做什麼（一句話）。 */
  summary: string;
  children?: ReactNode;
}

/** 頁面骨架共用外框：標題＋說明＋「尚未實作」提示。 */
export function PagePlaceholder({ title, summary, children }: PagePlaceholderProps) {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">{title}</h1>
      <p>{summary}</p>
      <p role="note" className="placeholder-note">
        此頁尚未實作。
      </p>
      {children}
    </section>
  );
}
