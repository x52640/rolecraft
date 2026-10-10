import { describe, expect, it } from 'vitest';

import { findSiteForUrl, SITE_REGISTRY, siteScriptFile } from './registry.ts';

describe('site registry', () => {
  it('104 職缺頁對得到', () => {
    expect(findSiteForUrl('https://www.104.com.tw/job/abc123?jobsource=x')?.platform).toBe('104');
  });

  it.each([
    'http://www.104.com.tw/job/abc', // 非 https
    'https://www.104.com.tw/company/abc', // 非職缺頁
    'https://evil.104.com.tw.example.com/job/abc', // 主機不完全相符
    'https://www.104.com.tw.evil.com/job/abc',
    'chrome-extension://abc/editor/index.html',
    'not a url',
    undefined,
  ])('%s 對不到', (url) => {
    expect(findSiteForUrl(url)).toBeNull();
  });

  it('LinkedIn 不在註冊表（D8）', () => {
    expect(SITE_REGISTRY.map((s) => s.platform as string)).not.toContain('linkedin');
  });

  it('打包檔名依平台', () => {
    expect(siteScriptFile('104')).toBe('sites/104.js');
  });
});
