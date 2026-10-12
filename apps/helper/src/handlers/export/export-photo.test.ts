// 匯出加照片（P1-T084，D28）：照片印進文件、匯出版本記照片 ID 與雜湊；照片不進任何模型輸入。
// 照片用 pdf-export 測試的合成色塊 JPEG（只讀檔，不 import 其他套件內部）。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { PdfExportOutcome, PdfExportRequest } from '@rolecraft/pdf-export';
import { removePhoto, replacePhoto } from '@rolecraft/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportTestbed, fakePdf, VERSION_ID } from './__fixtures__/testbed.ts';
import { createExport } from './export-create.ts';
import { readExportPhoto } from './photo.ts';

const REPO = path.resolve(import.meta.dirname, '../../../../..');
const PHOTO = new Uint8Array(
  readFileSync(path.join(REPO, 'packages/pdf-export/src/__fixtures__/photo.jpg')),
);
const REPORT = { issues: [], pageCount: 1, browserVersion: 'fake', extractedText: '' } as const;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const photoInput = (content = PHOTO) => ({
  format: 'jpeg' as const,
  width: 90,
  height: 120,
  content,
});

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

function setup() {
  const bed = exportTestbed();
  cleanups.push(bed.cleanup);
  return bed;
}

function recorder(onCall?: () => void) {
  const calls: PdfExportRequest[] = [];
  const exportPdf = vi.fn((request: PdfExportRequest): Promise<PdfExportOutcome> => {
    calls.push(request);
    onCall?.();
    return Promise.resolve({ ok: true, pdf: fakePdf(`call-${calls.length}`), report: REPORT });
  });
  return { calls, exportPdf };
}

function exported(response: Awaited<ReturnType<typeof createExport>>): string {
  if (!response.ok || response.outcome.status !== 'exported') {
    throw new Error(`應匯出：${JSON.stringify(response)}`);
  }
  return response.outcome.exportVersionId;
}

describe('export.create：照片（D28）', () => {
  it('沒有照片：文件沒有照片欄、匯出版本不記照片', async () => {
    const { runtime } = setup();
    const { calls, exportPdf } = recorder();
    const id = exported(await createExport({ ...runtime, exportPdf }, VERSION_ID));
    expect(calls[0]?.document).not.toHaveProperty('photo');
    expect(runtime.exports.get(id)).not.toHaveProperty('photo');
  });

  it('有照片：文件帶 JPEG data URI，匯出版本記照片 ID 與雜湊', async () => {
    const { runtime } = setup();
    const stored = runtime.repos.photos.add(photoInput());
    const { calls, exportPdf } = recorder();
    const id = exported(await createExport({ ...runtime, exportPdf }, VERSION_ID));

    const dataUri = calls[0]?.document.photo?.dataUri ?? '';
    expect(dataUri.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(Buffer.from(dataUri.split(',')[1] ?? '', 'base64')).toEqual(Buffer.from(PHOTO));
    expect(runtime.exports.get(id)?.photo).toEqual({
      photoId: stored.photo.id,
      sha256: sha256(PHOTO),
    });
  });

  it('照片印進匯出版本後就是素材：刪除照片時未投遞的含照版本整份刪除（D19）', async () => {
    const { runtime } = setup();
    runtime.repos.photos.add(photoInput());
    const { exportPdf } = recorder();
    const id = exported(await createExport({ ...runtime, exportPdf }, VERSION_ID));
    removePhoto(runtime.db, runtime.fileStore);
    expect(runtime.exports.get(id)).toBeNull();
  });

  it.each([
    [
      '更換',
      (bed: ReturnType<typeof setup>) =>
        replacePhoto(
          bed.runtime.db,
          bed.runtime.fileStore,
          photoInput(new Uint8Array([...PHOTO, 0])),
        ),
    ],
    ['刪除', (bed: ReturnType<typeof setup>) => removePhoto(bed.runtime.db, bed.runtime.fileStore)],
  ])('匯出途中照片被%s：不建立匯出版本', async (_label, change) => {
    const bed = setup();
    bed.runtime.repos.photos.add(photoInput());
    const { exportPdf } = recorder(() => change(bed));
    const response = await createExport({ ...bed.runtime, exportPdf }, VERSION_ID);
    expect(response).toEqual({
      ok: false,
      error: { code: 'internal_error', message: '無法建立匯出版本' },
    });
    expect(bed.runtime.exports.list()).toEqual([]);
  });

  it('照片內容與記錄的雜湊不符：不匯出、不呼叫 PDF', async () => {
    const { runtime } = setup();
    const stored = runtime.repos.photos.add(photoInput());
    const tampered = { ...stored, content: new Uint8Array([...PHOTO, 1]) };
    const { calls, exportPdf } = recorder();
    const repos = { ...runtime.repos, photos: { ...runtime.repos.photos, get: () => tampered } };
    const response = await createExport({ ...runtime, repos, exportPdf }, VERSION_ID);
    expect(response).toEqual({
      ok: false,
      error: { code: 'internal_error', message: '照片內容與紀錄不符，無法匯出' },
    });
    expect(calls).toEqual([]);
    expect(readExportPhoto({ get: () => tampered })).toEqual({ ok: false });
  });
});

/** 會組模型輸入（提示）的程式：履歷生成、自介、AI 分析與整理、匯入、回覆草稿，以及 pipeline。 */
const MODEL_INPUT_DIRS = [
  'apps/helper/src/handlers/resume',
  'apps/helper/src/handlers/intro',
  'apps/helper/src/handlers/analysis',
  'apps/helper/src/handlers/import',
  'apps/helper/src/handlers/messages',
  'packages/pipeline/src',
  'packages/providers/src',
  'packages/resume-import/src',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/u.test(name) && !/\.test(-helpers)?\.tsx?$/u.test(name) ? [full] : [];
  });
}

describe('照片不送模型（D28）', () => {
  it('組模型輸入的程式都不讀照片（不碰 photos 儲存、photo 欄位）', () => {
    const files = MODEL_INPUT_DIRS.flatMap((dir) => sourceFiles(path.join(REPO, dir)));
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((file) => /photo/iu.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => path.relative(REPO, f))).toEqual([]);
  });
});
