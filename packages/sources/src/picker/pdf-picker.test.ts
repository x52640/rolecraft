// PDF 選取器：注入假 execFile（不開對話框），讀檔用暫存資料夾裡的真檔案。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { OSASCRIPT, PickerError, type ExecFileRunner } from './osascript.ts';
import { createMacPdfPicker, parsePdfOutput, PDF_SCRIPT } from './pdf-picker.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-pdf-picker-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1');

function file(name: string, content: Buffer | string): string {
  const full = path.join(dir, name);
  writeFileSync(full, content);
  return full;
}

/** 假 osascript：回傳指定路徑（加上 osascript 結尾換行）。 */
function pickerFor(picked: string, maxBytes?: number) {
  const exec = vi.fn<ExecFileRunner>(() => Promise.resolve(`${picked}\n`));
  const picker = createMacPdfPicker({
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

describe('PDF 選取器：命令固定', () => {
  it('只執行 /usr/bin/osascript、寫死腳本、不經 shell；腳本只收 PDF 類型', async () => {
    const { exec, picker } = pickerFor(file('a.pdf', PDF));
    await picker();
    const [command, args, options] = exec.mock.calls[0] ?? [];
    expect(command).toBe(OSASCRIPT);
    expect(args).toEqual(PDF_SCRIPT.flatMap((line) => ['-e', line]));
    expect(options).toMatchObject({ shell: false });
    expect(PDF_SCRIPT.join('\n')).toContain('of type {"com.adobe.pdf"}');
    expect(PDF_SCRIPT.join('\n')).not.toMatch(/do shell script|multiple selections/iu);
    expect(picker.length).toBe(0);
  });

  it('不是 macOS：不執行', async () => {
    const exec = vi.fn<ExecFileRunner>(() => Promise.resolve(''));
    const picker = createMacPdfPicker({ execFile: exec, platform: 'win32' });
    expect(await reasonOf(picker())).toBe('not_macos');
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('PDF 選取器：結果', () => {
  it('成功：只回檔名（不含上層路徑）與內容', async () => {
    const full = file('我的履歷.PDF', PDF);
    const picked = await pickerFor(full).picker();
    expect(picked?.fileName).toBe('我的履歷.PDF');
    expect(Buffer.from(picked?.bytes ?? []).equals(PDF)).toBe(true);
    expect(JSON.stringify(picked?.fileName)).not.toContain(dir);
    expect(Object.keys(picked ?? {}).sort()).toEqual(['bytes', 'fileName']);
  });

  it('檔頭前有少量雜訊仍接受（前 1024 位元組內）', async () => {
    const full = file('prefixed.pdf', Buffer.concat([Buffer.alloc(100, 0x20), PDF]));
    expect((await pickerFor(full).picker())?.fileName).toBe('prefixed.pdf');
  });

  it('使用者取消：回 null、不讀檔', async () => {
    const error = Object.assign(new Error('Command failed'), { stderr: 'User canceled. (-128)' });
    const exec = vi.fn<ExecFileRunner>(() => Promise.reject(error));
    const picker = createMacPdfPicker({ execFile: exec, platform: 'darwin' });
    expect(await picker()).toBeNull();
  });

  it('副檔名不是 .pdf：not_pdf', async () => {
    const full = file('resume.txt', PDF);
    expect(await reasonOf(pickerFor(full).picker())).toBe('not_pdf');
  });

  it('副檔名是 .pdf 但內容不是 PDF：not_pdf', async () => {
    const full = file('fake.pdf', 'hello, not a pdf');
    expect(await reasonOf(pickerFor(full).picker())).toBe('not_pdf');
  });

  it('檔頭在 1024 位元組之後：not_pdf', async () => {
    const full = file('late.pdf', Buffer.concat([Buffer.alloc(2000, 0x20), PDF]));
    expect(await reasonOf(pickerFor(full).picker())).toBe('not_pdf');
  });

  it('超過大小上限：too_large', async () => {
    const full = file('big.pdf', Buffer.concat([PDF, Buffer.alloc(200)]));
    expect(await reasonOf(pickerFor(full, 100).picker())).toBe('too_large');
  });

  it('剛好等於上限：接受', async () => {
    const full = file('exact.pdf', PDF);
    expect((await pickerFor(full, PDF.length).picker())?.bytes.length).toBe(PDF.length);
  });

  it('名為 .pdf 的資料夾：not_file', async () => {
    const folder = path.join(dir, 'folder.pdf');
    mkdirSync(folder);
    expect(await reasonOf(pickerFor(folder).picker())).toBe('not_file');
  });

  it('符號連結：不跟隨（not_file）', async () => {
    const target = file('target.pdf', PDF);
    const link = path.join(dir, 'link.pdf');
    symlinkSync(target, link);
    expect(await reasonOf(pickerFor(link).picker())).toBe('not_file');
  });

  it('檔案不存在：not_file', async () => {
    expect(await reasonOf(pickerFor(path.join(dir, 'missing.pdf')).picker())).toBe('not_file');
  });

  it.each([
    ['相對路徑', 'resume.pdf'],
    ['資料夾路徑', '/Users/me/folder/'],
    ['多行', '/Users/me/a.pdf\n/Users/me/b.pdf'],
    ['空輸出', ''],
  ])('輸出不符（%s）：bad_output', (_name, output) => {
    expect(() => parsePdfOutput(output)).toThrow(PickerError);
  });
});
