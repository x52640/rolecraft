// @vitest-environment jsdom
import type { ResumeSection, ResumeVersion } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../../bridge/transport.ts';
import { ResumesPage } from '../ResumesPage.tsx';
import { COPY_TEXT } from './copy-rules.ts';

const T = '2026-10-10T08:00:00.000Z';
const TEXT = '負責報表模組改版';

const section = (over: Partial<ResumeSection> = {}): ResumeSection => ({
  id: 's-1',
  origin: 'user_written',
  text: TEXT,
  citations: [],
  sectionConfirmation: { confirmedAt: T, text: TEXT },
  placement: { group: 'summary' },
  decision: 'accepted',
  ...over,
});
const versionOf = (s: ResumeSection): ResumeVersion => ({
  id: 'v-1',
  jobSnapshotId: 'job-1',
  createdAt: T,
  sections: [s],
});
const READY = { ok: true, ready: true, issues: [], blockers: [] };
const ISSUE = {
  sectionId: 's-1',
  check: 'numbers',
  code: 'number_unsourced',
  number: '7',
  message: '數字「7」找不到出處',
  resolvableBySectionConfirmation: true,
};

interface Fake {
  section: ResumeSection;
  check: object;
  /** 依序覆寫之後幾次 resume.get 的段落 */
  gets: ResumeSection[];
  /** 設定後 resume.check_export 等到呼叫 release 才回（release 放行所有等待中的） */
  hold: boolean;
  release: () => void;
  ops: string[];
}

function fakeHelper(init: Partial<Pick<Fake, 'section' | 'check'>> = {}): Fake & {
  transport: BridgeTransport;
} {
  const waiting: (() => void)[] = [];
  const fake: Fake = {
    section: init.section ?? section(),
    check: init.check ?? READY,
    gets: [],
    hold: false,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
    ops: [],
  };
  const transport: BridgeTransport = {
    send(raw) {
      const req = raw as { op: string };
      fake.ops.push(req.op);
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
          return reply({ ok: true, versions: [{ resumeVersionId: 'v-1', createdAt: T }] });
        case 'resume.get':
          return reply({
            ok: true,
            version: versionOf(fake.gets.shift() ?? fake.section),
            originals: [],
          });
        case 'resume.check_export': {
          const result = fake.check;
          if (!fake.hold) return reply(result);
          return new Promise((resolve) => {
            waiting.push(() => resolve(result));
          });
        }
        case 'resume.reject_section':
          fake.section = { ...fake.section, decision: 'rejected' };
          return reply({ ok: true });
        default:
          return reply({ ok: true });
      }
    },
  };
  return Object.assign(fake, { transport });
}

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});
afterEach(cleanup);

async function renderPage(helper: ReturnType<typeof fakeHelper>) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ResumesPage),
    }),
  );
  const card = await screen.findByRole('article', { name: TEXT });
  return within(card);
}

type Card = Awaited<ReturnType<typeof renderPage>>;
const copyButton = (card: Card) =>
  card.getByRole<HTMLButtonElement>('button', { name: /複製這段|檢查中/ });

