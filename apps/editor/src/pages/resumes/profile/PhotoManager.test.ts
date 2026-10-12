// @vitest-environment jsdom
// P1-T085 照片管理（resume-output「照片」、D19、W19）。
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../../bridge/BridgeProvider.tsx';
import { PHOTO_TEXT } from './profile-labels.ts';
import { ProfilePhotoPanel } from './ProfilePhotoPanel.tsx';
import { fail, fakeHelper, samplePhoto, type FakeHelper } from './profile.test-helpers.ts';

afterEach(cleanup);

function renderPanel(helper: FakeHelper) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ProfilePhotoPanel),
    }),
  );
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const findButton = (name: string) => screen.findByRole<HTMLButtonElement>('button', { name });
const selected = (id: string) => {
  const { photo, thumbnail } = samplePhoto(id);
  return { ok: true, selection: { status: 'selected', photo, thumbnail } };
};
const photoMeta = () => screen.queryByAltText('目前的照片');

describe('照片管理（P1-T085）', () => {
  it('沒有照片：加入前先重讀 photo.get，再開選取器，成功顯示縮圖', async () => {
    const helper = fakeHelper({ pickReply: selected('ph-new') });
    renderPanel(helper);
    fireEvent.click(await findButton('加入照片'));
    await screen.findByText(PHOTO_TEXT.added);
    expect(helper.ops.slice(-2)).toEqual(['photo.get', 'photo.pick']);
    expect(photoMeta()).not.toBeNull();
  });

  it('加入前發現本機已有照片：不開選取器，畫面更新、要走更換確認', async () => {
    const helper = fakeHelper();
    renderPanel(helper);
    await findButton('加入照片');
    helper.photo = samplePhoto('ph-other');
    fireEvent.click(button('加入照片'));
    await screen.findByText(PHOTO_TEXT.appeared);
    expect(helper.ops).not.toContain('photo.pick');
    expect(photoMeta()).not.toBeNull();
  });

  it('更換：先說明 D19、確認後才開選取器；取消確認不送任何請求', async () => {
    const helper = fakeHelper({ photo: samplePhoto(), pickReply: selected('ph-2') });
    renderPanel(helper);
    fireEvent.click(await findButton('更換照片'));
    expect(screen.getByText(PHOTO_TEXT.replaceWarning)).toBeTruthy();
    fireEvent.click(button('取消'));
    expect(helper.ops).not.toContain('photo.pick');

    fireEvent.click(button('更換照片'));
    fireEvent.click(button('確認更換並選擇照片'));
    await screen.findByText(PHOTO_TEXT.replaced);
    expect(helper.ops.filter((op) => op === 'photo.pick')).toHaveLength(1);
  });

  it('更換時在選取視窗取消：照片不變動，並以 photo.get 讀回的狀態顯示', async () => {
    const helper = fakeHelper({ photo: samplePhoto() });
    renderPanel(helper);
    fireEvent.click(await findButton('更換照片'));
    fireEvent.click(button('確認更換並選擇照片'));
    await screen.findByText(new RegExp(PHOTO_TEXT.cancelled));
    expect(helper.ops.slice(-2)).toEqual(['photo.pick', 'photo.get']);
    expect(helper.photo?.photo.id).toBe('ph-1');
    expect(photoMeta()).not.toBeNull();
  });

  it('刪除：先說明、確認後才送；成功後回到沒有照片', async () => {
    const helper = fakeHelper({ photo: samplePhoto() });
    renderPanel(helper);
    fireEvent.click(await findButton('刪除照片'));
    expect(screen.getByText(PHOTO_TEXT.removeWarning)).toBeTruthy();
    expect(helper.ops).not.toContain('photo.remove');
    fireEvent.click(button('確認刪除照片'));
    await screen.findByText(PHOTO_TEXT.removed);
    expect(helper.ops).toContain('photo.remove');
    expect(await findButton('加入照片')).toBeTruthy();
  });

  it('選取逾時但 helper 其實已存好：畫面以 photo.get 讀回的實際狀態為準', async () => {
    const helper = fakeHelper();
    renderPanel(helper);
    await findButton('加入照片');
    helper.pickReply = fail('timeout');
    const realPick = helper.transport.send.bind(helper.transport);
    helper.transport.send = (raw) => {
      // 模擬客戶端逾時、helper 仍完成選取
      if ((raw as { op: string }).op === 'photo.pick') helper.photo = samplePhoto('ph-late');
      return realPick(raw);
    };
    fireEvent.click(button('加入照片'));
    await screen.findByText(new RegExp(PHOTO_TEXT.refreshed));
    expect(helper.ops.slice(-1)).toEqual(['photo.get']);
    expect(photoMeta()).not.toBeNull();
  });

  it('刪除失敗：以 photo.get 讀回的狀態顯示並說明原因', async () => {
    const helper = fakeHelper({ photo: samplePhoto(), removeReply: fail('internal_error') });
    renderPanel(helper);
    fireEvent.click(await findButton('刪除照片'));
    fireEvent.click(button('確認刪除照片'));
    await screen.findByText(/刪除照片沒有完成/);
    expect(helper.ops.slice(-2)).toEqual(['photo.remove', 'photo.get']);
    expect(photoMeta()).not.toBeNull();
  });

  it('helper 未實作照片：顯示明確提示，不顯示加入／更換／刪除', async () => {
    const helper = fakeHelper({ photoGetFailure: fail('not_implemented') });
    renderPanel(helper);
    await screen.findByText(PHOTO_TEXT.notImplemented);
    expect(screen.queryByRole('button', { name: '加入照片' })).toBeNull();
    expect(button('重新讀取照片').disabled).toBe(false);
  });

  it('photo.pick 未實作：提示服務未接上，畫面以 photo.get 為準', async () => {
    const helper = fakeHelper({ pickReply: fail('not_implemented') });
    renderPanel(helper);
    fireEvent.click(await findButton('加入照片'));
    await screen.findByText(new RegExp(PHOTO_TEXT.notImplemented));
    await waitFor(() => expect(button('加入照片').disabled).toBe(false));
  });

  it('讀不到照片狀態：顯示原因，可重新讀取', async () => {
    const helper = fakeHelper({ photoGetFailure: fail('timeout') });
    renderPanel(helper);
    await screen.findByText(PHOTO_TEXT.unknown);
    helper.photoGetFailure = null;
    fireEvent.click(button('重新讀取照片'));
    expect(await findButton('加入照片')).toBeTruthy();
  });
});
