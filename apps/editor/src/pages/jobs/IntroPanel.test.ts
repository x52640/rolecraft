// @vitest-environment jsdom
// P1-T064 投遞自介（D25、D7）：產生、失敗原因、編輯後重跑檢查與複製停用、重新產生前確認覆寫。
import type { ApplicationIntro } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import {
  fakeBridge,
  passingCheck,
  sampleSnapshot,
  type FakeBridge,
} from './fake-bridge.test-helpers.ts';
import { INTERRUPTED_TEXT } from './useIntro.ts';
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
      // 間接呼叫：測試中途可換掉 fake.transport（卡住某個操作）
      transport: { send: (request) => fake.transport.send(request) },
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
    fake.introCheck = passingCheck(TEXT);
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
    fake.introCheck = passingCheck(TEXT);
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

describe('對抗驗證與 codex 修正', () => {
  function withIntro(fake: FakeBridge) {
    fake.intro = saved();
    fake.introCheck = passingCheck(TEXT);
  }

  /** 讓某個操作的回應卡住，直到呼叫 release。 */
  function hold(fake: FakeBridge, op: string) {
    const inner = fake.transport;
    const gate = { active: false, pass: 0, releases: [] as (() => void)[] };
    fake.transport = {
      send: async (request) => {
        if (gate.active && (request as { op: string }).op === op && gate.pass-- <= 0) {
          await new Promise<void>((resolve) => gate.releases.push(resolve));
        }
        return inner.send(request);
      },
    };
    return gate;
  }

  it('複製前重新檢查：載入後事實項變得不可用（例如撤銷來源）就不複製並說明', async () => {
    const fake = setup(true, withIntro);
    await screen.findByLabelText('投遞自介（可編輯）');
    expect(button('複製自介')).toHaveProperty('disabled', false);
    fake.introCheck = passingCheck(TEXT, { problem: 'unknown_claim' });
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(button('複製自介'));
    expect((await screen.findByRole('alert')).textContent).toContain('重新檢查沒有通過');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('複製前發現 helper 上的文字和畫面不同：這次不複製，改為同步並提示', async () => {
    const fake = setup(true, withIntro);
    await screen.findByLabelText('投遞自介（可編輯）');
    fake.intro = saved({ text: '別的內容' });
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(button('複製自介'));
    expect((await screen.findByRole('status')).textContent).toContain('在別處有變更');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('產生中 helper 重開（狀態變 null）：顯示產生中斷與再按一次的提示', async () => {
    const fake = setup(true, withIntro);
    fireEvent.click(await screen.findByRole('button', { name: '重新產生投遞自介' }));
    await screen.findByText(/產生中/);
    fake.generation = null;
    expect((await screen.findByRole('alert')).textContent).toBe(INTERRUPTED_TEXT);
  });

  it('偵測到產生成功後，編輯框解鎖時已經是新文字（不需再讀一次）', async () => {
    const fake = setup(true, withIntro);
    fireEvent.click(await screen.findByRole('button', { name: '重新產生投遞自介' }));
    await screen.findByText(/產生中/);
    // 拿到「成功」的那次讀取放行，之後的讀取全部卡住：若還要再讀一次才換文字，解鎖時會是舊文字
    const gate = hold(fake, 'intro.get');
    gate.pass = 1;
    gate.active = true;
    fake.intro = saved({ text: '新的自介' });
    fake.introCheck = passingCheck('新的自介');
    fake.generation = { state: 'succeeded', failure: null, problem: null };
    const box = screen.getByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    await waitFor(() => expect(box.disabled).toBe(false));
    expect(box.value).toBe('新的自介');
  });

  it('儲存中不能再按儲存（避免兩次儲存回應亂序蓋掉新狀態）', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText('投遞自介（可編輯）');
    const gate = hold(fake, 'intro.update');
    gate.active = true;
    fireEvent.change(box, { target: { value: '版本 A' } });
    fireEvent.click(button('儲存修改'));
    fireEvent.change(box, { target: { value: '版本 B' } });
    expect(button('儲存修改')).toHaveProperty('disabled', true);
    expect(button('複製自介')).toHaveProperty('disabled', true);
    gate.active = false;
    for (const release of gate.releases) release();
    await screen.findByText(/已儲存/);
    expect(button('儲存修改')).toHaveProperty('disabled', false);
    expect(ops(fake, 'intro.update')).toHaveLength(1);
  });

  it('離開期間產生失敗：重新開啟時顯示失敗原因', async () => {
    setup(true, (fake) => {
      withIntro(fake);
      fake.generation = { state: 'failed', failure: 'check_failed', problem: 'too_long' };
    });
    expect((await screen.findByRole('alert')).textContent).toContain('超過 300 字');
  });

  it('使用者自己加的承諾字眼：只提示，不停用複製（D25）', async () => {
    const fake = setup(true, (f) => {
      withIntro(f);
      f.warnText = (text) => (text.includes('薪') ? 'commits_salary' : null);
    });
    const box = await screen.findByLabelText('投遞自介（可編輯）');
    fireEvent.change(box, { target: { value: `${TEXT}期望薪資面議。` } });
    fireEvent.click(button('儲存修改'));
    await screen.findByText(/已儲存/);
    expect(screen.getByTestId('intro-warning').textContent).toContain('提到薪資待遇');
    expect(button('複製自介')).toHaveProperty('disabled', false);
    expect(fake.introCheck?.problem).toBeNull();
  });

  it('列出引用的事實項、目前狀態與自介寫成的完成程度', async () => {
    setup(true, (fake) => {
      withIntro(fake);
      fake.introCheck = passingCheck(TEXT, {
        citations: [
          {
            claimId: 'c-doc',
            text: '登入功能',
            type: 'feature',
            completionStatus: 'documented_done',
            statedCompletion: 'in_progress',
            usable: true,
          },
          {
            claimId: 'c-gone',
            text: null,
            type: null,
            completionStatus: null,
            statedCompletion: null,
            usable: false,
          },
        ],
      });
    });
    const rows = await screen.findAllByTestId('intro-citation');
    expect(rows[0]?.textContent).toContain('登入功能');
    expect(rows[0]?.textContent).toContain('功能／文件標示完成');
    expect(rows[0]?.textContent).toContain('進行中');
    expect(rows[1]?.textContent).toContain('事實項已不存在');
    expect(rows[1]?.textContent).toContain('目前不能使用');
  });
});

describe('codex 複審修正', () => {
  function withIntro(fake: FakeBridge) {
    fake.intro = saved();
    fake.introCheck = passingCheck(TEXT);
  }

  function holdGets(fake: FakeBridge) {
    const inner = fake.transport;
    const gate = { active: false, releases: [] as (() => void)[] };
    fake.transport = {
      send: async (request) => {
        if (gate.active && (request as { op: string }).op === 'intro.get') {
          await new Promise<void>((resolve) => gate.releases.push(resolve));
        }
        return inner.send(request);
      },
    };
    return gate;
  }

  it('複製重檢期間又改了編輯框：不複製舊內容', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText('投遞自介（可編輯）');
    const gate = holdGets(fake);
    gate.active = true;
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(button('複製自介'));
    await waitFor(() => expect(gate.releases).toHaveLength(1));
    fireEvent.change(box, { target: { value: `${TEXT}（重檢期間改的）` } });
    gate.active = false;
    for (const release of gate.releases) release();
    expect((await screen.findByRole('alert')).textContent).toContain('尚未儲存');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('已儲存內容在別處變了、沒有未存修改：自動同步成新內容，再按一次可複製', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    fake.intro = saved({ text: '別處改過的自介' });
    fake.introCheck = passingCheck('別處改過的自介');
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(button('複製自介'));
    await waitFor(() => expect(box.value).toBe('別處改過的自介'));
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(button('複製自介'));
    await screen.findByText(/已複製/);
    expect(writeText).toHaveBeenCalledWith('別處改過的自介');
  });

  it('有未存修改時：可選擇重新載入（再按一次確認放棄修改）', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    fireEvent.change(box, { target: { value: '我的本地修改' } });
    fake.intro = saved({ text: '別處改過的自介' });
    fake.introCheck = passingCheck('別處改過的自介');
    fireEvent.click(button('重新載入已儲存內容'));
    expect((await screen.findByRole('alert')).textContent).toContain('放棄你尚未儲存的修改');
    expect(box.value).toBe('我的本地修改');
    fireEvent.click(button('重新載入已儲存內容'));
    await waitFor(() => expect(box.value).toBe('別處改過的自介'));
    expect(button('複製自介')).toHaveProperty('disabled', false);
  });
});