describe('客製履歷段落複製（P1-T086）', () => {
  it('通過檢查且一致：重新讀取、重跑檢查後才寫入剪貼簿', async () => {
    const helper = fakeHelper();
    const card = await renderPage(helper);
    await waitFor(() => expect(copyButton(card).disabled).toBe(false));
    helper.ops.length = 0;
    fireEvent.click(copyButton(card));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
    expect(helper.ops).toEqual(['resume.get', 'resume.check_export', 'resume.get']);
    expect(card.getByRole('status').textContent).toContain(COPY_TEXT.done);
  });

  it.each([
    [
      '有 R1 問題',
      { check: { ok: true, ready: false, issues: [ISSUE], blockers: [] } },
      COPY_TEXT.issues,
    ],
    [
      '只逐段確認、未接受',
      {
        section: section({ decision: 'pending' }),
        check: {
          ok: true,
          ready: false,
          issues: [],
          blockers: [{ sectionId: 's-1', reason: 'pending', message: '修改稿尚未接受' }],
        },
      },
      COPY_TEXT.confirmedNotAccepted,
    ],
    [
      '已退回',
      {
        section: section({ decision: 'rejected' }),
        check: {
          ok: true,
          ready: false,
          issues: [],
          blockers: [{ sectionId: 's-1', reason: 'rejected', message: '已退回' }],
        },
      },
      COPY_TEXT.rejected,
    ],
    [
      '在 blockers 裡（已接受）',
      {
        check: {
          ok: true,
          ready: false,
          issues: [],
          blockers: [{ sectionId: 's-1', reason: 'placement_missing', message: '缺歸屬' }],
        },
      },
      COPY_TEXT.blockers,
    ],
    [
      '沒有檢查結果',
      { check: { ok: false, error: { code: 'internal_error', message: 'x' } } },
      COPY_TEXT.noCheck,
    ],
  ])('%s：不能複製並說明原因', async (_name, init, reason) => {
    const helper = fakeHelper(init);
    const card = await renderPage(helper);
    await waitFor(() => expect(card.getByText(reason)).toBeTruthy());
    expect(copyButton(card).disabled).toBe(true);
    fireEvent.click(copyButton(card));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('有未儲存修改（編輯框開著）：沒有複製按鈕；檢查期間開始編輯也不複製', async () => {
    const helper = fakeHelper();
    const card = await renderPage(helper);
    await waitFor(() => expect(copyButton(card).disabled).toBe(false));
    helper.hold = true;
    fireEvent.click(copyButton(card));
    await waitFor(() => expect(copyButton(card).textContent).toContain('檢查中'));
    fireEvent.click(card.getByRole('button', { name: '改寫' }));
    expect(screen.queryByRole('button', { name: /複製這段|檢查中/ })).toBeNull();
    helper.release();
    await waitFor(() =>
      expect(helper.ops.filter((o) => o === 'resume.get').length).toBeGreaterThan(2),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('重新檢查變成不通過：不複製並顯示原因', async () => {
    const helper = fakeHelper();
    const card = await renderPage(helper);
    await waitFor(() => expect(copyButton(card).disabled).toBe(false));
    helper.check = { ok: true, ready: false, issues: [ISSUE], blockers: [] };
    fireEvent.click(copyButton(card));
    await waitFor(() => expect(card.getByRole('status').textContent).toContain(ISSUE.message));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('重檢期間段落被改：不複製', async () => {
    const helper = fakeHelper();
    const card = await renderPage(helper);
    await waitFor(() => expect(copyButton(card).disabled).toBe(false));
    helper.gets = [section(), section({ text: `${TEXT}（改）`, decision: 'pending' })];
    fireEvent.click(copyButton(card));
    await waitFor(() => expect(card.getByRole('status').textContent).toContain(COPY_TEXT.changed));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('helper 上的文字和畫面不一致：不複製', async () => {
    const helper = fakeHelper();
    const card = await renderPage(helper);
    await waitFor(() => expect(copyButton(card).disabled).toBe(false));
    const other = section({ text: '別處改過的內容', sectionConfirmation: null });
    helper.gets = [other, other];
    fireEvent.click(copyButton(card));
    await waitFor(() => expect(card.getByRole('status').textContent).toContain(COPY_TEXT.mismatch));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('請求進行中鎖住按鈕；期間畫面上的這段被退回，過期回應作廢', async () => {
    const helper = fakeHelper();
    const card = await renderPage(helper);
    await waitFor(() => expect(copyButton(card).disabled).toBe(false));
    helper.hold = true;
    fireEvent.click(copyButton(card));
    await waitFor(() => expect(copyButton(card).disabled).toBe(true));
    fireEvent.click(copyButton(card));
    expect(helper.ops.filter((o) => o === 'resume.check_export').length).toBe(2);
    fireEvent.click(card.getByRole('button', { name: '退回' }));
    await waitFor(() => expect(helper.ops).toContain('resume.reject_section'));
    helper.hold = false;
    helper.release();
    await waitFor(() => expect(card.getByText(COPY_TEXT.stale)).toBeTruthy());
    expect(writeText).not.toHaveBeenCalled();
  });
});
