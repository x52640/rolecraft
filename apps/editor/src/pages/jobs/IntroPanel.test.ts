// @vitest-environment jsdom
// P1-T064 投遞自介（D25、D7）：產生、失敗原因、編輯後重跑檢查與複製停用、重新產生前確認覆寫。
import type { ApplicationIntro, BridgeRequest, IntroDraft } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import {
  fakeBridge,
  passingCheck,
  sampleSnapshot,
  type FakeBridge,
} from './fake-bridge.test-helpers.ts';
import { INTERRUPTED_TEXT } from './intro-labels.ts';
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
    // 儲存中一律鎖住：編輯框不能改、按鈕都停用
    expect(box).toHaveProperty('disabled', true);
    fireEvent.change(box, { target: { value: '版本 B' } });
    expect(box).toHaveProperty('value', '版本 A');
    expect(button('儲存修改')).toHaveProperty('disabled', true);
    expect(button('複製自介')).toHaveProperty('disabled', true);
    gate.active = false;
    for (const release of gate.releases) release();
    await screen.findByText(/已儲存/);
    expect(box).toHaveProperty('disabled', false);
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

  it('複製重檢期間編輯框鎖住：改不了，複製的就是畫面上的內容', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText('投遞自介（可編輯）');
    const gate = holdGets(fake);
    gate.active = true;
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(button('複製自介'));
    await waitFor(() => expect(gate.releases).toHaveLength(1));
    expect(box).toHaveProperty('disabled', true);
    fireEvent.change(box, { target: { value: `${TEXT}（重檢期間改的）` } });
    expect(box).toHaveProperty('value', TEXT);
    gate.active = false;
    for (const release of gate.releases) release();
    await screen.findByText(/已複製/);
    expect(writeText).toHaveBeenCalledWith(TEXT);
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

describe('codex 第三輪：請求期間一律鎖定、單一版本號', () => {
  function withIntro(fake: FakeBridge) {
    fake.intro = saved();
    fake.introCheck = passingCheck(TEXT);
  }

  function holdOp(fake: FakeBridge, op: string) {
    const inner = fake.transport;
    const gate = { active: false, releases: [] as (() => void)[] };
    fake.transport = {
      send: async (request) => {
        if (gate.active && (request as { op: string }).op === op) {
          await new Promise<void>((resolve) => gate.releases.push(resolve));
        }
        return inner.send(request);
      },
    };
    return gate;
  }

  it('重新載入期間編輯框與按鈕鎖住，打字不會被載入結果蓋掉', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    const gate = holdOp(fake, 'intro.get');
    gate.active = true;
    fireEvent.click(button('重新載入已儲存內容'));
    await waitFor(() => expect(gate.releases).toHaveLength(1));
    expect(box.disabled).toBe(true);
    for (const name of ['重新產生投遞自介', '複製自介', '重新載入已儲存內容']) {
      expect(button(name)).toHaveProperty('disabled', true);
    }
    fireEvent.change(box, { target: { value: '載入期間打的字' } });
    expect(box.value).toBe(TEXT);
    gate.active = false;
    for (const release of gate.releases) release();
    await screen.findByText(/已重新載入/);
    expect(box.disabled).toBe(false);
  });

  it('重新載入的警告綁在版本號：之後儲存成功就失效，再改一次仍要重新確認', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    fireEvent.change(box, { target: { value: '第一次修改' } });
    fireEvent.click(button('重新載入已儲存內容'));
    await screen.findByText(/放棄你尚未儲存的修改/);
    fireEvent.click(button('儲存修改'));
    await screen.findByText(/已儲存（只存在本機/);
    fireEvent.change(box, { target: { value: '第二次修改' } });
    fake.intro = saved({ text: '第一次修改' });
    fireEvent.click(button('重新載入已儲存內容'));
    // 一按不能直接丟掉修改：要重新出現警告
    expect((await screen.findByRole('alert')).textContent).toContain('放棄你尚未儲存的修改');
    expect(box.value).toBe('第二次修改');
    expect(ops(fake, 'intro.get')).toHaveLength(1);
  });

  it('複製重檢期間儲存與編輯都鎖住：晚到的讀取不會蓋掉較新的已儲存內容', async () => {
    const fake = setup(true, withIntro);
    const box = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    const gate = holdOp(fake, 'intro.get');
    gate.active = true;
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
    fireEvent.click(button('複製自介'));
    await waitFor(() => expect(gate.releases).toHaveLength(1));
    expect(box.disabled).toBe(true);
    expect(button('儲存修改')).toHaveProperty('disabled', true);
    expect(button('重新載入已儲存內容')).toHaveProperty('disabled', true);
    gate.active = false;
    for (const release of gate.releases) release();
    await screen.findByText(/已複製/);
    expect(ops(fake, 'intro.update')).toHaveLength(0);
  });
});

