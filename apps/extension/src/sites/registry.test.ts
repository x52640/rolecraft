import { describe, expect, it } from 'vitest';

import {
  classifyUrl,
  findSiteForUrl,
  pageScriptFile,
  resumePageRule,
  rulesOverlap,
  SITE_REGISTRY,
  siteBundles,
  siteResumeScriptFile,
  siteScriptFile,
  type SiteEntry,
} from './registry.ts';

/** 合成的履歷頁規則（實際各站規則在 P1-T077）。 */
const FAKE: SiteEntry = {
  platform: '104',
  hosts: ['www.104.com.tw'],
  jobPathPrefixes: ['/job/'],
  resumePage: {
    hosts: ['pda.104.com.tw'],
    paths: ['/profile/edit'],
    rootSelector: '#root',
    nameSelector: null,
  },
};
const FAKE_REGISTRY = [FAKE];

describe('site registry', () => {
  it('104 職缺頁對得到', () => {
    expect(findSiteForUrl('https://www.104.com.tw/job/abc123?jobsource=x')?.platform).toBe('104');
  });

  it.each([
    'http://www.104.com.tw/job/abc', // 非 https
    'https://www.104.com.tw:8443/job/abc', // 非預設埠
    'https://www.104.com.tw/company/abc', // 非職缺頁
    'https://evil.104.com.tw.example.com/job/abc', // 主機不完全相符
    'https://www.104.com.tw.evil.com/job/abc',
    'chrome-extension://abc/editor/index.html',
    'not a url',
    undefined,
  ])('%s 對不到', (url) => {
    expect(findSiteForUrl(url)).toBeNull();
    expect(classifyUrl(url)).toBeNull();
  });

  it('LinkedIn 不在註冊表（D8）', () => {
    expect(SITE_REGISTRY.map((s) => s.platform as string)).not.toContain('linkedin');
  });

  it('打包檔名依平台與頁型，職缺頁、履歷頁分開兩支', () => {
    expect(siteScriptFile('104')).toBe('sites/104.js');
    expect(siteResumeScriptFile('104')).toBe('sites/104-resume.js');
    expect(pageScriptFile({ site: FAKE, pageType: 'job' })).toBe('sites/104.js');
    expect(pageScriptFile({ site: FAKE, pageType: 'resume' })).toBe('sites/104-resume.js');
  });

  it('打包清單：沒登記履歷頁只打包職缺頁；有登記另打包履歷頁入口', () => {
    expect(siteBundles([{ ...FAKE, resumePage: undefined }]).map((b) => b.file)).toEqual([
      'sites/104.js',
    ]);
    expect(siteBundles(FAKE_REGISTRY)).toEqual([
      { name: 'rolecraftSite104', entry: 'src/sites/104/content.ts', file: 'sites/104.js' },
      {
        name: 'rolecraftResume104',
        entry: 'src/sites/104/resume/content.ts',
        file: 'sites/104-resume.js',
      },
    ]);
  });
});

describe('頁型判斷（web-resume-capture「頁型登記」）', () => {
  it('職缺頁與履歷頁各自對得到', () => {
    expect(classifyUrl('https://www.104.com.tw/job/abc', FAKE_REGISTRY)?.pageType).toBe('job');
    const resume = classifyUrl('https://pda.104.com.tw/profile/edit?vno=1#x', FAKE_REGISTRY);
    expect(resume).toMatchObject({ pageType: 'resume', site: { platform: '104' } });
  });

  it('履歷頁不算職缺頁（findSiteForUrl 只回職缺頁）', () => {
    expect(findSiteForUrl('https://pda.104.com.tw/profile/edit', FAKE_REGISTRY)).toBeNull();
  });

  it.each([
    'https://pda.104.com.tw/profile/edit/', // 路徑要完全相符
    'https://pda.104.com.tw/profile/preview',
    'https://pda.104.com.tw/profile',
    'http://pda.104.com.tw/profile/edit',
    'https://pda.104.com.tw:444/profile/edit',
    'https://pda.104.com.tw.evil.com/profile/edit',
    'https://www.104.com.tw/profile/edit', // 履歷頁主機不同
  ])('%s 不是履歷頁', (url) => {
    expect(classifyUrl(url, FAKE_REGISTRY)?.pageType).not.toBe('resume');
  });

  it('同時符合兩種規則（registry 設錯）：一律不算，不注入也不放行', () => {
    const bad: SiteEntry = {
      ...FAKE,
      resumePage: { ...FAKE.resumePage!, hosts: ['www.104.com.tw'], paths: ['/job/me'] },
    };
    expect(classifyUrl('https://www.104.com.tw/job/me', [bad])).toBeNull();
  });
});

