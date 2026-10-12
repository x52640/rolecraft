import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.reverify_claude：重新啟用 Claude（D24）；在背景重跑注入測試，立即回覆目前狀態。 */
export const providersReverifyClaude: OpHandler<'providers.reverify_claude'> = async (
  _payload,
  services,
) => {
  const service = services.providers;
  if (!service?.reverifyClaude) return notImplemented();
  const { started, status } = await service.reverifyClaude();
  return { ok: true, started, status };
};
