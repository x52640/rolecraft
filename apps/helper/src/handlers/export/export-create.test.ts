import { BRIDGE_SCHEMAS, type ResumeVersion } from '@rolecraft/contracts';
import { checkExportReadiness } from '@rolecraft/domain';
import {
  PdfExportError,
  type PdfExportOutcome,
  type PdfExportRequest,
  type ResumeDocument,
} from '@rolecraft/pdf-export';
import { StorageError } from '@rolecraft/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLAIM_ID,
  claim,
  citedSection,
  exportTestbed,
  fakePdf,
  profile,
  resumeVersion,
  summarySection,
  VERSION_ID,
  without,
} from './__fixtures__/testbed.ts';
import { HEADINGS } from './document.ts';
import { createExport, type ExportCreateDeps } from './export-create.ts';

const REPORT = { issues: [], pageCount: 1, browserVersion: 'fake', extractedText: '' } as const;

/** 假匯出器：記下收到的請求，回假 PDF。 */
function recorder(onCall?: (request: PdfExportRequest) => void) {
  const calls: PdfExportRequest[] = [];
  const exportPdf = vi.fn((request: PdfExportRequest): Promise<PdfExportOutcome> => {
    calls.push(request);
    onCall?.(request);
    return Promise.resolve({ ok: true, pdf: fakePdf(`call-${calls.length}`), report: REPORT });
  });
  return { calls, exportPdf };
}

/** 文件中印出的履歷段落文字（技能來自 Profile，不算）。 */
function printed(doc: ResumeDocument): string[] {
  return doc.sections
    .filter((s) => s.heading !== HEADINGS.skills)
    .flatMap((s) =>
      s.items.flatMap((i) => (i.kind === 'paragraph' || i.kind === 'bullet' ? [i.text] : [])),
    );
}

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

function setup() {
  const bed = exportTestbed();
  cleanups.push(bed.cleanup);
  return bed;
}

const valid = (response: unknown) =>
  expect(BRIDGE_SCHEMAS['export.create'].response.safeParse(response).success).toBe(true);

describe('export.create：R1 通過才匯出，建立不可變匯出版本', () => {
  it('通過：PDF 存入、匯出版本只含印出的段落與引用副本、不建立投遞紀錄', async () => {
    const { runtime } = setup();
    const { calls, exportPdf } = recorder();
    const response = await createExport({ ...runtime, exportPdf }, VERSION_ID);
    valid(response);
    if (!response.ok || response.outcome.status !== 'exported') throw new Error('應匯出');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.r1).toEqual({ ok: true, issues: [] });
    const version = runtime.exports.get(response.outcome.exportVersionId);
    expect(version?.resumeVersionId).toBe(VERSION_ID);
    expect(version?.sections).toEqual(resumeVersion().sections);
    expect(version?.citedClaims).toEqual([
      { claimId: CLAIM_ID, claimText: claim().text, excerptTexts: [] },
    ]);
    expect(version?.jobSnapshot.fields.company).toBe('虛構科技');
    if (!version) throw new Error('應有版本');
    expect(runtime.exports.readPdf(version)).toEqual(fakePdf('call-1'));
    expect(runtime.db.prepare('SELECT COUNT(*) AS n FROM application_records').get()).toEqual({
      n: 0,
    });
  });

  it('R1 未過：回 not_ready，不呼叫匯出器、不建立匯出版本', async () => {
    const { runtime } = setup();
    runtime.repos.claims.save(claim({ completionStatus: 'documented_done' }));
    const { exportPdf } = recorder();
    const response = await createExport({ ...runtime, exportPdf }, VERSION_ID);
    valid(response);
    expect(response).toEqual({ ok: true, outcome: { status: 'not_ready' } });
    expect(exportPdf).not.toHaveBeenCalled();
    expect(runtime.exports.list()).toEqual([]);
  });

  it('引用的事實項不存在：not_ready', async () => {
    const { runtime } = setup();
    const ghost = { claimId: 'missing', statedCompletion: 'completed' } as const;
    runtime.repos.resumeVersions.save(
      resumeVersion([citedSection({ citations: [ghost], generatedCitations: [ghost] })]),
    );
    const { exportPdf } = recorder();
    expect(await createExport({ ...runtime, exportPdf }, VERSION_ID)).toEqual({
      ok: true,
      outcome: { status: 'not_ready' },
    });
    expect(exportPdf).not.toHaveBeenCalled();
  });
});

