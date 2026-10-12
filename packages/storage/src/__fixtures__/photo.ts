import type { PhotoInput } from '../repositories/photo-repository.ts';

/** 合成的「照片」：不是真的 JPEG，storage 只存位元組、不解碼（影像處理在 helper，P1-T083）。 */
export const photoInput = (label = 'photo-a', over: Partial<PhotoInput> = {}): PhotoInput => ({
  format: 'jpeg',
  width: 600,
  height: 800,
  content: new TextEncoder().encode(`\xff\xd8 synthetic ${label}`),
  ...over,
});
