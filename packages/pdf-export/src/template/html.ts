/**
 * ResumeDocument → 完整 HTML。內容一律跳脫；頁面以 CSP 禁止腳本與任何網路載入，
 * 只允許 data: 字型（字型由呼叫端先裁切後內嵌）。
 */
import type { ContactItem, ResumeDocument, TemplateItem } from '../model.ts';

import { TEMPLATE_CSS, fontFaceCss, type FontFaceSource } from './style.ts';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (c) => ESCAPES[c] ?? c);
}

/** 連結網址已由 validateDocument 限制協定；這裡只負責跳脫。 */
function anchor(text: string, href: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
}

function contact(c: ContactItem): string {
  return `<li>${c.href === undefined ? escapeHtml(c.text) : anchor(c.text, c.href)}</li>`;
}

function item(i: TemplateItem): string {
  switch (i.kind) {
    case 'entry': {
      const meta =
        i.meta === undefined ? '' : `<span class="entry-meta">${escapeHtml(i.meta)}</span>`;
      return `<div class="entry"><span class="entry-title">${escapeHtml(i.title)}</span>${meta}</div>`;
    }
    case 'paragraph':
      return `<p class="paragraph">${escapeHtml(i.text)}</p>`;
    case 'bullet':
      return `<p class="bullet">${escapeHtml(i.text)}</p>`;
    case 'link':
      return `<p class="link">${anchor(i.link.text, i.link.href)}</p>`;
  }
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:";

export function buildHtml(doc: ResumeDocument, fonts: readonly FontFaceSource[]): string {
  const headline =
    doc.headline === undefined ? '' : `<p class="headline">${escapeHtml(doc.headline)}</p>`;
  const contacts =
    doc.contacts.length === 0
      ? ''
      : `<ul class="contacts">${doc.contacts.map(contact).join('')}</ul>`;
  const sections = doc.sections
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.heading)}</h2>\n${s.items.map(item).join('\n')}</section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${escapeHtml(doc.name)}</title>
<style>
${fontFaceCss(fonts)}
${TEMPLATE_CSS}
</style>
</head>
<body>
<header><h1>${escapeHtml(doc.name)}</h1>${headline}${contacts}</header>
${sections}
</body>
</html>`;
}