describe('export.create：R1 結果與印出的文件來自同一份履歷版本（防檢查後換版本）', () => {
  const swapped = (base: ResumeVersion): ResumeVersion => ({
    ...base,
    sections: base.sections.map((s) => ({ ...s, text: '偷換：服務 99 萬名會員。' })),
  });

  it('履歷版本只讀一次；之後再讀到的新版本不會被印出或存進匯出版本', async () => {
    const { runtime } = setup();
    const original = runtime.repos.resumeVersions.get(VERSION_ID);
    if (!original) throw new Error('fixture');
    const get = vi
      .fn<(id: string) => ResumeVersion | null>()
      .mockReturnValueOnce(original)
      .mockReturnValue(swapped(original));
    const { calls, exportPdf } = recorder();
    const deps: ExportCreateDeps = {
      ...runtime,
      repos: { ...runtime.repos, resumeVersions: { ...runtime.repos.resumeVersions, get } },
      exportPdf,
    };
    const response = await createExport(deps, VERSION_ID);
    if (!response.ok || response.outcome.status !== 'exported') throw new Error('應匯出');

    expect(get).toHaveBeenCalledTimes(1);
    const request = calls[0];
    if (!request) throw new Error('應呼叫匯出器');
    const texts = printed(request.document);
    expect(texts.join('')).not.toContain('偷換');
    // 交給匯出器的 R1 結果，就是對「印出的這些段落」跑出的結果
    const stored = runtime.exports.get(response.outcome.exportVersionId);
    expect(stored?.sections.map((s) => s.text)).toEqual(texts);
    const recheck = checkExportReadiness({
      sections: stored?.sections ?? [],
      claims: [claim()],
      profile: profile(),
    });
    expect(request.r1).toEqual(recheck);
  });

  it('檢查後資料庫版本被改、或改動讀出的物件：印出與存下的仍是檢查時那份', async () => {
    const { runtime } = setup();
    const original = runtime.repos.resumeVersions.get(VERSION_ID);
    if (!original) throw new Error('fixture');
    const get = vi.fn(() => original);
    const { calls, exportPdf } = recorder(() => {
      runtime.repos.resumeVersions.save(swapped(original));
      const first = original.sections[0];
      if (first) first.text = '偷換：直接改物件 99 人。';
    });
    const deps: ExportCreateDeps = {
      ...runtime,
      repos: { ...runtime.repos, resumeVersions: { ...runtime.repos.resumeVersions, get } },
      exportPdf,
    };
    const response = await createExport(deps, VERSION_ID);
    if (!response.ok || response.outcome.status !== 'exported') throw new Error('應匯出');
    const stored = runtime.exports.get(response.outcome.exportVersionId);
    expect(JSON.stringify(stored?.sections)).not.toContain('偷換');
    expect(printed(calls[0]?.document ?? { name: '', contacts: [], sections: [] })).toEqual(
      resumeVersion().sections.map((s) => s.text),
    );
  });
});

