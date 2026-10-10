import { describe, expect, it } from 'vitest';

import { normalizeText, splitBlocks } from './blocks.ts';
import { formatLocation, locateExcerpt, parseLocation } from './location.ts';
import { sha256Hex } from './sha256.ts';

const texts = (raw: string) => splitBlocks(raw).map((b) => b.text);

describe('sha256Hex', () => {
  it('matches FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });

  it('encodes non-ASCII as UTF-8', () => {
    // echo -n '中文' | shasum -a 256
    expect(sha256Hex('中文')).toBe(
      '72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21',
    );
  });
});

describe('splitBlocks', () => {
  it('splits on blank lines', () => {
    expect(texts('a\nb\n\nc')).toEqual(['a\nb', 'c']);
  });

  it('treats whitespace-only lines (tabs, full-width space, NBSP, zero-width) as blank', () => {
    expect(texts('a\n \t\nb\n\u3000\u3000\nc\n\u00A0\nd\n\u200B\ne')).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('does not split on a line that has full-width space plus text', () => {
    expect(texts('a\n\u3000更正：先前記載有誤')).toEqual(['a\n\u3000更正：先前記載有誤']);
  });

  it('normalizes CRLF and CR so line-ending changes are not content changes', () => {
    const lf = splitBlocks('# T\n\na\nb\n\nc\n');
    const crlf = splitBlocks('# T\r\n\r\na\r\nb\r\n\r\nc\r\n');
    const cr = splitBlocks('# T\r\ra\rb\r\rc\r');
    expect(crlf.map((b) => b.fingerprint)).toEqual(lf.map((b) => b.fingerprint));
    expect(cr.map((b) => b.fingerprint)).toEqual(lf.map((b) => b.fingerprint));
  });

  it('treats CRLF blank lines with only spaces as separators', () => {
    expect(texts('a\r\n  \r\nb')).toEqual(['a', 'b']);
  });

  it('makes a heading its own block and starts a new block after it', () => {
    expect(texts('# 標題\n內文一\n內文二\n## 小節\n內文三')).toEqual([
      '# 標題',
      '內文一\n內文二',
      '## 小節',
      '內文三',
    ]);
  });

  it('does not treat #hashtag or 4-space-indented # as heading', () => {
    expect(texts('a\n#tag\n    # code')).toEqual(['a\n#tag\n    # code']);
  });

  it('includes the heading path in the fingerprint', () => {
    const a = splitBlocks('## 已完成\n\n功能 X');
    const b = splitBlocks('## 已撤下\n\n功能 X');
    expect(a[1]?.text).toBe(b[1]?.text);
    expect(a[1]?.fingerprint).not.toBe(b[1]?.fingerprint);
    expect(a[1]?.headingPath).toEqual(['## 已完成']);
  });

  it('pops heading stack on same or higher level', () => {
    const blocks = splitBlocks('# A\n## B\nx\n## C\ny\n# D\nz');
    expect(blocks.map((b) => b.headingPath)).toEqual([
      [],
      ['# A'],
      ['# A', '## B'],
      ['# A'],
      ['# A', '## C'],
      [],
      ['# D'],
    ]);
  });

  it('strips a leading BOM', () => {
    expect(normalizeText('\uFEFFa\r\nb')).toBe('a\nb');
  });

  it('returns no blocks for empty or blank text', () => {
    expect(splitBlocks('')).toEqual([]);
    expect(splitBlocks('\n \n\u3000\n')).toEqual([]);
  });
});

describe('location format', () => {
  it('round-trips', () => {
    const loc = { startBlock: 3, fingerprints: ['a'.repeat(64), 'b'.repeat(64)] };
    expect(parseLocation(formatLocation(loc))).toEqual(loc);
  });

  it('rejects malformed strings', () => {
    for (const bad of [
      'L10-L12',
      'tb1:1:',
      'tb1:01:' + 'a'.repeat(64),
      'tb1:1:' + 'A'.repeat(64),
    ]) {
      expect(parseLocation(bad)).toBeNull();
    }
  });
});

describe('locateExcerpt', () => {
  it('finds the block containing the excerpt', () => {
    const res = locateExcerpt('# P\n\n完成登入功能。\n\n其他', '登入功能');
    expect(res.ok && res.location.startBlock).toBe(1);
  });

  it('covers every block when the excerpt spans a blank line', () => {
    const res = locateExcerpt('一\n\n二\n\n三', '一\n\n二');
    expect(res.ok && res.location.fingerprints.length).toBe(2);
  });

  it('refuses to guess when the excerpt appears in different blocks', () => {
    const doc = '已完成匯出\n\n## 計畫\n\n已完成匯出（預計）';
    expect(locateExcerpt(doc, '已完成匯出')).toEqual({
      ok: false,
      reason: 'ambiguous',
      occurrences: 2,
    });
    const second = locateExcerpt(doc, '已完成匯出', 1);
    expect(second.ok && second.location.startBlock).toBe(2);
    expect(locateExcerpt(doc, '已完成匯出', 2)).toMatchObject({
      reason: 'occurrence_out_of_range',
    });
  });

  it('rejects empty, blank or missing excerpts', () => {
    expect(locateExcerpt('a', ' \u3000')).toMatchObject({ reason: 'empty_excerpt' });
    expect(locateExcerpt('a\n\u200B\nb', '\u200B')).toMatchObject({ reason: 'empty_excerpt' });
    expect(locateExcerpt('a', 'b')).toMatchObject({ reason: 'not_found' });
  });

  it('matches a CRLF excerpt against an LF document', () => {
    expect(locateExcerpt('a\nb', 'a\r\nb').ok).toBe(true);
  });
});
