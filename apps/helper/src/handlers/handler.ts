// 操作 handler 的型別：每個操作一個 handler 檔（src/handlers/<群組>/<動作>.ts），在 registry.ts 註冊。
// handler 只收 dispatch 已用 contracts schema 驗證過的 payload；內容一律只是資料（R7）。
import type { BridgeOperation, BridgeRequestOf, BridgeResponseOf } from '@rolecraft/contracts';

import type { HelperServices } from './services.ts';

export type OpHandler<Op extends BridgeOperation> = (
  payload: BridgeRequestOf<Op>['payload'],
  services: HelperServices,
) => Promise<BridgeResponseOf<Op>>;

/** 分派表：鍵必須恰好是 contracts 的 BridgeOperation（少一個或多一個都編譯不過）。 */
export type HandlerTable = { readonly [Op in BridgeOperation]: OpHandler<Op> };
