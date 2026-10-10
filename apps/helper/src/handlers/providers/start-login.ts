import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/**
 * providers.start_login：開啟官方登入流程（D3：不代為輸入、不擷取憑證）。
 * 目前一律回 not_implemented：@rolecraft/providers 只有 ADR-0002 審過的命令（執行、auth status、--version），
 * 沒有經過驗證的登入命令；helper 不自行組 CLI 命令列。編輯器改顯示官方登入步驟說明。
 */
export const providersStartLogin: OpHandler<'providers.start_login'> = () =>
  Promise.resolve(notImplemented());