describe('同一站的職缺頁規則與履歷頁規則不得重疊', () => {
  it.each(SITE_REGISTRY)('正式 registry：$platform 不重疊', (site) => {
    expect(rulesOverlap(site)).toBe(false);
  });

  it('合成 registry 不重疊', () => {
    expect(rulesOverlap(FAKE)).toBe(false);
  });

  it('同主機且履歷頁路徑落在職缺頁前綴下：判為重疊', () => {
    const resumePage = { ...FAKE.resumePage!, hosts: ['www.104.com.tw'], paths: ['/job/me'] };
    expect(rulesOverlap({ ...FAKE, resumePage })).toBe(true);
  });

  it('同主機但路徑不在職缺頁前綴下：不重疊', () => {
    const resumePage = { ...FAKE.resumePage!, hosts: ['www.104.com.tw'], paths: ['/resume'] };
    expect(rulesOverlap({ ...FAKE, resumePage })).toBe(false);
  });
});

describe('正式 registry：104 履歷頁（ADR-0004 第 5 節，P1-T077）', () => {
  it('樣本網址（編輯頁，含 vno 查詢字串與 #）是 104 履歷頁', () => {
    const match = classifyUrl('https://pda.104.com.tw/profile/edit?vno=abc123#form-component-bio');
    expect(match).toMatchObject({ pageType: 'resume', site: { platform: '104' } });
    expect(pageScriptFile(match!)).toBe('sites/104-resume.js');
    expect(resumePageRule('104')).toEqual({
      hosts: ['pda.104.com.tw'],
      paths: ['/profile/edit'],
      rootSelector: '#app > .container-sidebar--rwd > .row > .col.main',
      nameSelector: '.form-info .name__text',
    });
  });

  it('104 職缺頁仍是職缺頁、不是履歷頁', () => {
    expect(classifyUrl('https://www.104.com.tw/job/8zywe?jobsource=x')?.pageType).toBe('job');
  });

  it.each([
    'https://pda.104.com.tw/profile/edit/',
    'https://pda.104.com.tw/profile/preview?vno=abc',
    'https://pda.104.com.tw/profile',
    'https://pda.104.com.tw/',
    'https://pda.104.com.tw/profile/edit/basic',
    'https://pda.104.com.tw/PROFILE/EDIT',
    'http://pda.104.com.tw/profile/edit',
    'https://pda.104.com.tw:8443/profile/edit',
    'https://pda.104.com.tw.evil.com/profile/edit',
    'https://evil.pda.104.com.tw/profile/edit',
    'https://www.104.com.tw/profile/edit',
    'https://www.104.com.tw/resumes/',
    'https://www.104.com.tw/company/abc',
    'https://www.104.com.tw/',
  ])('%s 不是 104 履歷頁', (url) => {
    expect(classifyUrl(url)?.pageType).not.toBe('resume');
  });

  it('打包清單含 104 履歷頁入口', () => {
    expect(siteBundles().map((b) => b.entry)).toEqual([
      'src/sites/104/content.ts',
      'src/sites/104/resume/content.ts',
    ]);
  });
});
