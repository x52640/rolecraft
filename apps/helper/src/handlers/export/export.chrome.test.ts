/**
 * 真的用本機 Chrome 匯出的整合測試，只在 RUN_CHROME=1 時跑（沿用 pdf-export 的略過條件）。
 * 字型用 pdf-export 測試用的小子集（只讀檔，不 import 其他套件內部）。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { FontSet } from '@rolecraft/pdf-export';
import { afterEach, describe, expect, it } from 'vitest';

import { exportTestbed, VERSION_ID } from './__fixtures__/testbed.ts';
import { createExportService } from './export-service.ts';

const FIXTURE_FONTS = path.resolve(
  import.meta.dirname,
  '../../../../../packages/pdf-export/src/__fixtures__/fonts',
);

const fonts = (): Promise<FontSet> =>
  Promise.resolve({
    regular: new Uint8Array(readFileSync(path.join(FIXTURE_FONTS, 'fixture-regular.ttf'))),
    bold: new Uint8Array(readFileSync(path.join(FIXTURE_FONTS, 'fixture-bold.ttf'))),
  });

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

describe.runIf(process.env.RUN_CHROME === '1')('匯出接線＋Chrome 列印（RUN_CHROME=1）', () => {
  it('匯出 → 分塊讀回 → 拼回後是合法 PDF 且雜湊與匯出版本一致', async () => {
    const bed = exportTestbed({ loadFonts: fonts });
    cleanups.push(bed.cleanup);
    const service = createExportService(bed.runtime);
    const created = await service.create({ resumeVersionId: VERSION_ID });
    if (!created.ok || created.outcome.status !== 'exported') {
      throw new Error(`應匯出：${JSON.stringify(created)}`);
    }
    const id = created.outcome.exportVersionId;
    const parts: Buffer[] = [];
    let total = 1;
    for (let index = 0; index < total; index++) {
      const read = await service.readPdf({ exportVersionId: id, chunkIndex: index });
      if (!read.ok) throw new Error('應可讀');
      total = read.chunk.total;
      parts.push(Buffer.from(read.chunk.data, 'base64'));
    }
    const pdf = Buffer.concat(parts);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const version = await service.getVersion({ exportVersionId: id });
    if (!version.ok) throw new Error('應有版本');
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(version.version.pdfHash);
  }, 60_000);
});
