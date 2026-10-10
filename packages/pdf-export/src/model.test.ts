import { describe, expect, it } from 'vitest';

import { SAMPLE_DOCUMENT } from './__fixtures__/sample-document.ts';
import { collectHrefs, validateDocument, type ResumeDocument } from './model.ts';

const base: ResumeDocument = {
  name: '王大明',
  contacts: [],
  sections: [{ heading: '經歷', items: [{ kind: 'paragraph', text: '內容' }] }],
};

describe('validateDocument', () => {
  it('樣本文件沒有問題', () => {
    expect(validateDocument(SAMPLE_DOCUMENT)).toEqual([]);
  });

  it('擋空白姓名、空段落、空標題', () => {
    const doc: ResumeDocument = {
      name: '  ',
      contacts: [],
      sections: [{ heading: '', items: [] }],
    };
    expect(validateDocument(doc)).toEqual([
      { path: 'name', reason: 'empty' },
      { path: 'sections[0].heading', reason: 'empty' },
      { path: 'sections[0].items', reason: 'empty' },
    ]);
  });

  it('擋控制字元', () => {
    const doc: ResumeDocument = {
      ...base,
      sections: [{ heading: '經歷', items: [{ kind: 'bullet', text: '隱藏\u0007字' }] }],
    };
    expect(validateDocument(doc)).toEqual([
      { path: 'sections[0].items[0].text', reason: 'control_char' },
    ]);
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,hi',
    'example.com',
    'https://exa mple.com',
  ])('擋不安全或不完整的連結 %s', (href) => {
    const doc: ResumeDocument = {
      ...base,
      contacts: [{ text: '網站', href }],
      sections: [{ heading: '專案', items: [{ kind: 'link', link: { text: '網站', href } }] }],
    };
    expect(validateDocument(doc)).toEqual([
      { path: 'contacts[0].href', reason: 'unsafe_href' },
      { path: 'sections[0].items[0].link.href', reason: 'unsafe_href' },
    ]);
  });

  it.each(['https://example.com/a?b=1', 'http://example.com', 'mailto:a@example.com'])(
    '允許 %s',
    (href) => {
      expect(validateDocument({ ...base, contacts: [{ text: 'x', href }] })).toEqual([]);
    },
  );
});

describe('collectHrefs', () => {
  it('依出現順序去重', () => {
    const doc: ResumeDocument = {
      ...base,
      contacts: [{ text: 'a', href: 'https://a.example' }, { text: 'b' }],
      sections: [
        {
          heading: '專案',
          items: [
            { kind: 'link', link: { text: 'a', href: 'https://a.example' } },
            { kind: 'link', link: { text: 'c', href: 'https://c.example' } },
          ],
        },
      ],
    };
    expect(collectHrefs(doc)).toEqual(['https://a.example', 'https://c.example']);
  });
});
