// @vitest-environment jsdom
// P1-T091 離開前確認：註冊的頁面換頁前要確認，不確認就留在原頁；沒有註冊不攔。
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHashPath, useLeaveGuard } from './router.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', window.location.pathname);
});

function Shell({ message }: { message: string | null }) {
  const path = useHashPath();
  return createElement(
    'div',
    null,
    createElement('p', { 'data-testid': 'path' }, path),
    path === 'a' ? createElement(Guarded, { message }) : null,
  );
}

function Guarded({ message }: { message: string | null }) {
  useLeaveGuard(message);
  return null;
}

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

const shown = () => screen.getByTestId('path').textContent;

describe('離開前確認', () => {
  it('不確認：hash 換回原頁、畫面不動；確認：換頁', () => {
    window.history.replaceState(null, '', '#/a');
    render(createElement(Shell, { message: '有未存修改' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    goTo('#/b');
    expect(confirm).toHaveBeenCalledWith('有未存修改');
    expect(shown()).toBe('a');
    expect(window.location.hash).toBe('#/a');

    confirm.mockReturnValue(true);
    goTo('#/b');
    expect(shown()).toBe('b');
  });

  it('沒有要攔的訊息（null）：直接換頁、不問', () => {
    window.history.replaceState(null, '', '#/a');
    render(createElement(Shell, { message: null }));
    const confirm = vi.spyOn(window, 'confirm');
    goTo('#/b');
    expect(confirm).not.toHaveBeenCalled();
    expect(shown()).toBe('b');
  });

  it('同一頁的 hash 寫法不同不算換頁', () => {
    window.history.replaceState(null, '', '#/a');
    render(createElement(Shell, { message: '有未存修改' }));
    const confirm = vi.spyOn(window, 'confirm');
    goTo('#/a/');
    expect(confirm).not.toHaveBeenCalled();
    expect(shown()).toBe('a');
  });

  it('有訊息時關閉分頁請瀏覽器確認', () => {
    window.history.replaceState(null, '', '#/a');
    render(createElement(Shell, { message: '有未存修改' }));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
