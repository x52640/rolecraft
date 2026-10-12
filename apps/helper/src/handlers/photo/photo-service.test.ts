// 照片服務（P1-T083）：真的 storage（記憶體資料庫）＋假選取器＋假重繪器（不開對話框、不開 Chrome）。
// 重點：檢查「存下來的結果」（從資料庫讀回）沒有任何中繼資料，不只信編碼器。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createPhotoProcessor,
  inspectJpeg,
  metadataProblems,
  PhotoProcessError,
  type PhotoProcessor,
  type PhotoRenderer,
} from '@rolecraft/pdf-export';
import { PickerError } from '@rolecraft/sources';
import { createLocalFileStore, createRepositories, openDatabase } from '@rolecraft/storage';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../__fixtures__/requests.ts';
import { dispatch } from '../../bridge/dispatch.ts';
import {
  containsText,
  DEVICE_MARKER,
  dirtyJpeg,
  GPS_MARKER,
  leakyRenderer,
} from './__fixtures__/photo.ts';
import {
  createPhotoService,
  type PhotoFilePicker,
  type PhotoServiceDeps,
} from './photo-service.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-photo-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SOURCE = dirtyJpeg(4000, 3000);

function setup(overrides: Partial<PhotoServiceDeps> = {}, renderer?: PhotoRenderer) {
  const { db } = openDatabase(':memory:');
  const fileStore = createLocalFileStore(path.join(dir, 'files'));
  const processor = createPhotoProcessor({
    renderer: renderer ?? leakyRenderer({ width: 4000, height: 3000 }),
  });
  const picker = vi.fn<PhotoFilePicker>(() => Promise.resolve({ bytes: SOURCE }));
  const deps = { db, fileStore, processor, picker, ...overrides };
  const service = createPhotoService(deps);
  const stored = () => createRepositories(db).photos.get();
  return { db, fileStore, service, picker, stored, deps };
}

function expectClean(bytes: Uint8Array) {
  expect(metadataProblems(bytes)).toEqual([]);
  expect(containsText(bytes, GPS_MARKER)).toBe(false);
  expect(containsText(bytes, DEVICE_MARKER)).toBe(false);
  expect(containsText(bytes, 'Exif')).toBe(false);
}

describe('photo.pick', () => {
  it('帶 EXIF／GPS 的 JPEG：存下的照片沒有任何中繼資料、最長邊 1,200 px；回照片資訊與縮圖', async () => {
    const { service, stored } = setup();
    expect(containsText(SOURCE, GPS_MARKER)).toBe(true);
    const outcome = await service.pick?.();
    expect(outcome).toMatchObject({
      status: 'selected',
      view: { photo: { format: 'jpeg', width: 1200, height: 900 } },
    });
    const saved = stored();
    if (!saved || outcome?.status !== 'selected') throw new Error('應已存照片');
    expectClean(saved.content);
    expect(inspectJpeg(saved.content)).toMatchObject({ width: 1200, height: 900 });
    expect(saved.photo).toEqual(outcome.view.photo);
    expectClean(new Uint8Array(Buffer.from(outcome.view.thumbnail.base64, 'base64')));
  });

  it('PNG（帶 tEXt）同樣處理成乾淨的 JPEG', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
      Buffer.from('IHDR', 'latin1'),
      Buffer.from([0, 0, 0x03, 0x20, 0, 0, 0x02, 0x58, 8, 2, 0, 0, 0, 0, 0, 0, 0]),
      Buffer.from(`tEXtGPS\0${GPS_MARKER}`, 'latin1'),
    ]);
    const { service, stored } = setup(
      { picker: () => Promise.resolve({ bytes: new Uint8Array(png) }) },
      leakyRenderer({ width: 800, height: 600 }),
    );
    expect(await service.pick?.()).toMatchObject({ status: 'selected' });
    expectClean(stored()?.content ?? new Uint8Array());
    expect(stored()?.photo).toMatchObject({ width: 800, height: 600 });
  });

  it('取消：不變動；已有選取視窗開著：busy', async () => {
    const { service, stored, picker } = setup();
    await service.pick?.();
    const before = stored()?.photo;
    picker.mockResolvedValueOnce(null);
    expect(await service.pick?.()).toEqual({ status: 'cancelled' });
    expect(stored()?.photo).toEqual(before);

    let release: (value: null) => void = () => undefined;
    picker.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const first = service.pick?.();
    expect(await service.pick?.()).toEqual({ status: 'busy' });
    release(null);
    expect(await first).toEqual({ status: 'cancelled' });
    expect(stored()?.photo).toEqual(before);
  });

  it('非 JPEG／PNG、超過 10 MB、解不開：拒絕且不寫入；其他選取器失敗照樣丟出', async () => {
    const { service, stored, picker } = setup();
    for (const reason of ['not_image', 'too_large'] as const) {
      picker.mockRejectedValueOnce(new PickerError(reason));
      expect(await service.pick?.()).toMatchObject({ status: 'failed', code: 'invalid_request' });
    }
    picker.mockResolvedValueOnce({ bytes: new TextEncoder().encode('GIF89a') });
    expect(await service.pick?.()).toMatchObject({ status: 'failed', code: 'invalid_request' });
    picker.mockResolvedValueOnce({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]) });
    expect(await service.pick?.()).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('無法解讀') as unknown,
    });
    expect(stored()).toBeNull();
    picker.mockRejectedValueOnce(new PickerError('dialog_failed'));
    await expect(service.pick?.()).rejects.toBeInstanceOf(PickerError);
    // 失敗後選取狀態已釋放
    expect(await service.pick?.()).toMatchObject({ status: 'selected' });
  });

  it('處理逾時：放棄、不寫入；之後才完成也不寫入', async () => {
    let finish: () => void = () => undefined;
    const slow: PhotoRenderer = (request, options) =>
      new Promise((resolve) => {
        finish = () =>
          void leakyRenderer({ width: 4000, height: 3000 })(request, options).then(resolve);
      });
    const { service, stored } = setup({ processTimeoutMs: 20 }, slow);
    expect(await service.pick?.()).toMatchObject({
      status: 'failed',
      code: 'internal_error',
      message: expect.stringContaining('逾時') as unknown,
    });
    finish();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stored()).toBeNull();
  });

  it('處理完已超過選取器期限：不寫入', async () => {
    const times = [0, 0, 5_000];
    const { service, stored } = setup({ now: () => times.shift() ?? 9_999, pickBudgetMs: 1_000 });
    expect(await service.pick?.()).toMatchObject({ status: 'failed', code: 'internal_error' });
    expect(stored()).toBeNull();
  });

  it('更換：配發新照片 ID、只留一張；刪除後 get 回 null', async () => {
    const { service, stored } = setup();
    const first = await service.pick?.();
    const second = await service.pick?.();
    if (first?.status !== 'selected' || second?.status !== 'selected') throw new Error('應選定');
    expect(second.view.photo.id).not.toBe(first.view.photo.id);
    expect(stored()?.photo.id).toBe(second.view.photo.id);
    expect((await service.get?.())?.photo.id).toBe(second.view.photo.id);
    await service.remove?.();
    expect(await service.get?.()).toBeNull();
    expect(stored()).toBeNull();
    await expect(service.remove?.()).resolves.toBeUndefined();
  });

  it('沒有選取器：沒有 pick，get／remove 照常', async () => {
    const { db, fileStore, deps } = setup();
    const service = createPhotoService({ db, fileStore, processor: deps.processor });
    expect('pick' in service).toBe(false);
    expect(await service.get?.()).toBeNull();
  });
});

