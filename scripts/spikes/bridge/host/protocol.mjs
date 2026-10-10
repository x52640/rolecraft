// 原型的固定操作清單（R7）。純函式，不碰 I/O，方便測試。
// 原則：未知操作、多餘欄位、型別不符一律拒絕；任何欄位都不會被當成路徑、指令或參數。

export const MAX_ECHO_CHARS = 4096;

/** 允許的呼叫來源格式（manifest 的 allowed_origins 已限制，host 再驗一次格式）。 */
const ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}\/$/;

/** 操作 → 允許的欄位（除了 id、op）。 */
const OPERATIONS = {
  ping: [],
  echo: ['text'],
  pickFolders: [],
};

export function isAllowedOriginFormat(origin) {
  return typeof origin === 'string' && ORIGIN_PATTERN.test(origin);
}

function reject(id, code, detail) {
  return { id, ok: false, error: { code, detail } };
}

/**
 * 驗證請求並分派。回傳值：
 * - `{ reply }`：直接回覆
 * - `{ action: 'pickFolders', id }`：需要 host 開系統對話框（只有這一種副作用，且沒有輸入參數）
 */
export function route(message) {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return { reply: reject(null, 'bad_request', '請求必須是 JSON 物件') };
  }
  const id = typeof message.id === 'string' && message.id.length <= 64 ? message.id : null;
  if (id === null) return { reply: reject(null, 'bad_request', 'id 必須是 64 字以內字串') };

  const op = message.op;
  if (typeof op !== 'string' || !Object.hasOwn(OPERATIONS, op)) {
    return { reply: reject(id, 'unknown_op', '不在固定操作清單內') };
  }
  const allowed = new Set(['id', 'op', ...OPERATIONS[op]]);
  const extra = Object.keys(message).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    return { reply: reject(id, 'unexpected_field', `不接受欄位：${extra.join(', ')}`) };
  }

  switch (op) {
    case 'ping':
      return { reply: { id, ok: true, result: { pong: true } } };
    case 'echo': {
      const text = message.text;
      if (typeof text !== 'string' || text.length > MAX_ECHO_CHARS) {
        return { reply: reject(id, 'bad_field', `text 必須是 ${MAX_ECHO_CHARS} 字以內字串`) };
      }
      return { reply: { id, ok: true, result: { text } } };
    }
    case 'pickFolders':
      return { action: 'pickFolders', id };
    default:
      return { reply: reject(id, 'unknown_op', '不在固定操作清單內') };
  }
}
