// @vitest-environment jsdom
// P1-T085 個人資料複製（resume-output「內容回填到求職網站」、D28 Q12）。
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../../bridge/BridgeProvider.tsx';
import { PROFILE_TEXT } from './profile-labels.ts';
import { ProfilePhotoPanel } from './ProfilePhotoPanel.tsx';
import { fail, fakeHelper, sampleProfile, type FakeHelper } from './profile.test-helpers.ts';

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});
afterEach(cleanup);

function renderPanel(helper: FakeHelper) {
  return render(
    createElement(StrictMode, {
      children: createElement(BridgeProvider, {
        transport: helper.transport,
        children: createElement(ProfilePhotoPanel),
      }),
    }),
  );
}

const copyButton = (name: string) =>
  screen.getByRole<HTMLButtonElement>('button', { name: `複製${name}` });
const shown = (text: string) => screen.queryByText(text) !== null;

describe('個人資料複製（P1-T085）', () => {
  it('顯示各欄；複製前重新 profile.get，一致才寫入剪貼簿，內容等於讀回的值', async () => {
    const helper = fakeHelper();
    renderPanel(helper);
    await screen.findByText('甲公司');
    expect(shown('2022-03 – 至今')).toBe(true);
    expect(shown('TypeScript、React')).toBe(true);
    helper.ops.length = 0;
    fireEvent.click(copyButton('經歷 1的公司'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('甲公司'));
    expect(helper.ops).toEqual(['profile.get']);
    expect(shown(PROFILE_TEXT.done('公司'))).toBe(true);

    fireEvent.click(copyButton('個人資料的Email'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('xiaoming@example.test'));
    fireEvent.click(copyButton('技能的全部技能'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('TypeScript、React'));
  });

  it('與畫面不一致：不複製、畫面更新成讀回的內容，再按一次才複製新值', async () => {
    const changed = sampleProfile({
      experiences: [{ ...sampleProfile().experiences[0]!, company: '乙公司' }],
    });
    const helper = fakeHelper({
      profileReplies: [
        { ok: true, profile: sampleProfile() },
        { ok: true, profile: sampleProfile() },
        { ok: true, profile: changed },
      ],
    });
    renderPanel(helper);
    await screen.findByText('甲公司');
    fireEvent.click(copyButton('經歷 1的公司'));
    await screen.findByText(PROFILE_TEXT.changed);
    expect(writeText).not.toHaveBeenCalled();
    expect(shown('乙公司')).toBe(true);
    expect(shown('甲公司')).toBe(false);

    fireEvent.click(copyButton('經歷 1的公司'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('乙公司'));
  });

  it('別的欄位變了也不複製（整份比對）', async () => {
    const helper = fakeHelper({
      profileReplies: [
        { ok: true, profile: sampleProfile() },
        { ok: true, profile: sampleProfile() },
        { ok: true, profile: sampleProfile({ skills: ['Go'] }) },
      ],
    });
    renderPanel(helper);
    await screen.findByText('甲公司');
    fireEvent.click(copyButton('經歷 1的公司'));
    await screen.findByText(PROFILE_TEXT.changed);
    expect(writeText).not.toHaveBeenCalled();
    expect(shown('Go')).toBe(true);
  });

  it('重新讀取時已沒有 Profile：不複製、畫面改成沒有個人資料', async () => {
    const helper = fakeHelper({
      profileReplies: [
        { ok: true, profile: sampleProfile() },
        { ok: true, profile: sampleProfile() },
        { ok: true, profile: null },
      ],
    });
    renderPanel(helper);
    await screen.findByText('甲公司');
    fireEvent.click(copyButton('經歷 1的公司'));
    await screen.findByText(PROFILE_TEXT.removed);
    expect(shown(PROFILE_TEXT.none)).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('重新讀取逾時：不複製、畫面不動', async () => {
    const helper = fakeHelper({
      profileReplies: [
        { ok: true, profile: sampleProfile() },
        { ok: true, profile: sampleProfile() },
        fail('timeout'),
      ],
    });
    renderPanel(helper);
    await screen.findByText('甲公司');
    fireEvent.click(copyButton('經歷 1的公司'));
    await screen.findByText(/沒有及時回應/);
    expect(writeText).not.toHaveBeenCalled();
    expect(shown('甲公司')).toBe(true);
  });

  it.each([
    ['沒有 Profile', { ok: true, profile: null }, PROFILE_TEXT.none],
    ['多份 Profile', fail('invalid_request', 'multiple_profiles'), PROFILE_TEXT.multiple],
    ['helper 未實作', fail('not_implemented'), PROFILE_TEXT.notImplemented],
  ])('%s：顯示原因、沒有複製按鈕', async (_name, reply, text) => {
    renderPanel(fakeHelper({ profileReplies: [reply] }));
    await screen.findByText(text);
    expect(screen.queryByRole('button', { name: /^複製/ })).toBeNull();
  });

  it('請求進行中鎖住整個區塊；卸載後晚到的回應作廢', async () => {
    const helper = fakeHelper();
    const view = renderPanel(helper);
    await screen.findByText('甲公司');
    helper.hold = 'profile.get';
    fireEvent.click(copyButton('經歷 1的公司'));
    await waitFor(() => expect(copyButton('經歷 1的職稱').disabled).toBe(true));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '加入照片' }).disabled).toBe(true);
    view.unmount();
    helper.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writeText).not.toHaveBeenCalled();
  });
});

const retryButton = () =>
  screen.findByRole<HTMLButtonElement>('button', { name: '重新讀取個人資料' });

describe('個人資料讀取失敗可重試（codex 審查）', () => {
  it.each([
    ['逾時', 'timeout'],
    ['連不上', 'helper_unavailable'],
  ])('%s：可重新讀取，helper 恢復後顯示內容並可複製', async (_name, code) => {
    const helper = fakeHelper({ profileReplies: [fail(code)] });
    renderPanel(helper);
    const retry = await retryButton();
    await waitFor(() => expect(retry.disabled).toBe(false));
    helper.profileReplies = [{ ok: true, profile: sampleProfile() }];
    fireEvent.click(retry);
    await screen.findByText('甲公司');
    fireEvent.click(copyButton('經歷 1的公司'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('甲公司'));
  });

  it('重新讀取進行中鎖住區塊；卸載後晚到的回應作廢', async () => {
    const helper = fakeHelper({ profileReplies: [fail('timeout')] });
    const view = renderPanel(helper);
    const retry = await retryButton();
    await waitFor(() => expect(retry.disabled).toBe(false));
    helper.hold = 'profile.get';
    fireEvent.click(retry);
    await waitFor(() => expect(retry.disabled).toBe(true));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '加入照片' }).disabled).toBe(true);
    view.unmount();
    helper.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
