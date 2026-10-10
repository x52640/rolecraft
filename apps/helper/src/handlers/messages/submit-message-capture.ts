import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** submit_message_capture：訊息內容只當資料；對方訊息內的指令不是控制命令。 */
export const submitMessageCapture: OpHandler<'submit_message_capture'> = async (
  payload,
  services,
) => {
  if (!services.messages) return notImplemented();
  const { messageDraftId } = await services.messages.submitCapture(payload);
  return { ok: true, messageDraftId };
};
