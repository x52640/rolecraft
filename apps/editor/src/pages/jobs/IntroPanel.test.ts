// @vitest-environment jsdom
// P1-T064 投遞自介（D25、D7）：產生、失敗原因、編輯後重跑檢查與複製停用、重新產生前確認覆寫。
import type { ApplicationIntro } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import { fakeBridge, sampleSnapshot, type FakeBridge } from './fake-bridge.test-helpers.ts';
import { IntroPanel } from './IntroPanel.tsx';

afterEach(cleanup);

const POLL = { intervalMs: 5, maxPolls: 20 };
const TEXT = '您好，我曾讓載入時間縮短 40%，期待貢獻所長。';

const saved = (over: Partial<ApplicationIntro> = {}): ApplicationIntro => ({
  jobSnapshotId: 'job-1',
  text: TEXT,
  citations: [{ claimId: 'c-metric' }],
  generatedAt: '2026-10-12T01:00:00.000Z',
  userEdited: false,
  ...over,
});

function setup(confirmed = true, prepare: (fake: FakeBridge) => void = () => undefined) {
  const fake = fakeBridge([
    sampleSnapshot({ confirmedAt: confirmed ? '2026-10-11T01:02:03.000Z' : null }),
  ]);
  prepare(fake);
  render(
    createElement(BridgeProvider, {
      transport: fake.transport,
      children: createElement(IntroPanel, { jobSnapshotId: 'job-1', confirmed, poll: POLL }),
    }),
  );
  return fake;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const ops = (fake: FakeBridge, op: string) => fake.requests.filter((r) => r.op === op);

describe('產生投遞自介', () => {
  it('產生成功：顯示自介、字數，檢查通過可以複製；沒有任何送出按鈕', async () => {
    const fake = setup();
    fireEvent.click(await screen.findByRole('button', { name: '產生投遞自介' }));
    await screen.findByText(/產生中/);
    fake.intro = saved();
    fake.introCheck = { length: [...TEXT].length, problem: null };
    fake.generation = { state: 'succeeded', failure: null, problem: null };
    const box = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    await waitFor(() => expect(box.value).toBe(TEXT));
    expect(screen.getByTestId('intro-length').textContent).toContain(`${[...TEXT].length}／300`);
    expect(button('複製自介')).toHaveProperty('disabled', false);
    expect(screen.queryByRole('button', { name: /^送出|^投遞$|^寄出/ })).toBeNull();

    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(button('複製自介'));
    await screen.findByText(/已複製/);
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it('檢查不通過：顯示原因，不存下', async () => {
    const fake = setup();
    fireEvent.click(await screen.findByRole('button', { name: '產生投遞自介' }));
    fake.generation = { state: 'failed', failure: 'check_failed', problem: 'commits_salary' };
    expect((await screen.findByRole('alert')).textContent).toContain('提到薪資待遇');
    expect(screen.queryByLabelText('投遞自介（可編輯）')).toBeNull();
  });

  it('helper 拒絕（沒有可用事實項）：照原文提示', async () => {
    setup(true, (fake) => {
      fake.generateReply = {
        ok: false,
        error: {
          code: 'invalid_request',
          message: '沒有可用的事實項：請先分析專案資料夾，或到事實項頁確認事實項',
        },
      };
    });
    fireEvent.click(await screen.findByRole('button', { name: '產生投遞自介' }));
    expect((await screen.findByRole('alert')).textContent).toContain('請先分析專案資料夾');
  });

  it('快照未確認：不能產生', async () => {
    const fake = setup(false);
    await waitFor(() => expect(ops(fake, 'intro.get')).toHaveLength(1));
    expect(button('產生投遞自介')).toHaveProperty('disabled', true);
    expect(screen.getByText(/請先確認快照/)).toBeTruthy();
  });
});

describe('編輯與複製', () => {
  function withIntro(fake: FakeBridge) {
    fake.intro = saved();
    fake.introCheck = { length: [...TEXT].length, problem: null };
    fake.checkText = (text) => (text.includes('3000') ? 'number_not_grounded' : null);
  }

  it('編輯後未儲存不能複製；加入無依據數字並儲存：檢查不通過、複製停用並說明', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText('投遞自介（可編輯）');
    fireEvent.change(box, { target: { value: `${TEXT}服務 3000 位使用者。` } });
    expect(button('複製自介')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('copy-blocked').textContent).toContain('尚未儲存');
    fireEvent.click(button('儲存修改'));
    await screen.findByText(/已儲存/);
    expect(ops(fake, 'intro.update')[0]?.payload).toMatchObject({
      text: `${TEXT}服務 3000 位使用者。`,
    });
    expect(button('複製自介')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('copy-blocked').textContent).toContain('找不到');
  });

  it('超過 300 字：字數標紅（儲存後由 helper 判定不通過）', async () => {
    setup(true, withIntro);
    const box = await screen.findByLabelText('投遞自介（可編輯）');
    fireEvent.change(box, { target: { value: '經'.repeat(301) } });
    expect(screen.getByTestId('intro-length').textContent).toContain('301／300');
    expect(screen.getByTestId('intro-length').className).toContain('job-field-error');
  });

  it('重新產生前已編輯：先要求確認，再按一次才送出', async () => {
    const fake = setup(true, (f) => {
      withIntro(f);
      f.intro = saved({ userEdited: true });
    });
    fireEvent.click(await screen.findByRole('button', { name: '重新產生投遞自介' }));
    expect((await screen.findByRole('alert')).textContent).toContain('覆蓋你編輯過的自介');
    expect(ops(fake, 'intro.generate')).toHaveLength(0);
    fireEvent.click(button('重新產生投遞自介'));
    await waitFor(() => expect(ops(fake, 'intro.generate')).toHaveLength(1));
  });

  it('沒編輯過：重新產生不需確認', async () => {
    const fake = setup(true, withIntro);
    fireEvent.click(await screen.findByRole('button', { name: '重新產生投遞自介' }));
    await waitFor(() => expect(ops(fake, 'intro.generate')).toHaveLength(1));
  });
});
