// sources 服務整合測試：真實暫存資料夾＋本機 fs 存取＋假的資料夾選取器（不開真的對話框）。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { SourceEntry } from '@rolecraft/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSourcesService, type FolderPicker, type LocalSources } from './local-sources.ts';

let base: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'rolecraft-t021-'));
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function write(rel: string, content = 'text'): void {
  const full = path.join(base, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** 建一個典型專案：文件、原始碼、相依、憑證、隱藏檔。 */
function makeProject(name: string): string {
  write(`${name}/README.md`, `# ${name}`);
  write(`${name}/docs/spec.md`, 'spec');
  write(`${name}/docs/notes.txt`, 'notes');
  write(`${name}/src/main.ts`, 'export {}');
  write(`${name}/app.py`, 'print(1)');
  write(`${name}/node_modules/dep/README.md`, 'dep');
  write(`${name}/dist/out.md`, 'built');
  write(`${name}/secrets.pem`, 'key');
  write(`${name}/.env`, 'SECRET=1');
  return path.join(base, name);
}

function pickerOf(...batches: (readonly string[])[]): FolderPicker {
  let call = 0;
  return () => Promise.resolve(batches[call++] ?? []);
}

async function previewOf(service: LocalSources, rootId: string): Promise<SourceEntry[]> {
  const result = await service.preview?.(rootId);
  if (result?.status !== 'ok') throw new Error(`preview failed: ${JSON.stringify(result)}`);
  return result.entries;
}

const docs = (entries: SourceEntry[]) => entries.filter((e) => e.kind === 'document');
const byName = (entries: SourceEntry[], name: string) => {
  const found = entries.find((e) => e.name === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found;
};

describe('S9-5：累積 10 個資料夾、預覽、排除程式碼與無關內容', () => {
  it('連續新增 10 個資料夾，預覽只列文字文件，回應不含任何絕對路徑', async () => {
    const folders = Array.from({ length: 10 }, (_, i) => makeProject(`proj-${i}`));
    const service = createSourcesService({
      picker: pickerOf(folders.slice(0, 3), folders.slice(3, 4), folders.slice(4)),
    });
    const picked = [];
    for (let i = 0; i < 3; i += 1) {
      const result = await service.pickFolders?.();
      if (result?.status !== 'selected') throw new Error('not selected');
      picked.push(...result.roots);
    }
    expect(picked.map((r) => r.name)).toEqual(folders.map((f) => path.basename(f)));

    const list = service.listFolders?.() ?? [];
    expect(list).toHaveLength(10);
    expect(list.every((r) => r.pendingCount === 3 && r.authorizedCount === 0)).toBe(true);

    const responses: unknown[] = [picked, list];
    for (const root of picked) {
      const entries = await previewOf(service, root.rootId);
      responses.push(entries);
      expect(
        docs(entries)
          .map((e) => e.name)
          .sort(),
      ).toEqual(['README.md', 'notes.txt', 'spec.md']);
      expect(entries.filter((e) => e.kind === 'container').map((e) => e.name)).toEqual(['docs']);
      expect(docs(entries).every((e) => e.authorization === 'pending')).toBe(true);
      expect(byName(entries, 'README.md').suggested).toBe(true);
      expect(byName(entries, 'notes.txt').suggested).toBe(false);
      expect(byName(entries, 'spec.md').parentEntryId).toBe(byName(entries, 'docs').entryId);
    }
    const json = JSON.stringify(responses);
    expect(json).not.toContain(base);
    expect(json).not.toContain(tmpdir());
  });
});

describe('授權集合（R4）', () => {
  async function setup() {
    const folder = makeProject('p');
    const service = createSourcesService({ picker: pickerOf([folder]) });
    const result = await service.pickFolders?.();
    if (result?.status !== 'selected') throw new Error('not selected');
    const rootId = result.roots[0]?.rootId ?? '';
    return { folder, service, rootId };
  }

  it('預覽前不能授權；確認後才可讀，未勾選的不可讀', async () => {
    const { service, rootId } = await setup();
    const items = service.registry.items(rootId);
    const readme = items.find((i) => i.relPath === 'README.md')?.id ?? '';
    expect(service.updateAuthorization?.(rootId, [readme], [])).toBe('invalid_entry');

    const entries = await previewOf(service, rootId);
    const readmeEntry = byName(entries, 'README.md').entryId;
    const spec = byName(entries, 'spec.md').entryId;
    expect(service.updateAuthorization?.(rootId, [readmeEntry], [])).toBe('ok');
    expect(await service.registry.read(readmeEntry)).toMatchObject({ ok: true, text: '# p' });
    expect(await service.registry.read(spec)).toEqual({ ok: false, reason: 'not_authorized' });
    expect(service.listFolders?.()).toEqual([
      { rootId, name: 'p', pendingCount: 2, authorizedCount: 1 },
    ]);
  });

  it('子資料夾 ID、別的資料夾的項目、未知 ID：整筆拒絕且不套用', async () => {
    const { service, rootId } = await setup();
    const entries = await previewOf(service, rootId);
    const readme = byName(entries, 'README.md').entryId;
    const docsDir = byName(entries, 'docs').entryId;
    expect(service.updateAuthorization?.(rootId, [readme, docsDir], [])).toBe('invalid_entry');
    expect(service.updateAuthorization?.(rootId, [readme, 'nope'], [])).toBe('invalid_entry');
    expect(service.updateAuthorization?.('nope', [readme], [])).toBe('unknown_root');
    expect(service.registry.items(rootId).every((i) => i.status === 'pending')).toBe(true);
  });

  it('增量更新：新檔為待確認、不自動授權；既有授權保留；取消後立即不可讀', async () => {
    const { service, rootId } = await setup();
    const first = await previewOf(service, rootId);
    const readme = byName(first, 'README.md').entryId;
    service.updateAuthorization?.(rootId, [readme], []);

    write('p/docs/new-plan.md', 'plan');
    const second = await previewOf(service, rootId);
    const fresh = byName(second, 'new-plan.md');
    expect(fresh.authorization).toBe('pending');
    expect(fresh.parentEntryId).toBe(byName(first, 'docs').entryId);
    expect(byName(second, 'README.md')).toMatchObject({
      entryId: readme,
      authorization: 'authorized',
    });
    expect(await service.registry.read(fresh.entryId)).toEqual({
      ok: false,
      reason: 'not_authorized',
    });

    expect(service.updateAuthorization?.(rootId, [], [readme])).toBe('ok');
    expect(await service.registry.read(readme)).toEqual({ ok: false, reason: 'not_authorized' });
  });

  it('檔案消失後不再出現在預覽，也不能授權', async () => {
    const { folder, service, rootId } = await setup();
    const first = await previewOf(service, rootId);
    const notes = byName(first, 'notes.txt').entryId;
    rmSync(path.join(folder, 'docs/notes.txt'));
    const second = await previewOf(service, rootId);
    expect(second.some((e) => e.entryId === notes)).toBe(false);
    expect(service.updateAuthorization?.(rootId, [notes], [])).toBe('invalid_entry');
  });

  it('移除資料夾：停止讀取、清單不再出現、之後的操作回 unknown_root', async () => {
    const { service, rootId } = await setup();
    const entries = await previewOf(service, rootId);
    const readme = byName(entries, 'README.md').entryId;
    service.updateAuthorization?.(rootId, [readme], []);
    expect(service.removeFolder?.(rootId)).toBe(true);
    expect(await service.registry.read(readme)).toMatchObject({ ok: false });
    expect(service.listFolders?.()).toEqual([]);
    expect(await service.preview?.(rootId)).toEqual({ status: 'unknown_root' });
    expect(service.removeFolder?.(rootId)).toBe(false);
  });

  it('不跟隨指向資料夾外的符號連結', async () => {
    write('outside/secret.md', 'outside');
    const folder = makeProject('p2');
    symlinkSync(path.join(base, 'outside'), path.join(folder, 'linked'));
    symlinkSync(path.join(base, 'outside/secret.md'), path.join(folder, 'link.md'));
    const service = createSourcesService({ picker: pickerOf([folder]) });
    const result = await service.pickFolders?.();
    if (result?.status !== 'selected') throw new Error('not selected');
    const entries = await previewOf(service, result.roots[0]?.rootId ?? '');
    expect(entries.map((e) => e.name)).not.toContain('secret.md');
    expect(entries.map((e) => e.name)).not.toContain('link.md');
  });
});

describe('選取器', () => {
  it('取消回 cancelled，不加入任何資料夾', async () => {
    const service = createSourcesService({ picker: pickerOf([]) });
    expect(await service.pickFolders?.()).toEqual({ status: 'cancelled' });
    expect(service.listFolders?.()).toEqual([]);
  });

  it('同一路徑重選沿用同一個資料夾', async () => {
    const folder = makeProject('p');
    const service = createSourcesService({ picker: pickerOf([folder], [folder]) });
    const a = await service.pickFolders?.();
    const b = await service.pickFolders?.();
    expect(a).toEqual(b);
    expect(service.listFolders?.()).toHaveLength(1);
  });

  it('已有選取器開著時回 busy，不開第二個', async () => {
    let release: (paths: string[]) => void = () => {};
    const picker: FolderPicker = () => new Promise((resolve) => (release = resolve));
    const service = createSourcesService({ picker });
    const first = service.pickFolders?.();
    expect(await service.pickFolders?.()).toEqual({ status: 'busy' });
    release([]);
    expect(await first).toEqual({ status: 'cancelled' });
  });

  it('相對路徑、不存在或不是資料夾的選取被略過；全部失敗就丟錯', async () => {
    write('file.md');
    const folder = makeProject('ok');
    const service = createSourcesService({
      picker: pickerOf(
        ['relative/dir', path.join(base, 'missing'), path.join(base, 'file.md'), folder],
        [path.join(base, 'missing')],
      ),
    });
    const result = await service.pickFolders?.();
    expect(result).toMatchObject({ status: 'selected', roots: [{ name: 'ok' }] });
    await expect(service.pickFolders?.()).rejects.toThrow();
    expect(service.listFolders?.()).toHaveLength(1);
    expect(service.registry.folders()).toHaveLength(1);
  });

  it('沒有 picker 時不提供 pickFolders', () => {
    expect('pickFolders' in createSourcesService()).toBe(false);
  });
});
