// @vitest-environment jsdom
import type { Claim, ResumeSection, ResumeVersion } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { downgradedClaimIds } from './labels.ts';
import { ResumesPage } from './ResumesPage.tsx';

const T = '2026-10-10T08:00:00.000Z';

const DONE: Claim = {
  id: 'c-done',
  type: 'feature',
  text: '匯出 PDF',
  completionStatus: 'user_confirmed_done',
  basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: '匯出 PDF' } },
  reviewStatus: 'normal',
};
const DOC: Claim = {
  ...DONE,
  id: 'c-doc',
  text: '登入功能',
  completionStatus: 'documented_done',
  basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: '舊' } },
};

const section = (id: string, text: string, over: Partial<ResumeSection> = {}): ResumeSection => ({
  id,
  origin: 'generated',
  text,
  citations: [{ claimId: 'c-done', statedCompletion: 'completed' }],
  generatedCitations: [{ claimId: 'c-done', statedCompletion: 'completed' }],
  sectionConfirmation: null,
  placement: { group: 'experience', company: '甲公司', title: '前端工程師', startDate: '2021-03' },
  rationale: '對應前端需求',
  decision: 'pending',
  ...over,
});

const VERSION: ResumeVersion = {
  id: 'v-1',
  jobSnapshotId: 'job-1',
  createdAt: T,
  sections: [
    section('s-1', '完成匯出 PDF，服務 7 個團隊'),
    section('s-2', '登入功能已上線', {
      placement: { group: 'project' },
      citations: [{ claimId: 'c-doc', statedCompletion: 'completed' }],
      generatedCitations: [{ claimId: 'c-doc', statedCompletion: 'completed' }],
    }),
  ],
};

const CHECK = {
  ok: true,
  ready: false,
  issues: [
    {
      sectionId: 's-1',
      check: 'numbers',
      code: 'number_unsourced',
      number: '7',
      message: '數字「7」在引用的事實項與個人資料中找不到',
      resolvableBySectionConfirmation: true,
    },
    {
      sectionId: 's-2',
      check: 'completion',
      code: 'completed_not_user_confirmed',
      claimId: 'c-doc',
      message: '事實項未經使用者確認完成，不能寫成已完成',
      resolvableBySectionConfirmation: false,
    },
  ],
  blockers: [{ sectionId: 's-1', reason: 'pending', message: '修改稿尚未接受' }],
};

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

function fakeHelper(options: { confirmed?: boolean; check?: object } = {}) {
  const sent: Sent[] = [];
  const transport: BridgeTransport = {
    send(raw) {
      const req = raw as Sent;
      sent.push(req);
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
                confirmedAt: options.confirmed === false ? null : T,
              },
            ],
          });
        case 'resume.list':
          return reply({ ok: true, versions: [{ resumeVersionId: 'v-1', createdAt: T }] });
        case 'resume.get':
          return reply({
            ok: true,
            version: VERSION,
            originals: [{ sectionId: 's-1', text: '負責網站前端開發。' }],
          });
        case 'claims.get':
          return reply({ ok: true, claim: req.payload.claimId === 'c-doc' ? DOC : DONE });
        case 'resume.check_export':
          return reply(options.check ?? CHECK);
        case 'resume.generate':
          return reply({ ok: true, workJobId: 'w-1' });
        default:
          return reply({ ok: true });
      }
    },
  };
  return { transport, sent, ops: () => sent.map((s) => s.op) };
}

function renderPage(helper: ReturnType<typeof fakeHelper>) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ResumesPage),
    }),
  );
}

const card = (text: string) => screen.findByRole('article', { name: text });

afterEach(cleanup);

