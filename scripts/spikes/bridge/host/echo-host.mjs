/* global process, console */
// 最小 Native Messaging echo host。瀏覽器以 stdio 啟動；第一個參數是呼叫者 origin。
// 只有固定操作（protocol.mjs）；任何錯誤都回覆結構化錯誤或結束連線，不嘗試猜測意圖。
// stdout 只能寫框；除錯訊息一律寫 stderr。
import { pathToFileURL } from 'node:url';

import { FrameDecoder, FrameError, encodeFrame } from './framing.mjs';
import { pickFolders, runMacFolderDialog } from './folder-picker.mjs';
import { isAllowedOriginFormat, route } from './protocol.mjs';

/**
 * @param {{ input: NodeJS.ReadableStream, output: NodeJS.WritableStream, origin: string | undefined,
 *   dialog?: () => Promise<string[]>, exit?: (code: number) => void }} io
 */
export function startHost({
  input,
  output,
  origin,
  dialog = runMacFolderDialog,
  exit = process.exit,
}) {
  const send = (value) => output.write(encodeFrame(value));
  if (!isAllowedOriginFormat(origin)) {
    console.error(`[echo-host] 拒絕：origin 格式不符 ${String(origin)}`);
    exit(2);
    return;
  }
  const registry = new Map();
  const decoder = new FrameDecoder();
  input.on('data', (chunk) => {
    let messages;
    try {
      messages = decoder.push(chunk);
    } catch (err) {
      const code = err instanceof FrameError ? err.code : 'frame_error';
      send({ id: null, ok: false, error: { code, detail: '框格式錯誤，結束連線' } });
      exit(3);
      return;
    }
    for (const message of messages) {
      const routed = route(message);
      if (routed.reply) {
        send(routed.reply);
        continue;
      }
      pickFolders(dialog, registry).then(
        (result) => send({ id: routed.id, ok: true, result }),
        (err) => {
          console.error('[echo-host] 選取器失敗', err);
          send({
            id: routed.id,
            ok: false,
            error: { code: 'dialog_failed', detail: '系統選取器失敗' },
          });
        },
      );
    }
  });
  input.on('end', () => exit(decoder.hasPartial ? 4 : 0));
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startHost({ input: process.stdin, output: process.stdout, origin: process.argv[2] });
}
