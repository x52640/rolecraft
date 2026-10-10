// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App.tsx';
import { pathFromHash } from './router.ts';
import { matchRoute, ROUTES } from './routes.ts';

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('路由表', () => {
  it('七個頁面，順序固定', () => {
    expect(ROUTES.map((r) => r.label)).toEqual([
      '匯入',
      '專案',
      '事實項',
      '職缺',
      '履歷',
      '投遞',
      '設定',
    ]);
  });

  it.each([
    ['', ''],
    ['#', ''],
    ['#/', ''],
    ['#/jobs', 'jobs'],
    ['#/jobs/', 'jobs'],
    ['#jobs', 'jobs'],
  ])('pathFromHash(%j) = %j', (hash, path) => {
    expect(pathFromHash(hash)).toBe(path);
  });

  it('空路徑是匯入頁，未知路徑回 null', () => {
    expect(matchRoute('')?.path).toBe('import');
    expect(matchRoute('nope')).toBeNull();
  });
});

describe('<App />', () => {
  it('沒有 hash 時顯示匯入頁，導覽列標示目前頁', () => {
    render(createElement(App, { transport: null }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('匯入');
    const nav = screen.getByRole('navigation', { name: '主要頁面' });
    expect(within(nav).getByRole('link', { name: '匯入' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it.each(ROUTES.map((r) => [r.path, r.label]))('#/%s 顯示「%s」頁', (path, label) => {
    render(createElement(App, { transport: null }));
    goTo(`#/${path}`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label);
    expect(screen.getByRole('note').textContent).toContain('尚未實作');
    const current = screen.getByRole('link', { current: 'page' });
    expect(current.textContent).toBe(label);
  });

  it('未知路徑顯示找不到頁面', () => {
    render(createElement(App, { transport: null }));
    goTo('#/unknown');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('找不到這個頁面');
    expect(screen.queryByRole('link', { current: 'page' })).toBeNull();
  });
});
