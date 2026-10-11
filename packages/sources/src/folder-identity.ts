/**
 * 資料夾身分（P1-T058 對抗驗證）：實際路徑＋(dev, ino)。加入資料夾時記下，重啟還原後第一次開啟時比對；
 * 原路徑被換成符號連結或另一個資料夾時不一致，呼叫端就不得沿用先前的授權。
 * (dev, ino) 以十進位字串保存（bigint 才不失精度）。
 */
import { lstat, realpath } from 'node:fs/promises';

export interface FolderIdentity {
  readonly realPath: string;
  readonly dev: string;
  readonly ino: string;
}

/** 讀目前路徑實際指向的資料夾身分；不存在或不是資料夾就丟錯。 */
export async function readFolderIdentity(folderPath: string): Promise<FolderIdentity> {
  const realPath = await realpath(folderPath);
  const info = await lstat(realPath, { bigint: true });
  if (!info.isDirectory()) throw new Error('不是資料夾');
  return { realPath, dev: info.dev.toString(), ino: info.ino.toString() };
}

export function sameFolderIdentity(a: FolderIdentity, b: FolderIdentity): boolean {
  return a.realPath === b.realPath && a.dev === b.dev && a.ino === b.ino;
}
