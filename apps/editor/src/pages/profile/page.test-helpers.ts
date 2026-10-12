// 測試用：以 StrictMode＋假 bridge 開個人資料頁，與常用查詢。
import type { ProfileUpdatePayload } from '@rolecraft/contracts';
import { render, screen } from '@testing-library/react';
import { StrictMode, createElement } from 'react';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import { ProfilePage } from './ProfilePage.tsx';
import type { FakeProfileBridge } from './profile.test-helpers.ts';

export function renderPage(fake: FakeProfileBridge) {
  render(
    createElement(
      StrictMode,
      null,
      createElement(BridgeProvider, {
        transport: { send: (request) => fake.transport.send(request) },
        children: createElement(ProfilePage),
      }),
    ),
  );
}

export const input = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
export const button = (name: string | RegExp) => screen.getByRole('button', { name });
export const updates = (fake: FakeProfileBridge) =>
  fake.requests
    .filter((r) => r.op === 'profile.update')
    .map((r) => r.payload as ProfileUpdatePayload);
