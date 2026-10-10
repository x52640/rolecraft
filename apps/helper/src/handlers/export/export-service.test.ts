import { createHash } from 'node:crypto';

import {
  BRIDGE_CHUNK_BYTES,
  BRIDGE_MAX_CHUNKS,
  BRIDGE_SCHEMAS,
  type BridgeOperation,
} from '@rolecraft/contracts';
import type { PdfExportOutcome } from '@rolecraft/pdf-export';
import { afterEach, describe, expect, it } from 'vitest';

import { createServices } from '../../main.ts';
import { HANDLERS } from '../registry.ts';
import type { HelperServices } from '../services.ts';
import { exportTestbed, fakePdf, VERSION_ID } from './__fixtures__/testbed.ts';
import { chunkCount, chunkOf, fitsChunkLimit } from './chunks.ts';
import { createExportService } from './export-service.ts';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

/** 經分派表呼叫，並確認回應符合 contracts。 */
async function call(op: BridgeOperation, payload: unknown, services: HelperServices) {
  const handler = HANDLERS[op] as (p: unknown, s: HelperServices) => Promise<unknown>;
  const response = await handler(payload, services);
  expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success, JSON.stringify(response)).toBe(
    true,
  );
  return response as { ok: boolean } & Record<string, unknown>;
}

/** 測試台＋以指定 PDF 內容匯出一次。 */
async function exported(pdf: Uint8Array) {
  const bed = exportTestbed();
  cleanups.push(bed.cleanup);
  const report = { issues: [], pageCount: 1, browserVersion: 'fake', extractedText: '' };
  const exportPdf = (): Promise<PdfExportOutcome> => Promise.resolve({ ok: true, pdf, report });
  const services: HelperServices = {
    pdfExport: createExportService({ ...bed.runtime, exportPdf }),
  };
  const created = await call('export.create', { resumeVersionId: VERSION_ID }, services);
  const outcome = created.outcome as { status: string; exportVersionId: string };
  expect(outcome.status).toBe('exported');
  return { ...bed, services, id: outcome.exportVersionId };
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('export.list_versions／get_version', () => {
  it('清單列出職缺公司職稱、PDF 雜湊與大小；單一版本回完整內容', async () => {
    const pdf = fakePdf('list', 1234);
    const { services, id } = await exported(pdf);
    const list = await call('export.list_versions', {}, services);
    expect(list.versions).toEqual([
      expect.objectContaining({
        exportVersionId: id,
        resumeVersionId: VERSION_ID,
        company: '虛構科技',
        title: '後端工程師',
        pdfHash: sha256(pdf),
        pdfBytes: 1234,
      }),
    ]);
    const got = await call('export.get_version', { exportVersionId: id }, services);
    expect(got.version).toMatchObject({ id, resumeVersionId: VERSION_ID });
  });

  it('不存在的 id：invalid_request', async () => {
    const { services } = await exported(fakePdf());
    for (const op of ['export.get_version', 'export.read_pdf'] as const) {
      const response = await call(op, { exportVersionId: 'nope', chunkIndex: 0 }, services);
      expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    }
  });
});

describe('export.read_pdf：P1-T041 分塊協定', () => {
  it('多塊 PDF：逐塊讀、拼回後位元組與 SHA-256 相符；超出範圍 invalid_request', async () => {
    const pdf = fakePdf('multi', BRIDGE_CHUNK_BYTES * 2 + 17);
    pdf[BRIDGE_CHUNK_BYTES] = 7;
    const { services, id } = await exported(pdf);
    const parts: Buffer[] = [];
    for (let index = 0; index < 3; index++) {
      const r = await call('export.read_pdf', { exportVersionId: id, chunkIndex: index }, services);
      const chunk = r.chunk as {
        index: number;
        total: number;
        totalBytes: number;
        sha256: string;
        data: string;
      };
      expect(chunk).toMatchObject({
        index,
        total: 3,
        totalBytes: pdf.byteLength,
        sha256: sha256(pdf),
      });
      parts.push(Buffer.from(chunk.data, 'base64'));
    }
    expect(parts.map((p) => p.byteLength)).toEqual([BRIDGE_CHUNK_BYTES, BRIDGE_CHUNK_BYTES, 17]);
    const whole = new Uint8Array(Buffer.concat(parts));
    expect(sha256(whole)).toBe(sha256(pdf));
    expect(whole).toEqual(pdf);

    const beyond = await call('export.read_pdf', { exportVersionId: id, chunkIndex: 3 }, services);
    expect(beyond).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
  });

  it('單塊 PDF：total 為 1', async () => {
    const pdf = fakePdf('one');
    const { services, id } = await exported(pdf);
    const r = await call('export.read_pdf', { exportVersionId: id, chunkIndex: 0 }, services);
    expect(r.chunk).toMatchObject({ index: 0, total: 1, totalBytes: pdf.byteLength });
  });

  it('分塊邊界：恰好上限可傳、超過一個位元組就拒絕', () => {
    const max = BRIDGE_CHUNK_BYTES * BRIDGE_MAX_CHUNKS;
    expect(fitsChunkLimit(max)).toBe(true);
    expect(fitsChunkLimit(max + 1)).toBe(false);
    expect(chunkCount(0)).toBe(1);
    expect(chunkOf(new Uint8Array(0), 0)).toMatchObject({ total: 1, totalBytes: 0, data: '' });
    expect(chunkOf(new Uint8Array(10), -1)).toBeNull();
    expect(chunkOf(new Uint8Array(10), 1)).toBeNull();
  });
});

describe('服務組裝（main.ts createServices）', () => {
  it('沒有資料區：export.* 全部回 not_implemented', async () => {
    const services = createServices(null);
    expect(services.pdfExport).toBeUndefined();
    const ops = {
      'export.create': { resumeVersionId: VERSION_ID },
      'export.list_versions': {},
      'export.get_version': { exportVersionId: 'x1' },
      'export.read_pdf': { exportVersionId: 'x1', chunkIndex: 0 },
    } as const;
    for (const [op, payload] of Object.entries(ops)) {
      const response = await call(op as BridgeOperation, payload, services);
      expect(response).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
    }
  });

  it('有資料區：接上匯出服務（清單可讀）', async () => {
    const bed = exportTestbed();
    cleanups.push(bed.cleanup);
    const services = createServices(bed.runtime);
    expect(await call('export.list_versions', {}, services)).toEqual({ ok: true, versions: [] });
  });
});
