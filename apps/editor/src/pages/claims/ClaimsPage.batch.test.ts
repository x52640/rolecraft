// @vitest-environment jsdom
// 事實項頁實用性（P1-T073）：來源顯示檔名；批次設定完成狀態並確認；不可批次的項目被排除。
import type { Claim } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ClaimsPage } from './ClaimsPage.tsx';

const excerpt = (sourceDocumentId: string) => ({
  sourceDocumentId,
  contentVersion: 1,
  contentHash: 'a'.repeat(64),
  location: 'tb2:0:1/1:abc',
  text: '原文',
});

function make(id: string, text: string, over: Partial<Claim> = {}): Claim {
  return {
    id,
    type: 'feature',
    text,
    completionStatus: 'documented_done',
    basis: { sourceExcerpts: [excerpt('doc-a')], userConfirmation: null },
    reviewStatus: 'normal',
    ...over,
  };
}

const FEATURE = make('c-1', '支援 PDF 匯出');
const DELIVERABLE = make('c-2', '交付安裝包', { type: 'deliverable' });
const ROLE: Claim = { ...make('c-3', '負責後端', { type: 'personal_role' }) };
delete ROLE.completionStatus;
const REVIEW = make('c-4', '支援登入', { reviewStatus: 'needs_review' });
const CONFLICT = make('c-5', '支援搜尋', { reviewStatus: 'source_conflict' });
const REMOVED = make('c-6', '支援匯入', { reviewStatus: 'source_removed' });
const CONFIRMED = make('c-7', '支援標籤', {
  completionStatus: 'planned',
  basis: {
    sourceExcerpts: [excerpt('doc-gone')],
    userConfirmation: { confirmedAt: '2026-10-10T08:00:00.000Z', text: '支援標籤' },
  },
});
const ALL = [FEATURE, DELIVERABLE, ROLE, REVIEW, CONFLICT, REMOVED, CONFIRMED];

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

function fakeHelper() {
  const sent: Sent[] = [];
  const transport: BridgeTransport = {
    send(raw) {
      const req = raw as Sent;
      sent.push(req);
      switch (req.op) {
        case 'claims.list_projects':
          return Promise.resolve({ ok: true, projects: [] });
        case 'claims.list_unassigned':
          return Promise.resolve({
            ok: true,
            claims: ALL,
            sourceNames: [{ sourceDocumentId: 'doc-a', name: '規格.md', rootName: 'rolecraft' }],
          });
        default:
          return Promise.resolve({ ok: true });
      }
    },
  };
  return {
    transport,
    writes: () => sent.filter((s) => !s.op.includes('list') && s.op !== 'analysis.status'),
  };
}

function renderPage(helper: ReturnType<typeof fakeHelper>) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ClaimsPage),
    }),
  );
}

const card = (text: string) => screen.getByRole('article', { name: text });
const box = (text: string) =>
  within(card(text)).getByRole<HTMLInputElement>('checkbox', { name: '加入批次確認' });
const bar = () => screen.getByRole('group', { name: '批次確認' });

afterEach(cleanup);

describe('事實項頁實用性（P1-T073）', () => {
  it('來源顯示檔名與資料夾名稱；查不到名稱的不顯示內部 ID', async () => {
    renderPage(fakeHelper());
    const feature = await screen.findByRole('article', { name: '支援 PDF 匯出' });
    expect(feature.textContent).toContain('來源 1：規格.md（資料夾 rolecraft）・第 1 版・第 1 段');
    expect(feature.textContent).not.toContain('doc-a');
    expect(card('支援標籤').textContent).toContain('已不在來源清單的文件');
    expect(card('支援標籤').textContent).not.toContain('doc-gone');
  });

  it('待複核、來源矛盾、來源已移除、已確認過的不能勾，並說明原因', async () => {
    renderPage(fakeHelper());
    await screen.findByRole('article', { name: '支援 PDF 匯出' });
    const reasons: [string, string][] = [
      ['支援登入', '待複核'],
      ['支援搜尋', '來源矛盾'],
      ['支援匯入', '來源已移除'],
      ['支援標籤', '已確認過'],
    ];
    for (const [text, reason] of reasons) {
      expect(box(text).disabled).toBe(true);
      expect(card(text).textContent).toContain(`不能批次：${reason}`);
    }
    for (const text of ['支援 PDF 匯出', '交付安裝包', '負責後端']) {
      expect(box(text).disabled).toBe(false);
    }
  });

  it('全選只選可批次的；設為「已完成」並確認：先顯示數量，再送出，排除不可批次的', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await screen.findByRole('article', { name: '支援 PDF 匯出' });
    fireEvent.click(within(bar()).getByRole('button', { name: '全選未歸專案中可批次的項目（3）' }));
    const submit = within(bar()).getByRole<HTMLButtonElement>('button', {
      name: '設定並確認（3）',
    });
    // 含功能／交付物：沒選完成狀態不能送（不預設）
    expect(submit.disabled).toBe(true);
    expect(bar().textContent).toContain('請先選「已完成」或「計畫中」');
    fireEvent.change(within(bar()).getByRole('combobox', { name: '把勾選的設為' }), {
      target: { value: 'user_confirmed_done' },
    });
    fireEvent.click(submit);
    expect(helper.writes()).toEqual([]);
    const ask = within(bar()).getByRole('group', { name: '確認批次' });
    expect(ask.textContent).toContain('將確認 3 項：其中 2 項功能／交付物設為「已完成」');
    fireEvent.click(within(ask).getByRole('button', { name: '確定確認' }));
    await screen.findByText('已確認 3 項。');
    expect(helper.writes()).toEqual([
      {
        op: 'claims.confirm',
        payload: {
          claimId: 'c-1',
          text: '支援 PDF 匯出',
          completion: 'user_confirmed_done',
          expectedReviewStatus: 'normal',
        },
      },
      {
        op: 'claims.confirm',
        payload: {
          claimId: 'c-2',
          text: '交付安裝包',
          completion: 'user_confirmed_done',
          expectedReviewStatus: 'normal',
        },
      },
      {
        op: 'claims.confirm',
        payload: { claimId: 'c-3', text: '負責後端', expectedReviewStatus: 'normal' },
      },
    ]);
  });

  it('只勾非功能類型時不需選完成狀態；取消就不送', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await screen.findByRole('article', { name: '負責後端' });
    fireEvent.click(box('負責後端'));
    fireEvent.click(within(bar()).getByRole('button', { name: '設定並確認（1）' }));
    const ask = within(bar()).getByRole('group', { name: '確認批次' });
    expect(ask.textContent).toContain('將確認 1 項（都不是功能／交付物，只確認內容）');
    fireEvent.click(within(ask).getByRole('button', { name: '取消' }));
    expect(helper.writes()).toEqual([]);
    fireEvent.click(within(bar()).getByRole('button', { name: '設定並確認（1）' }));
    fireEvent.click(within(bar()).getByRole('button', { name: '確定確認' }));
    await screen.findByText('已確認 1 項。');
    expect(helper.writes()).toEqual([
      {
        op: 'claims.confirm',
        payload: { claimId: 'c-3', text: '負責後端', expectedReviewStatus: 'normal' },
      },
    ]);
  });
});
