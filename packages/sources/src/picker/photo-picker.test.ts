// 照片選取器（D28）：注入假 execFile（不開對話框），讀檔用暫存資料夾裡的合成檔案。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PHOTO_SOURCE_MAX_BYTES } from '@rolecraft/contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { OSASCRIPT, PickerError, type ExecFileRunner } from './osascript.ts';
import { createMacPhotoPicker, PHOTO_SCRIPT } from './photo-picker.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-photo-picker-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function file(name: string, content: Buffer | string): string {
  const full = path.join(dir, name);
  writeFileSync(full, content);
  return full;
}

function pickerFor(picked: string, maxBytes?: number) {
  const exec = vi.fn<ExecFileRunner>(() => Promise.resolve(`${picked}\n`));
  const picker = createMacPhotoPicker({
    execFile: exec,
    platform: 'darwin',
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
  return { exec, picker };
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PickerError);
  return (error as PickerError).reason;
}

describe('照片選取器', () => {
  it('只執行寫死腳本、不經 shell；只收 JPEG／PNG；不接受參數', async () => {
    const { exec, picker } = pickerFor(file('a.jpg', JPEG));
    await picker();
    const [command, args, options] = exec.mock.calls[0] ?? [];
    expect(command).toBe(OSASCRIPT);
    expect(args).toEqual(PHOTO_SCRIPT.flatMap((line) => ['-e', line]));
    expect(options).toMatchObject({ shell: false });
    expect(PHOTO_SCRIPT.join('\n')).toContain('of type {"public.jpeg", "public.png"}');
    expect(PHOTO_SCRIPT.join('\n')).not.toMatch(/do shell script|multiple selections/iu);
    expect(picker.length).toBe(0);
  });

  it('JPEG、PNG：只回內容（不回檔名或路徑）；上限預設 10 MB', async () => {
    const jpeg = await pickerFor(file('相片.JPEG', JPEG)).picker();
    expect(Object.keys(jpeg ?? {})).toEqual(['bytes']);
    expect(Buffer.from(jpeg?.bytes ?? []).equals(JPEG)).toBe(true);
    const png = await pickerFor(file('b.png', PNG)).picker();
    expect(Buffer.from(png?.bytes ?? []).equals(PNG)).toBe(true);
    const atLimit = Buffer.concat([JPEG, Buffer.alloc(PHOTO_SOURCE_MAX_BYTES - JPEG.length)]);
    expect((await pickerFor(file('limit.jpg', atLimit)).picker())?.bytes.length).toBe(
      PHOTO_SOURCE_MAX_BYTES,
    );
    expect(
      await reasonOf(pickerFor(file('over.jpg', Buffer.concat([atLimit, JPEG]))).picker()),
    ).toBe('too_large');
  });

  it('副檔名或檔頭不是 JPEG／PNG：not_image', async () => {
    expect(await reasonOf(pickerFor(file('a.gif', JPEG)).picker())).toBe('not_image');
    expect(await reasonOf(pickerFor(file('fake.jpg', 'GIF89a')).picker())).toBe('not_image');
    expect(await reasonOf(pickerFor(file('pdf.png', '%PDF-1.7')).picker())).toBe('not_image');
  });

  it('超過上限：too_large；資料夾、符號連結、不存在：not_file', async () => {
    expect(await reasonOf(pickerFor(file('big.png', PNG), 4).picker())).toBe('too_large');
    const folder = path.join(dir, 'folder.jpg');
    mkdirSync(folder);
    expect(await reasonOf(pickerFor(folder).picker())).toBe('not_file');
    const link = path.join(dir, 'link.jpg');
    symlinkSync(file('target.jpg', JPEG), link);
    expect(await reasonOf(pickerFor(link).picker())).toBe('not_file');
    expect(await reasonOf(pickerFor(path.join(dir, 'missing.png')).picker())).toBe('not_file');
  });

  it('取消回 null；非 macOS 不執行', async () => {
    const error = Object.assign(new Error('Command failed'), { stderr: 'User canceled. (-128)' });
    const cancel = createMacPhotoPicker({
      execFile: vi.fn<ExecFileRunner>(() => Promise.reject(error)),
      platform: 'darwin',
    });
    expect(await cancel()).toBeNull();
    const exec = vi.fn<ExecFileRunner>(() => Promise.resolve(''));
    expect(await reasonOf(createMacPhotoPicker({ execFile: exec, platform: 'linux' })())).toBe(
      'not_macos',
    );
    expect(exec).not.toHaveBeenCalled();
  });

  it('輸出不是單一絕對路徑：bad_output', async () => {
    expect(await reasonOf(pickerFor('relative.jpg').picker())).toBe('bad_output');
    expect(await reasonOf(pickerFor(`${dir}/a.jpg\n${dir}/b.jpg`).picker())).toBe('bad_output');
  });
});
