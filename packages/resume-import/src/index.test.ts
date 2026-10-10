import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.ts';

describe('@rolecraft/resume-import', () => {
  it('exposes its package name from the public entry', () => {
    expect(PACKAGE_NAME).toBe('@rolecraft/resume-import');
  });
});
