// @vitest-environment jsdom
// 履歷頁過期提示（P1-T092、D30 (a)）：假 helper，資料一律合成、去識別化。
import type { Profile, ResumeVersion } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../../bridge/transport.ts';
import { ResumesPage } from '../ResumesPage.tsx';
import { STALE_TEXT, isStale } from './StaleNotice.tsx';

const T = '2026-10-10T08:00:00.000Z';
const TEXT = '負責報表模組改版';

const versionOf = (id: string, profileVersion: number | undefined): ResumeVersion => ({
  id,
  jobSnapshotId: 'job-1',
  createdAt: T,
  sections: [
    {
      id: `${id}-s`,
      origin: 'user_written',
      text: `${TEXT}（${id}）`,
      citations: [],
      sectionConfirmation: { confirmedAt: T, text: `${TEXT}（${id}）` },
      placement: { group: 'summary' },
      decision: 'accepted',
    },
  ],
  ...(profileVersion === undefined ? {} : { profileVersion }),
});

const profileOf = (version: number | undefined): Profile => ({
  id: 'p-1',
  personalInfo: { 姓名: '王小明' },
  experiences: [],
  skills: ['TypeScript'],
  pdfParseConfirmed: true,
  ...(version === undefined ? {} : { version }),
});

interface Fake {
  /** 各履歷版本記下的 profileVersion（undefined＝舊版本沒有記錄） */
  recorded: Record<string, number | undefined>;
  /** profile.get 回的內容（呼叫當下取值） */
  profileReply: unknown;
  /** 設定後 profile.get 要等 release 才回 */
  hold: boolean;
  release: () => void;
  profileGets: number;
  transport: BridgeTransport;
}

function fakeHelper(recorded: Fake['recorded'], profileReply: unknown): Fake {
  const waiting: (() => void)[] = [];
  const fake: Fake = {
    recorded,
    profileReply,
    hold: false,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
    profileGets: 0,
    transport: {
      send(raw) {
        const req = raw as { op: string; payload: Record<string, unknown> };
        const reply = (value: unknown) => Promise.resolve(value);
        switch (req.op) {
          case 'jobs.list':
            return reply({
              ok: true,
              snapshots: [
                {
                  id: 'job-1',
                  platform: '104',
                  captureMethod: 'auto',
                  company: '乙公司',
                  title: '前端工程師',
                  capturedAt: T,
                  userModified: false,
                  confirmedAt: T,
                },
              ],
            });
          case 'resume.list':
            return reply({
              ok: true,
              versions: Object.keys(fake.recorded).map((id) => ({
                resumeVersionId: id,
                createdAt: T,
              })),
            });
          case 'resume.get': {
            const id = req.payload.resumeVersionId as string;
            return reply({ ok: true, version: versionOf(id, fake.recorded[id]), originals: [] });
          }
          case 'resume.check_export':
            return reply({ ok: true, ready: true, issues: [], blockers: [] });
          case 'profile.get': {
            const value = fake.profileReply;
            const done = () => {
              fake.profileGets += 1;
              return value;
            };
            if (!fake.hold) return Promise.resolve().then(done);
            return new Promise((resolve) => waiting.push(() => resolve(done())));
          }
          default:
            return reply({ ok: true });
        }
      },
    },
  };
  return fake;
}

const okProfile = (version: number | undefined) => ({ ok: true, profile: profileOf(version) });
const fail = (code: string, reason?: string) => ({
  ok: false,
  error: { code, message: `合成錯誤：${code}`, ...(reason ? { reason } : {}) },
});

afterEach(cleanup);

async function renderPage(fake: Fake, firstId = Object.keys(fake.recorded)[0] ?? '') {
  render(
    createElement(BridgeProvider, {
      transport: fake.transport,
      children: createElement(ResumesPage),
    }),
  );
  await screen.findByRole('article', { name: `${TEXT}（${firstId}）` });
}

const notice = () => screen.queryByText(STALE_TEXT, { exact: false });
const settle = () => new Promise((r) => setTimeout(r, 0));
/** 等至少 n 次 profile.get 回來（含個人資料區塊自己的讀取）再讓畫面更新。 */
async function afterProfileGets(fake: Fake, n: number) {
  await waitFor(() => expect(fake.profileGets).toBeGreaterThanOrEqual(n));
  await settle();
}
const copyButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /複製這段/ });

