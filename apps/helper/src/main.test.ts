// 端到端：用真實子行程跑 main.ts（模擬瀏覽器以 stdio 啟動 host），以及原始碼靜態掃描。
// 子程序只出現在測試裡；正式原始碼不得有任何子程序／shell／檔案系統呼叫（R7）。
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { createMacFolderPicker, createMacPdfPicker, type ExecFileRunner } from '@rolecraft/sources';
import { createLocalFileStore, createRepositories, openDatabase } from '@rolecraft/storage';
import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  ALLOWED,
  anyString,
  env as envelope,
  OTHER,
  recordingLogger,
  reply,
  SECRET,
  requests,
} from './__fixtures__/requests.ts';
import { editorRequests } from './bridge/__fixtures__/editor-requests.ts';
import { claudeServiceOf } from './handlers/providers/providers-service.ts';
import { ALLOWED_ORIGINS_ENV, dispatch, FrameDecoder, encodeFrame } from './index.ts';
import { ENGLISH_RESUME, makeTextPdf } from './handlers/import/__fixtures__/pdf.ts';
import {
  type ClaudeCheck,
  type ClaudeProbe,
  createHelperClaudeService,
} from './handlers/providers/claude-probe.ts';
import type { HelperServices } from './handlers/services.ts';
import { createServices as createRealServices, nativePickers, type NativePickers } from './main.ts';

/**
 * 經 createServices 的測試一律用假的 Claude 檢查（P1-T070）：查狀態會自動做連線檢查，
 * 不能在 verify 時執行真實 `claude`（含 --version、auth status）。登入狀態回「未知」，所以永遠不會是可用。
 */
const FAKE_CHECK: ClaudeCheck = {
  installed: 'passed',
  login: 'unknown',
  eligibility: 'unknown',
  subscriptionOnly: 'unknown',
  isolation: 'passed',
  checkedAt: '2026-10-12T00:00:00.000Z',
};
const fakeCheck = vi.fn<ClaudeProbe['check']>(() => Promise.resolve(FAKE_CHECK));
const fakeVerifyModel = vi.fn<ClaudeProbe['verifyModel']>(() =>
  Promise.reject(new Error('測試不呼叫模型')),
);
const FAKE_PROBE: ClaudeProbe = {
  candidates: ['haiku', 'sonnet', 'opus', 'fable'],
  check: fakeCheck,
  verifyModel: fakeVerifyModel,
};
const createServices = (
  storage?: Parameters<typeof createRealServices>[0],
  pickers?: NativePickers,
  base?: HelperServices,
) =>
  createRealServices(storage, pickers, base, {
    claudeProbe: FAKE_PROBE,
    // 有資料區時用 persistedProvidersOptions 接上的 Claude 服務；沒有時照正式入口建一個（不啟動程式）
    ...(storage ? {} : { service: createHelperClaudeService() }),
  });

const MAIN = path.join(import.meta.dirname, 'main.ts');

interface RunResult {
  code: number | null;
  replies: unknown[];
  stderr: string;
}

function runHost(args: string[], env: Record<string, string>, stdin: Buffer): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, stdio: 'pipe' });
    const decoder = new FrameDecoder();
    const replies: unknown[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => replies.push(...decoder.push(chunk)));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, replies, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

const env = { [ALLOWED_ORIGINS_ENV]: ALLOWED };