describe('photo.get', () => {
  it('重啟後（新服務、同資料庫）：小照片直接當縮圖，不開重繪器', async () => {
    const { db, fileStore, service } = setup();
    await service.pick?.();
    const thumbnail = vi.fn<PhotoProcessor['thumbnail']>();
    const processor = { process: vi.fn<PhotoProcessor['process']>(), thumbnail };
    const restarted = createPhotoService({ db, fileStore, processor });
    const view = await restarted.get?.();
    expect(view?.thumbnail.mimeType).toBe('image/jpeg');
    expect(thumbnail).not.toHaveBeenCalled();
  });

  it('大照片：重產縮圖一次後快取；經 dispatch 的回應低於 1 MiB', async () => {
    const big = { width: 4000, height: 3000 };
    const { db, fileStore, service, stored } = setup({}, leakyRenderer(big, 900 * 1024));
    await service.pick?.();
    expect(stored()?.content.length).toBeGreaterThan(900 * 1024);
    const processor = createPhotoProcessor({ renderer: leakyRenderer(big) });
    const thumbnail = vi.spyOn(processor, 'thumbnail');
    const restarted = createPhotoService({ db, fileStore, processor });
    const { response } = await dispatch(
      { op: 'photo.get', payload: {} },
      { photo: restarted },
      recordingLogger(),
    );
    expect(response).toMatchObject({ ok: true, current: { photo: { width: 1200 } } });
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(1024 * 1024);
    await restarted.get?.();
    expect(thumbnail).toHaveBeenCalledTimes(1);
  });

  it('重產舊照片縮圖途中 pick 換了新照片：快取不被舊照片蓋回（對抗審查）', async () => {
    const big = { width: 4000, height: 3000 };
    const { db, fileStore, service } = setup({}, leakyRenderer(big, 300 * 1024));
    await service.pick?.();
    const real = createPhotoProcessor({ renderer: leakyRenderer(big) });
    let finish: (bytes: Uint8Array) => void = () => undefined;
    const processor: PhotoProcessor = {
      process: (source, options) => real.process(source, options),
      thumbnail: () => new Promise((resolve) => (finish = resolve)),
    };
    const restarted = createPhotoService({
      db,
      fileStore,
      processor,
      picker: () => Promise.resolve({ bytes: SOURCE }),
    });
    const pending = restarted.get?.();
    const picked = await restarted.pick?.();
    if (picked?.status !== 'selected') throw new Error('應選定');
    finish(new TextEncoder().encode('stale-thumbnail'));
    await pending;
    const view = await restarted.get?.();
    expect(view?.photo.id).toBe(picked.view.photo.id);
    expect(view?.thumbnail.base64).toBe(picked.view.thumbnail.base64);
  });

  it('重產縮圖失敗：照實丟出（不偽造）', async () => {
    const big = { width: 4000, height: 3000 };
    const { db, fileStore, service } = setup({}, leakyRenderer(big, 300 * 1024));
    await service.pick?.();
    const processor = {
      process: vi.fn<PhotoProcessor['process']>(),
      thumbnail: vi.fn<PhotoProcessor['thumbnail']>(() =>
        Promise.reject(new PhotoProcessError('timeout', '照片處理逾時')),
      ),
    };
    await expect(createPhotoService({ db, fileStore, processor }).get?.()).rejects.toBeInstanceOf(
      PhotoProcessError,
    );
  });
});
