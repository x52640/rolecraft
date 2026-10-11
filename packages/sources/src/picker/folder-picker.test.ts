// 資料夾選取器與共用執行層：一律注入假 execFile，不開真的對話框。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { BRIDGE_PICKER_TIMEOUT_MS, PICKER_DIALOG_TIMEOUT_MS } from '@rolecraft/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createMacFolderPicker, FOLDER_SCRIPT, parseFolderOutput } from './folder-picker.ts';
import { defaultExecFile, OSASCRIPT, PickerError, type ExecFileRunner } from './osascript.ts';

function fakeExec(result: { stdout?: string; error?: Error }) {
  return vi.fn<ExecFileRunner>(() =>
    result.error === undefined
      ? Promise.resolve(result.stdout ?? '')
      : Promise.reject(result.error),
  );
}

const darwin = { platform: 'darwin' as const };

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PickerError);
  return (error as PickerError).reason;
}

describe('資料夾選取器：命令固定', () => {
  it('只執行 /usr/bin/osascript、參數是寫死腳本的 -e 行、不經 shell', async () => {
    const exec = fakeExec({ stdout: '1\n/Users/me/proj/\n' });
    await createMacFolderPicker({ execFile: exec, ...darwin })();
    expect(exec).toHaveBeenCalledTimes(1);
    const [file, args, options] = exec.mock.calls[0] ?? [];
    expect(file).toBe(OSASCRIPT);
    expect(file).toBe('/usr/bin/osascript');
    expect(args).toEqual(FOLDER_SCRIPT.flatMap((line) => ['-e', line]));
    expect(options).toMatchObject({ shell: false });
    expect(options?.timeout).toBeGreaterThan(0);
  });

  it('對話框上限取自 contracts，且小於橋接客戶端的選取器逾時（P1-T045）', async () => {
    const exec = fakeExec({ stdout: '1\n/a/\n' });
    await createMacFolderPicker({ execFile: exec, ...darwin })();
    const timeout = exec.mock.calls[0]?.[2].timeout;
    expect(timeout).toBe(PICKER_DIALOG_TIMEOUT_MS);
    expect(timeout).toBeLessThan(BRIDGE_PICKER_TIMEOUT_MS);
  });

  it('每次呼叫的參數完全相同（沒有任何外部輸入）', async () => {
    const exec = fakeExec({ stdout: '1\n/a/\n' });
    const picker = createMacFolderPicker({ execFile: exec, ...darwin });
    await picker();
    await picker();
    expect(exec.mock.calls[0]).toEqual(exec.mock.calls[1]);
    expect(picker.length).toBe(0);
  });

  it('腳本可複選、只回 POSIX 路徑', () => {
    expect(FOLDER_SCRIPT.join('\n')).toContain('with multiple selections allowed');
    expect(FOLDER_SCRIPT.join('\n')).not.toMatch(/do shell script/iu);
  });

  it('不是 macOS：不執行、丟 not_macos', async () => {
    const exec = fakeExec({ stdout: '' });
    const picker = createMacFolderPicker({ execFile: exec, platform: 'linux' });
    expect(await reasonOf(picker())).toBe('not_macos');
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('資料夾選取器：結果', () => {
  it('複選：依序回絕對路徑，保留名稱前後空白', async () => {
    const stdout = '3\n/Users/me/a/\n/Users/me/ b /\n/Volumes/外接/專案/\n';
    const picked = await createMacFolderPicker({ execFile: fakeExec({ stdout }), ...darwin })();
    expect(picked).toEqual(['/Users/me/a/', '/Users/me/ b /', '/Volumes/外接/專案/']);
  });

  it('使用者取消（-128，stderr 或 message）：回空陣列', async () => {
    const viaStderr = Object.assign(new Error('Command failed'), {
      stderr: 'execution error: User canceled. (-128)',
    });
    const viaMessage = new Error('Command failed: osascript\nUser canceled. (-128)');
    for (const error of [viaStderr, viaMessage]) {
      const picker = createMacFolderPicker({ execFile: fakeExec({ error }), ...darwin });
      expect(await picker()).toEqual([]);
    }
  });

  it('其他失敗：dialog_failed，訊息不含原始輸出', async () => {
    const error = Object.assign(new Error('boom /Users/me/secret'), { stderr: '/Users/me/secret' });
    const picker = createMacFolderPicker({ execFile: fakeExec({ error }), ...darwin });
    const failure = await picker().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PickerError);
    expect((failure as PickerError).reason).toBe('dialog_failed');
    expect((failure as PickerError).message).not.toContain('secret');
  });

  it.each([
    ['名稱含換行（數量對不上）', '1\n/Users/me/evil\nname/'],
    ['相對路徑', '1\nUsers/me/a/'],
    ['不是資料夾（沒有結尾 /）', '1\n/Users/me/a'],
    ['數量為 0', '0'],
    ['數量不是數字', 'x\n/a/'],
    ['根目錄', '1\n/'],
    ['空輸出', ''],
  ])('輸出不符（%s）：整批不採用', (_name, stdout) => {
    expect(() => parseFolderOutput(stdout)).toThrow(PickerError);
  });
});

describe('defaultExecFile（真實子行程，不開對話框）', () => {
  it('回 stdout；失敗時錯誤帶 stderr', async () => {
    const options = { timeout: 10_000, maxBuffer: 1024, shell: false, windowsHide: true } as const;
    await expect(
      defaultExecFile(process.execPath, ['-e', 'process.stdout.write("ok")'], options),
    ).resolves.toBe('ok');
    const failure = await defaultExecFile(
      process.execPath,
      ['-e', 'process.stderr.write("User canceled. (-128)"); process.exit(1)'],
      options,
    ).catch((e: unknown) => e);
    expect(failure).toMatchObject({ stderr: 'User canceled. (-128)' });
  });
});

describe('選取器原始碼靜態檢查', () => {
  const dir = import.meta.dirname;
  const sources = ['osascript.ts', 'folder-picker.ts', 'pdf-picker.ts'].map((name) =>
    readFileSync(path.join(dir, name), 'utf8'),
  );

  it('只用 execFile，沒有 shell、exec、spawn、do shell script', () => {
    for (const code of sources) {
      expect(code).not.toMatch(/shell:\s*true|\bexecSync\b|\bspawn\b|\bexec\(|do shell script/u);
    }
  });

  it('execFile 只出現在共用執行層，且檔案參數是寫死的常數', () => {
    const [osascript = '', ...others] = sources;
    for (const code of others) expect(code).not.toMatch(/child_process/u);
    expect(osascript).toContain("export const OSASCRIPT = '/usr/bin/osascript'");
    expect(osascript).toMatch(/run\(OSASCRIPT, args,/u);
  });
});