describe('main（真實 stdio 子行程）', () => {
  it('合法 origin：依 id 回覆、未接服務回 not_implemented、stderr 不含內容', async () => {
    const stdin = Buffer.concat([
      encodeFrame(envelope('m1', requests.submit_message_capture)),
      encodeFrame(envelope('x1', { op: 'run_command', payload: { cmd: SECRET } })),
    ]);
    const result = await runHost([ALLOWED], env, stdin);
    expect(result.code).toBe(0);
    expect(result.replies).toEqual(
      expect.arrayContaining([
        reply('m1', { ok: false, error: { code: 'not_implemented', message: anyString } }),
        reply('x1', { ok: false, error: { code: 'invalid_request', message: anyString } }),
      ]),
    );
    expect(result.replies).toHaveLength(2);
    expect(result.stderr).toContain('host_started');
    expect(result.stderr).not.toContain('王小明');
    expect(result.stderr).not.toContain('rm -rf');
  });

  it('origin 不在允許清單：結束碼 2、沒有任何回覆', async () => {
    const result = await runHost([OTHER], env, encodeFrame(envelope('r1', requests.request_draft)));
    expect(result.code).toBe(2);
    expect(result.replies).toEqual([]);
  });

  it('沒設定允許清單：全部拒絕', async () => {
    const result = await runHost(
      [ALLOWED],
      {},
      encodeFrame(envelope('r1', requests.request_draft)),
    );
    expect(result.code).toBe(2);
  });

  it('允許清單格式錯：結束碼 1', async () => {
    const result = await runHost([ALLOWED], { [ALLOWED_ORIGINS_ENV]: '*' }, Buffer.alloc(0));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('config_invalid');
  });

  it('沒有請求 id：回 id 為 null 的失敗，結束碼 3', async () => {
    const result = await runHost([ALLOWED], env, encodeFrame(requests.request_draft));
    expect(result.code).toBe(3);
    expect(result.replies).toEqual([
      reply(null, { ok: false, error: { code: 'invalid_request', message: anyString } }),
    ]);
  });

  it('壞 JSON：結束碼 3', async () => {
    const body = Buffer.from('{oops', 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    const result = await runHost([ALLOWED], env, Buffer.concat([header, body]));
    expect(result.code).toBe(3);
  });
});

describe('服務組裝（createServices，P1-T043）', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-services-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const project = path.join(dir, '專案甲');
  mkdirSync(project);

  /** 假選取器：不開對話框，記錄被呼叫次數。 */
  function fakePickers() {
    return {
      folder: vi.fn(() => Promise.resolve([project])),
      pdf: vi.fn(() =>
        Promise.resolve({ fileName: '履歷.pdf', bytes: new TextEncoder().encode('%PDF-1.7') }),
      ),
    } satisfies NativePickers;
  }

  function storage() {
    const { db } = openDatabase(':memory:');
    return { db, fileStore: createLocalFileStore(path.join(dir, 'files')) };
  }

  const send = (services: ReturnType<typeof createServices>, op: string) =>
    dispatch({ op, payload: {} }, services, recordingLogger()).then((r) => r.response);

  it('macOS 才接原生選取器（D11）；建立時不開對話框', () => {
    expect(nativePickers('linux')).toEqual({});
    expect(nativePickers('win32')).toEqual({});
    const mac = nativePickers('darwin');
    expect(typeof mac.folder).toBe('function');
    expect(typeof mac.pdf).toBe('function');
  });

  it('沒有 storage：sources 接選取器；resumeImport、applications 不接', async () => {
    const pickers = fakePickers();
    const services = createServices(null, pickers);
    const picked = await send(services, 'sources.pick_folders');
    expect(picked).toMatchObject({ ok: true, selection: { status: 'selected' } });
    expect(JSON.stringify(picked)).not.toContain(dir);
    expect(await send(services, 'import.pick_pdf')).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
    expect(await send(services, 'applications.list')).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
    expect(pickers.pdf).not.toHaveBeenCalled();
  });

  it('沒有選取器：sources.pick_folders 回 not_implemented，其餘 sources 操作可用', async () => {
    const services = createServices(null, {});
    expect(await send(services, 'sources.pick_folders')).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
    expect(await send(services, 'sources.list_folders')).toMatchObject({ ok: true });
  });

  it('有 storage：接上 sources、resumeImport（PDF 選取器）、applications', async () => {
    const pickers = fakePickers();
    const services = createServices(storage(), pickers);
    expect(await send(services, 'sources.pick_folders')).toMatchObject({ ok: true });
    const imported = await send(services, 'import.pick_pdf');
    expect(imported).toMatchObject({
      ok: true,
      selection: { status: 'selected', displayName: '履歷.pdf' },
    });
    expect(pickers.pdf).toHaveBeenCalledTimes(1);
    expect(await send(services, 'applications.list')).toEqual({ ok: true, applications: [] });
  });

  it('履歷 AI 整理（P1-T069）：已接上；未選定模型時 import.ai_parse 回原因（不是尚未支援）、不呼叫模型', async () => {
    const pickers = {
      pdf: vi.fn(() =>
        Promise.resolve({ fileName: '履歷.pdf', bytes: makeTextPdf(ENGLISH_RESUME) }),
      ),
    } satisfies NativePickers;
    const services = createServices(storage(), pickers);
    const call = (request: object) =>
      dispatch(request, services, recordingLogger()).then((r) => r.response);
    const picked = (await call({ op: 'import.pick_pdf', payload: {} })) as {
      selection: { importId: string };
    };
    const ref = { importId: picked.selection.importId };
    expect(await call({ op: 'import.ai_status', payload: ref })).toEqual({ ok: true, parse: null });
    expect(await call({ op: 'import.ai_parse', payload: ref })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request', message: expect.stringContaining('選定模型') as unknown },
    });
    expect(await call({ op: 'import.ai_status', payload: ref })).toEqual({ ok: true, parse: null });
  });

  it('分析（P1-T060）：有 storage 才接；未選定模型時不讀檔、不呼叫模型', async () => {
    expect(await send(createServices(null, {}), 'analysis.start')).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
    const services = createServices(storage(), {});
    expect(await send(services, 'analysis.status')).toEqual({ ok: true, analysis: null });
    // 沒選定模型：不做會重新驗證的完整檢查，回「尚未選定模型」（P1-T070），不呼叫模型。
    expect(await send(services, 'analysis.start')).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
        message: expect.stringContaining('尚未選定模型') as unknown,
      },
    });
    expect(fakeVerifyModel).not.toHaveBeenCalled();
    expect(await send(services, 'analysis.status')).toEqual({ ok: true, analysis: null });
  });

  it('投遞自介（P1-T064）：有 storage 才接；查不到的快照回 invalid_request，不呼叫模型', async () => {
    const call = (services: ReturnType<typeof createServices>, request: object) =>
      dispatch(request, services, recordingLogger()).then((r) => r.response);
    const ref = { jobSnapshotId: 'job-missing' };
    expect(await call(createServices(null, {}), { op: 'intro.get', payload: ref })).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
    const services = createServices(storage(), {});
    for (const request of [
      { op: 'intro.get', payload: ref },
      { op: 'intro.generate', payload: ref },
      { op: 'intro.update', payload: { ...ref, text: '改寫' } },
    ]) {
      expect(await call(services, request)).toMatchObject({
        ok: false,
        error: { code: 'invalid_request', message: expect.stringContaining('找不到') as unknown },
      });
    }
  });

  it('真實選取器＋假 osascript：回應只有檔名／名稱，不含路徑；非 PDF 回固定錯誤', async () => {
    const pdfPath = path.join(dir, '我的履歷.pdf');
    const fakePath = path.join(dir, 'fake.pdf');
    writeFileSync(pdfPath, '%PDF-1.7\n%%EOF\n');
    writeFileSync(fakePath, `not a pdf ${SECRET}`);
    let next = pdfPath;
    const execFile = vi.fn<ExecFileRunner>((file) =>
      Promise.resolve(file === '/usr/bin/osascript' ? `${next}\n` : ''),
    );
    const folderExec = vi.fn<ExecFileRunner>(() => Promise.resolve(`1\n${project}/\n`));
    const services = createServices(storage(), {
      pdf: createMacPdfPicker({ execFile, platform: 'darwin' }),
      folder: createMacFolderPicker({ execFile: folderExec, platform: 'darwin' }),
    });
    const ok = await send(services, 'import.pick_pdf');
    expect(ok).toMatchObject({ ok: true, selection: { displayName: '我的履歷.pdf' } });
    const folders = await send(services, 'sources.pick_folders');
    expect(folders).toMatchObject({ ok: true, selection: { roots: [{ name: '專案甲' }] } });
    next = fakePath;
    const bad = await send(services, 'import.pick_pdf');
    expect(bad).toMatchObject({ ok: false, error: { code: 'internal_error' } });
    for (const response of [ok, folders, bad]) {
      expect(JSON.stringify(response)).not.toContain(dir);
      expect(JSON.stringify(response)).not.toContain(SECRET);
    }
    // 失敗後選取視窗狀態已釋放，可以再選
    next = pdfPath;
    expect(await send(services, 'import.pick_pdf')).toMatchObject({ ok: true });
  });

  it('重啟還原（P1-T058）：同一資料庫開兩次 createServices，授權資料夾、選定模型、已驗證版本都還在', async () => {
    const dbFile = path.join(dir, 'restart.db');
    const fileStore = createLocalFileStore(path.join(dir, 'files'));
    const call = (services: ReturnType<typeof createServices>, op: string, payload: unknown) =>
      dispatch({ op, payload }, services, recordingLogger()).then((r) => r.response);

    writeFileSync(path.join(project, 'README.md'), '# 專案甲');
    const first = openDatabase(dbFile).db;
    const s1 = createServices({ db: first, fileStore }, fakePickers());
    const picked = await send(s1, 'sources.pick_folders');
    const rootId = (picked as { selection: { roots: { rootId: string }[] } }).selection.roots[0]
      ?.rootId;
    const preview = (await call(s1, 'sources.preview', { rootId })) as {
      entries: { entryId: string; kind: string }[];
    };
    const doc = preview.entries.find((e) => e.kind === 'document')?.entryId;
    expect(
      await call(s1, 'sources.update_authorization', { rootId, authorize: [doc], revoke: [] }),
    ).toEqual({ ok: true });
    // 選定模型與已驗證版本：直接寫進資料區（短驗證要真的 CLI，這裡不跑）
    const repos = createRepositories(first);
    repos.providerSelections.save('claude', 'opus', '2026-10-11T00:00:00.000Z');
    const verified = { version: '9.9.9', outcome: 'verified', verifiedAt: 'x', cases: [] };
    repos.claudeVersionRecords.append(
      JSON.stringify({ ...verified, modelCalls: 3 }),
      '2026-10-11T00:00:00.000Z',
    );
    first.close();

    const second = openDatabase(dbFile).db;
    const s2 = createServices({ db: second, fileStore }, fakePickers());
    fakeCheck.mockClear();
    expect(await send(s2, 'sources.list_folders')).toEqual({
      ok: true,
      roots: [{ rootId, name: '專案甲', pendingCount: 0, authorizedCount: 1 }],
    });
    const status = (await send(s2, 'providers.status')) as {
      services: { service: string; state: string; selectedCandidateId: string | null }[];
    };
    const candidates = (await call(s2, 'providers.list_candidates', { service: 'claude' })) as {
      candidates: { candidateId: string; label: string }[];
    };
    const opus = candidates.candidates.find((c) => c.label === 'Claude Opus')?.candidateId;
    expect(status.services[0]).toMatchObject({
      state: 'eligibility_unknown',
      selectedCandidateId: opus,
    });
    // 重開後第一次查狀態自動做一次連線檢查（只讀版本＋登入，P1-T070），不沿用舊的狀態。
    expect(fakeCheck.mock.calls).toEqual([[{ reverify: false }]]);
    expect(fakeVerifyModel).not.toHaveBeenCalled();
    const claude = s2.providers && claudeServiceOf(s2.providers);
    expect(await claude?.gate.load()).toBe(true);
    expect(claude?.gate.isAccepted('9.9.9')).toBe(true);
    second.close();
  });

  it('資料區占用後接手（base）：沿用同一個 sources 服務並接上資料區', async () => {
    const pickers = fakePickers();
    const base = createServices(null, pickers);
    expect(await send(base, 'sources.pick_folders')).toMatchObject({ ok: true });
    const { db } = openDatabase(':memory:');
    const full = createServices(
      { db, fileStore: createLocalFileStore(path.join(dir, 'files')) },
      pickers,
      base,
    );
    expect(full.sources).toBe(base.sources);
    expect(
      createRepositories(db)
        .authorizedFolders.list()
        .map((f) => f.displayName),
    ).toEqual(['專案甲']);
    db.close();
  });

  it('沒有 storage：兩次 createServices 互不相干（全在記憶體，行為不變）', async () => {
    const s1 = createServices(null, fakePickers());
    expect(await send(s1, 'sources.pick_folders')).toMatchObject({ ok: true });
    const s2 = createServices(null, fakePickers());
    expect(await send(s2, 'sources.list_folders')).toEqual({ ok: true, roots: [] });
    expect(s2.providers && claudeServiceOf(s2.providers)?.gate.canReverify).toBe(false);
  });

  it('有 storage 但沒有 PDF 選取器：只有 pick_pdf 不接；網頁擷取、手動輸入、profile.get 可用（D28）', async () => {
    const services = createServices(storage(), {});
    expect(await send(services, 'import.pick_pdf')).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
    expect(await send(services, 'applications.list')).toMatchObject({ ok: true });
    expect(await send(services, 'profile.get')).toEqual({ ok: true, profile: null });
    expect(await send(services, 'import.latest_capture')).toEqual({ ok: true, capture: null });
    const capture = editorRequests.submit_resume_capture;
    const submitted = await dispatch(capture, services, recordingLogger());
    expect(submitted.response).toEqual({ ok: true });
    expect(await send(services, 'import.latest_capture')).toMatchObject({
      ok: true,
      capture: { platform: '104', truncated: false },
    });
    expect(await send(services, 'import.start_manual')).toMatchObject({ ok: true });
  });

  it('沒有 storage：profile.get、網頁擷取不接', async () => {
    const services = createServices(null, fakePickers());
    for (const op of ['profile.get', 'import.latest_capture', 'import.start_manual']) {
      expect(await send(services, op)).toMatchObject({
        ok: false,
        error: { code: 'not_implemented' },
      });
    }
  });
});

/** 正式原始碼（不含測試與 fixture）。 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('R7 靜態檢查：正式原始碼沒有子程序、shell、檔案系統或動態執行', () => {
  const FORBIDDEN = [
    /child_process/,
    /['"](node:)?fs(\/promises)?['"]/,
    /\bexecFile\b|\bexecSync\b|\bspawn\b|\bfork\(/,
    /\beval\(|new Function\(/,
    /['"](node:)?(vm|worker_threads|net|http|https|dgram)['"]/,
    /process\.binding|process\.dlopen/,
    /\bimport\(/,
  ];
  const files = sourceFiles(import.meta.dirname);

  it('掃到正式原始碼', () => {
    expect(files.map((f) => path.basename(f))).toContain('dispatch.ts');
  });

  it.each(files.map((f) => [path.relative(import.meta.dirname, f), f]))('%s', (_name, file) => {
    const code = readFileSync(file, 'utf8');
    expect(FORBIDDEN.filter((re) => re.test(code)).map(String)).toEqual([]);
  });
});