describe('<ResumesPage />', () => {
  it('原文與修改稿並列，顯示理由、引用與事實項狀態；檢查不過不能匯出', async () => {
    renderPage(fakeHelper());
    const first = within(await card('完成匯出 PDF，服務 7 個團隊'));
    expect(first.getByText('負責網站前端開發。')).toBeTruthy();
    expect(first.getByText(/修改理由：對應前端需求/)).toBeTruthy();
    expect(first.getByText(/本段寫成「已完成」/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('還不能匯出');
    const second = within(await card('登入功能已上線'));
    expect(second.getByText('（這段沒有可對照的原文）')).toBeTruthy();
    expect(second.getByText(/文件標示完成/)).toBeTruthy();
  });

  it('檢查 2 不通過：不提供逐段確認，只給改寫、刪除與到事實項確認的入口', async () => {
    renderPage(fakeHelper());
    const second = within(await card('登入功能已上線'));
    expect(second.queryByRole('button', { name: '逐段確認本段屬實' })).toBeNull();
    expect(second.getByRole('link', { name: '到事實項頁確認' }).getAttribute('href')).toBe(
      '#/claims',
    );
    expect(second.getByRole('button', { name: '改寫' })).toBeTruthy();
    expect(second.getByRole('button', { name: '刪除整段' })).toBeTruthy();
  });

  it('數字出處問題可逐段確認，送出該段目前全文', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    const first = within(await card('完成匯出 PDF，服務 7 個團隊'));
    fireEvent.click(first.getByRole('button', { name: '逐段確認本段屬實' }));
    await waitFor(() => expect(helper.ops()).toContain('resume.confirm_section'));
    expect(helper.sent.find((s) => s.op === 'resume.confirm_section')?.payload).toEqual({
      resumeVersionId: 'v-1',
      sectionId: 's-1',
      text: '完成匯出 PDF，服務 7 個團隊',
    });
  });

  it('接受只接受措辭：不送任何事實項確認，提示不代表確認事實', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    const first = within(await card('完成匯出 PDF，服務 7 個團隊'));
    fireEvent.click(first.getByRole('button', { name: '接受措辭' }));
    await screen.findByText(/不代表確認其中的事實項/);
    expect(helper.ops()).toContain('resume.accept_section');
    expect(helper.ops().some((op) => op.startsWith('claims.confirm'))).toBe(false);
  });

  it('改寫：原有引用不能移除；完成程度調低時強制重看措辭才可儲存', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    const first = within(await card('完成匯出 PDF，服務 7 個團隊'));
    fireEvent.click(first.getByRole('button', { name: '改寫' }));
    const form = within(screen.getByRole('form', { name: '編輯段落' }));
    expect(form.queryByRole('button', { name: '取消新增' })).toBeNull();
    fireEvent.change(form.getByRole('combobox', { name: /寫成的完成程度/ }), {
      target: { value: 'in_progress' },
    });
    expect(form.getByRole('alert').textContent).toContain('完成程度調低');
    const save = form.getByRole<HTMLButtonElement>('button', { name: '儲存' });
    expect(save.disabled).toBe(true);
    fireEvent.click(form.getByRole('checkbox', { name: '我已重看本段措辭' }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(helper.ops()).toContain('resume.edit_section'));
    expect(helper.sent.find((s) => s.op === 'resume.edit_section')?.payload).toMatchObject({
      sectionId: 's-1',
      citations: [{ claimId: 'c-done', statedCompletion: 'in_progress' }],
      completionDowngradeAcknowledged: true,
    });
  });

  it('職缺未確認不能產生；確認後送 resume.generate', async () => {
    const pending = fakeHelper({ confirmed: false });
    renderPage(pending);
    const button = await screen.findByRole<HTMLButtonElement>('button', {
      name: '產生客製履歷',
    });
    expect(button.disabled).toBe(true);
    cleanup();

    const helper = fakeHelper();
    renderPage(helper);
    await card('完成匯出 PDF，服務 7 個團隊');
    fireEvent.click(screen.getByRole('button', { name: '產生客製履歷' }));
    await screen.findByText(/已開始產生客製履歷/);
    expect(helper.sent.find((s) => s.op === 'resume.generate')?.payload).toEqual({
      jobSnapshotId: 'job-1',
    });
  });

  it('全部處理完：顯示可以匯出', async () => {
    renderPage(fakeHelper({ check: { ok: true, ready: true, issues: [], blockers: [] } }));
    await card('完成匯出 PDF，服務 7 個團隊');
    expect(screen.getByRole('status').textContent).toContain('可以匯出');
  });
});

describe('downgradedClaimIds', () => {
  it('已完成→進行中、拿掉標示都算調低；調高與新增不算', () => {
    const before = [
      { claimId: 'a', statedCompletion: 'completed' as const },
      { claimId: 'b', statedCompletion: 'in_progress' as const },
      { claimId: 'c' },
    ];
    expect(
      downgradedClaimIds(before, [
        { claimId: 'a', statedCompletion: 'in_progress' },
        { claimId: 'b' },
        { claimId: 'c', statedCompletion: 'completed' },
        { claimId: 'd', statedCompletion: 'planned' },
      ]),
    ).toEqual(['a', 'b']);
    expect(downgradedClaimIds(before, before)).toEqual([]);
  });
});
