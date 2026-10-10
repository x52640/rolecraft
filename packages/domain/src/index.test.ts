import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.ts';

describe('@rolecraft/domain', () => {
  it('exposes its package name from the public entry', () => {
    expect(PACKAGE_NAME).toBe('@rolecraft/domain');
  });
});