describe('isStale', () => {
  it('沒有 profileVersion 視為 0；只比版本號', () => {
    expect(isStale({}, 0)).toBe(false);
    expect(isStale({}, 1)).toBe(true);
    expect(isStale({ profileVersion: 3 }, 3)).toBe(false);
    expect(isStale({ profileVersion: 3 }, 4)).toBe(true);
  });
});

describe('<ResumesPage /> 過期提示（D30 (a)）', () => {
  it('版本號不同：顯示提示，匯出前檢查與複製照常可用', async () => {
    const fake = fakeHelper({ 'v-1': 2 }, okProfile(3));
    await renderPage(fake);
    await screen.findByText(STALE_TEXT, { exact: false });
    expect(screen.getByText(/需要的話重新產生/)).toBeTruthy();
    expect(screen.getByText(/匯出前檢查通過/)).toBeTruthy();
    await waitFor(() => expect(copyButton().disabled).toBe(false));
  });

  it.each([
    ['版本號相同', 3, 3],
    ['舊版本沒有記錄、Profile 版本 0', undefined, 0],
    ['舊版本沒有記錄、Profile 沒有版本號', undefined, undefined],
  ])('%s：不顯示', async (_name, recorded, current) => {
    const fake = fakeHelper({ 'v-1': recorded }, okProfile(current));
    await renderPage(fake);
    await afterProfileGets(fake, 2);
    expect(notice()).toBeNull();
  });

  it('舊版本沒有記錄、Profile 版本大於 0：顯示', async () => {
    const fake = fakeHelper({ 'v-1': undefined }, okProfile(1));
    await renderPage(fake);
    await screen.findByText(STALE_TEXT, { exact: false });
  });

  it.each([
    ['讀取失敗', fail('timeout')],
    ['沒有 Profile', { ok: true, profile: null }],
    ['多份 Profile', fail('invalid_request', 'multiple_profiles')],
  ])('%s：不顯示提示、不擋複製', async (_name, reply) => {
    const fake = fakeHelper({ 'v-1': 2 }, reply);
    await renderPage(fake);
    await afterProfileGets(fake, 2);
    expect(notice()).toBeNull();
    await waitFor(() => expect(copyButton().disabled).toBe(false));
  });

  it('重新整理時重新比對（不自動輪詢）', async () => {
    const fake = fakeHelper({ 'v-1': 1 }, okProfile(1));
    await renderPage(fake);
    await afterProfileGets(fake, 2);
    expect(notice()).toBeNull();
    fake.profileReply = okProfile(2);
    const before = fake.profileGets;
    await settle();
    expect(fake.profileGets).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await screen.findByText(STALE_TEXT, { exact: false });
  });

  it('切換版本：舊版本的 profile.get 晚到不影響新版本的顯示', async () => {
    const fake = fakeHelper({ 'v-1': 1, 'v-2': 5 }, okProfile(1));
    fake.hold = true;
    await renderPage(fake, 'v-1');
    // v-1 的讀取（回 1）還沒回來；之後 Profile 改成 5，切到記錄 5 的 v-2
    fake.hold = false;
    fake.profileReply = okProfile(5);
    fireEvent.change(screen.getByRole('combobox', { name: /^版本/ }), {
      target: { value: 'v-2' },
    });
    await screen.findByRole('article', { name: `${TEXT}（v-2）` });
    await afterProfileGets(fake, 1);
    expect(notice()).toBeNull();
    fake.release();
    await settle();
    await settle();
    expect(notice()).toBeNull();
    expect(screen.getByRole('article', { name: `${TEXT}（v-2）` })).toBeTruthy();
  });

  it('重新整理同一版本：前一次比對的 profile.get 晚到會作廢', async () => {
    const fake = fakeHelper({ 'v-1': 5 }, okProfile(1));
    fake.hold = true;
    await renderPage(fake);
    // 第一次讀取（回 1，會判為過期）還沒回來；Profile 改成 5 後重新整理
    fake.hold = false;
    fake.profileReply = okProfile(5);
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await afterProfileGets(fake, 1);
    expect(notice()).toBeNull();
    fake.release();
    await settle();
    await settle();
    expect(notice()).toBeNull();
  });
});