describe('export.create：不能匯出的情況', () => {
  it.each([
    ['沒有個人資料', () => []],
    ['個人資料未確認', () => [profile({ pdfParseConfirmed: false })]],
    ['多份個人資料', () => [profile(), profile({ id: 'p-2' })]],
  ])('%s：invalid_request，不呼叫匯出器', async (_name, profiles) => {
    const { runtime } = setup();
    const { exportPdf } = recorder();
    const deps: ExportCreateDeps = {
      ...runtime,
      repos: { ...runtime.repos, profiles: { ...runtime.repos.profiles, list: profiles } },
      exportPdf,
    };
    const response = await createExport(deps, VERSION_ID);
    valid(response);
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(exportPdf).not.toHaveBeenCalled();
  });

  it('找不到履歷版本：invalid_request', async () => {
    const { runtime } = setup();
    const response = await createExport({ ...runtime, exportPdf: recorder().exportPdf }, 'nope');
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
  });

  it('段落沒有歸屬：not_ready（與 resume.check_export 同一套段落阻擋），不呼叫匯出器', async () => {
    const { runtime } = setup();
    const noPlacement = without(citedSection(), 'placement');
    runtime.repos.resumeVersions.save(resumeVersion([noPlacement]));
    const { exportPdf } = recorder();
    const response = await createExport({ ...runtime, exportPdf }, VERSION_ID);
    expect(response).toEqual({ ok: true, outcome: { status: 'not_ready' } });
    expect(exportPdf).not.toHaveBeenCalled();
  });

  it.each([
    ['待接受', { decision: 'pending' }],
    ['已退回', { decision: 'rejected' }],
    ['沒有 decision（缺省＝待接受）', { decision: undefined }],
  ] as const)('R1 通過但段落%s：not_ready，不呼叫匯出器、不建立匯出版本', async (_n, over) => {
    const { runtime } = setup();
    const section = citedSection();
    if (over.decision === undefined) delete section.decision;
    else section.decision = over.decision;
    runtime.repos.resumeVersions.save(resumeVersion([summarySection(), section]));
    const { exportPdf } = recorder();
    const response = await createExport({ ...runtime, exportPdf }, VERSION_ID);
    valid(response);
    expect(response).toEqual({ ok: true, outcome: { status: 'not_ready' } });
    expect(exportPdf).not.toHaveBeenCalled();
    expect(runtime.exports.list()).toEqual([]);
  });

  it.each(['browser_not_found', 'fonts_unavailable', 'browser_failed'] as const)(
    '匯出前提錯誤 %s：internal_error，不建立匯出版本',
    async (code) => {
      const { runtime } = setup();
      const exportPdf = () => Promise.reject(new PdfExportError(code, 'x'));
      const response = await createExport({ ...runtime, exportPdf }, VERSION_ID);
      valid(response);
      expect(response).toMatchObject({ ok: false, error: { code: 'internal_error' } });
      expect(runtime.exports.list()).toEqual([]);
    },
  );

  it('字型載入失敗：internal_error', async () => {
    const { runtime } = setup();
    const response = await createExport(
      {
        ...runtime,
        loadFonts: () => Promise.reject(new PdfExportError('fonts_unavailable', 'x')),
        exportPdf: recorder().exportPdf,
      },
      VERSION_ID,
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'internal_error' } });
  });

  it('PDF 檢查有阻擋問題：internal_error 並列出問題代碼，不建立匯出版本', async () => {
    const { runtime } = setup();
    const exportPdf = (): Promise<PdfExportOutcome> =>
      Promise.resolve({
        ok: false,
        report: { ...REPORT, issues: [{ code: 'page_limit', pages: 3, max: 2 }] },
      });
    const response = await createExport({ ...runtime, exportPdf }, VERSION_ID);
    expect(response).toEqual({
      ok: false,
      error: { code: 'internal_error', message: 'PDF 檢查未通過：page_limit' },
    });
    expect(runtime.exports.list()).toEqual([]);
  });

  it('storage 拒絕建立（例：含已刪素材）：internal_error；其他例外照拋', async () => {
    const { runtime } = setup();
    const refuse = (error: Error): ExportCreateDeps => ({
      ...runtime,
      exports: {
        create: () => {
          throw error;
        },
      },
      exportPdf: recorder().exportPdf,
    });
    expect(await createExport(refuse(new StorageError('x')), VERSION_ID)).toMatchObject({
      ok: false,
      error: { code: 'internal_error' },
    });
    await expect(createExport(refuse(new TypeError('bug')), VERSION_ID)).rejects.toThrow('bug');
  });
});