describe('codex 第四輪：操作 token、取消舊輪詢、重檢更新中繼資料', () => {
  it('StrictMode 下初次讀取跑兩次：只留一條輪詢（舊的作廢）', async () => {
    const fake = fakeBridge([sampleSnapshot({ confirmedAt: '2026-10-11T01:02:03.000Z' })]);
    fake.intro = saved();
    fake.introCheck = passingCheck(TEXT);
    fake.generation = { state: 'running', failure: null, problem: null };
    render(
      createElement(StrictMode, {
        children: createElement(BridgeProvider, {
          transport: { send: (request) => fake.transport.send(request) },
          children: createElement(IntroPanel, {
            jobSnapshotId: 'job-1',
            confirmed: true,
            poll: { intervalMs: 5, maxPolls: 3 },
          }),
        }),
      }),
    );
    await screen.findByText(/還在產生中/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // 初次讀取兩次（StrictMode）＋一條輪詢 3 次；兩條輪詢會是 2＋6
    expect(ops(fake, 'intro.get')).toHaveLength(5);
    expect(screen.getByLabelText('投遞自介（可編輯）')).toHaveProperty('disabled', false);
  });

  it('複製重檢文字相同但已變成「經使用者編輯」：更新中繼資料，重新產生要先確認', async () => {
    const fake = setup(true, (f) => {
      f.intro = saved();
      f.introCheck = passingCheck(TEXT);
    });
    await screen.findByLabelText('投遞自介（可編輯）');
    fake.intro = saved({ userEdited: true });
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
    fireEvent.click(button('複製自介'));
    await screen.findByText(/已複製/);
    fireEvent.click(button('重新產生投遞自介'));
    expect((await screen.findByRole('alert')).textContent).toContain('覆蓋你編輯過的自介');
    expect(ops(fake, 'intro.generate')).toHaveLength(0);
  });
});

describe('未通過草稿（P1-T071）', () => {
  const DRAFT_TEXT = '載入時間縮短 40%，服務 12 萬名使用者。';
  const FIXED = '載入時間縮短 40%，期待貢獻所長。';
  const DRAFT: IntroDraft = {
    text: DRAFT_TEXT,
    citations: [{ claimId: 'c-metric' }],
    problem: 'number_not_grounded',
    fragments: ['12'],
    generatedAt: '2026-10-12T01:00:00.000Z',
  };

  interface Drafts {
    draft: IntroDraft | null;
    saves: string[];
    /** 儲存草稿的回覆（模擬 helper）；預設通過並成為正式自介 */
    saveReply: (text: string, fake: FakeBridge) => unknown;
  }

  const passSave = (text: string, fake: FakeBridge, drafts: Drafts) => {
    fake.intro = saved({ text, userEdited: true });
    fake.introCheck = passingCheck(text);
    fake.generation = null;
    drafts.draft = null;
    return { ok: true, intro: fake.intro, check: fake.introCheck };
  };

  /** 在假 bridge 外包一層：intro.get 帶草稿、intro.update（draft）走 saveReply。 */
  function setupDraft(prepare: (fake: FakeBridge, drafts: Drafts) => void = () => undefined) {
    const drafts: Drafts = {
      draft: null,
      saves: [],
      saveReply: (text, fake) => passSave(text, fake, drafts),
    };
    const fake = setup(true, (f) => {
      prepare(f, drafts);
      const inner = f.transport;
      f.transport = {
        send: async (request: BridgeRequest) => {
          const req = request as { op: string; payload: { text?: string; draft?: boolean } };
          if (req.op === 'intro.update' && req.payload.draft === true) {
            f.requests.push(req);
            drafts.saves.push(req.payload.text ?? '');
            return drafts.saveReply(req.payload.text ?? '', f);
          }
          const response = (await inner.send(request)) as Record<string, unknown>;
          return req.op === 'intro.get' && response.ok === true
            ? { ...response, draft: drafts.draft }
            : response;
        },
      };
    });
    return { fake, drafts };
  }

  const draftBox = () => screen.findByLabelText<HTMLTextAreaElement>('未通過的草稿（可編輯）');

  it('產生沒通過：顯示草稿、問題與問題位置，標明不能複製（沒有複製按鈕）', async () => {
    const { fake, drafts } = setupDraft();
    fireEvent.click(await screen.findByRole('button', { name: '產生投遞自介' }));
    await screen.findByText(/產生中/);
    drafts.draft = DRAFT;
    fake.generation = { state: 'failed', failure: 'check_failed', problem: 'number_not_grounded' };
    expect((await draftBox()).value).toBe(DRAFT_TEXT);
    expect(screen.getByRole('heading', { name: '未通過檢查的草稿（不能複製）' })).toBeTruthy();
    expect(screen.getByTestId('intro-draft-problem').textContent).toContain('找不到');
    expect(screen.getByTestId('intro-draft-fragments').textContent).toContain('「12」');
    const marked = screen.getByTestId('intro-draft-marked');
    expect(marked.querySelector('mark')?.textContent).toBe('12');
    expect(marked.textContent).toBe(DRAFT_TEXT);
    expect(screen.queryByRole('button', { name: /複製/ })).toBeNull();
    expect(screen.queryByLabelText('投遞自介（可編輯）')).toBeNull();
  });

  it('在草稿上修改並儲存：helper 檢查通過就成為正式自介，可以複製', async () => {
    const { fake, drafts } = setupDraft((_f, d) => (d.draft = DRAFT));
    const box = await draftBox();
    expect(button('儲存草稿並重新檢查')).toHaveProperty('disabled', true);
    fireEvent.change(box, { target: { value: FIXED } });
    fireEvent.click(button('儲存草稿並重新檢查'));
    await screen.findByText(/草稿通過檢查，已存成正式自介/);
    expect(drafts.saves).toEqual([FIXED]);
    expect(ops(fake, 'intro.update')[0]?.payload).toMatchObject({ text: FIXED, draft: true });
    const official = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    expect(official.value).toBe(FIXED);
    expect(screen.queryByLabelText('未通過的草稿（可編輯）')).toBeNull();
    expect(button('複製自介')).toHaveProperty('disabled', false);
  });

  it('儲存草稿仍沒通過：顯示原因，草稿換成這次的修改與新的問題位置', async () => {
    const { drafts } = setupDraft((_f, d) => {
      d.draft = DRAFT;
      d.saveReply = (text) => {
        d.draft = { ...DRAFT, text, fragments: ['99'] };
        return { ok: false, error: { code: 'invalid_request', message: '草稿仍沒有通過檢查' } };
      };
    });
    fireEvent.change(await draftBox(), { target: { value: '載入時間縮短 40%，服務 99 人。' } });
    fireEvent.click(button('儲存草稿並重新檢查'));
    expect((await screen.findByRole('alert')).textContent).toContain('草稿仍沒有通過檢查');
    await waitFor(() =>
      expect(screen.getByTestId('intro-draft-marked').querySelector('mark')?.textContent).toBe(
        '99',
      ),
    );
    expect((await draftBox()).value).toBe('載入時間縮短 40%，服務 99 人。');
    expect(button('儲存草稿並重新檢查')).toHaveProperty('disabled', true);
    expect(drafts.saves).toHaveLength(1);
  });

  it('請 AI 修正：按了才送（帶 fix），有未儲存的草稿修改時停用；修正成功顯示正式自介', async () => {
    const { fake } = setupDraft((_f, d) => (d.draft = DRAFT));
    const box = await draftBox();
    expect(ops(fake, 'intro.generate')).toHaveLength(0);
    fireEvent.change(box, { target: { value: `${DRAFT_TEXT}改` } });
    expect(button('請 AI 修正')).toHaveProperty('disabled', true);
    fireEvent.change(box, { target: { value: DRAFT_TEXT } });
    fireEvent.click(button('儲存草稿並重新檢查')); // 回到原文也算修改：存一次讓它乾淨
    await screen.findByText(/已存成正式自介/);
    expect(ops(fake, 'intro.generate')).toHaveLength(0);
  });

  it('請 AI 修正送出 fix，產生成功後草稿消失、顯示正式自介', async () => {
    const { fake, drafts } = setupDraft((_f, d) => (d.draft = DRAFT));
    await draftBox();
    fireEvent.click(button('請 AI 修正'));
    await screen.findByText(/產生中/);
    expect(ops(fake, 'intro.generate')[0]?.payload).toEqual({ jobSnapshotId: 'job-1', fix: true });
    fake.intro = saved({ text: FIXED });
    fake.introCheck = passingCheck(FIXED);
    drafts.draft = null;
    fake.generation = { state: 'succeeded', failure: null, problem: null };
    const official = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    await waitFor(() => expect(official.value).toBe(FIXED));
    expect(screen.queryByLabelText('未通過的草稿（可編輯）')).toBeNull();
  });

  it('草稿儲存期間鎖住：編輯框與所有按鈕停用，打字不會改內容', async () => {
    let release: (value: unknown) => void = () => undefined;
    setupDraft((f, d) => {
      d.draft = DRAFT;
      d.saveReply = (text) =>
        new Promise((resolve) => {
          release = () => resolve(passSave(text, f, d));
        });
    });
    const box = await draftBox();
    fireEvent.change(box, { target: { value: FIXED } });
    fireEvent.click(button('儲存草稿並重新檢查'));
    await waitFor(() => expect(box).toHaveProperty('disabled', true));
    fireEvent.change(box, { target: { value: '偷改' } });
    expect(box.value).toBe(FIXED);
    expect(button('請 AI 修正')).toHaveProperty('disabled', true);
    expect(button('產生投遞自介')).toHaveProperty('disabled', true);
    release(undefined);
    await screen.findByText(/已存成正式自介/);
  });

  it('草稿有未儲存修改時重新產生：先要求確認', async () => {
    const { fake } = setupDraft((_f, d) => (d.draft = DRAFT));
    fireEvent.change(await draftBox(), { target: { value: FIXED } });
    fireEvent.click(button('產生投遞自介'));
    expect((await screen.findByRole('alert')).textContent).toContain('捨棄草稿上的修改');
    expect(ops(fake, 'intro.generate')).toHaveLength(0);
    fireEvent.click(button('產生投遞自介'));
    await waitFor(() => expect(ops(fake, 'intro.generate')).toHaveLength(1));
  });

  it('已存自介有未儲存修改時，不能儲存草稿（避免蓋掉）', async () => {
    setupDraft((f, d) => {
      f.intro = saved();
      f.introCheck = passingCheck(TEXT);
      d.draft = DRAFT;
    });
    fireEvent.change(await screen.findByLabelText('投遞自介（可編輯）'), {
      target: { value: `${TEXT}改` },
    });
    fireEvent.change(await draftBox(), { target: { value: FIXED } });
    expect(button('儲存草稿並重新檢查')).toHaveProperty('disabled', true);
    expect(screen.getByText(/先儲存或重新載入，才能儲存草稿/)).toBeTruthy();
  });

  it('已存自介有未儲存修改時，請 AI 修正停用並說明，不送出也不蓋掉修改', async () => {
    const { fake } = setupDraft((f, d) => {
      f.intro = saved();
      f.introCheck = passingCheck(TEXT);
      d.draft = DRAFT;
    });
    await draftBox();
    const official = await screen.findByLabelText<HTMLTextAreaElement>('投遞自介（可編輯）');
    await waitFor(() => expect(button('請 AI 修正')).toHaveProperty('disabled', false));
    fireEvent.change(official, { target: { value: `${TEXT}改` } });
    expect(button('請 AI 修正')).toHaveProperty('disabled', true);
    expect(screen.getByText(/才能儲存草稿或請 AI\s*修正/)).toBeTruthy();
    fireEvent.click(button('請 AI 修正'));
    expect(ops(fake, 'intro.generate')).toHaveLength(0);
    expect(official.value).toBe(`${TEXT}改`);
  });

  it('StrictMode 下初次讀取跑兩次：草稿只顯示一份、可以編輯', async () => {
    const fake = fakeBridge([sampleSnapshot({ confirmedAt: '2026-10-11T01:02:03.000Z' })]);
    render(
      createElement(
        StrictMode,
        null,
        createElement(BridgeProvider, {
          transport: {
            send: async (request: BridgeRequest) => {
              const response = (await fake.transport.send(request)) as Record<string, unknown>;
              return request.op === 'intro.get' ? { ...response, draft: DRAFT } : response;
            },
          },
          children: createElement(IntroPanel, {
            jobSnapshotId: 'job-1',
            confirmed: true,
            poll: POLL,
          }),
        }),
      ),
    );
    const box = await draftBox();
    await waitFor(() => expect(box).toHaveProperty('disabled', false));
    expect(screen.getAllByLabelText('未通過的草稿（可編輯）')).toHaveLength(1);
    fireEvent.change(box, { target: { value: FIXED } });
    expect(box.value).toBe(FIXED);
  });
});
