/** helper 的公開入口：Native Messaging 橋接端點與操作清單分派（R7、ADR-0003）。 */
export const PACKAGE_NAME = '@rolecraft/helper';

export {
  FrameDecoder,
  FrameError,
  MAX_INCOMING_BYTES,
  MAX_OUTGOING_BYTES,
  encodeFrame,
} from './bridge/framing.ts';
export {
  ALLOWED_ORIGINS_ENV,
  isAllowedOrigin,
  isExtensionOrigin,
  NATIVE_HOST_NAME,
  parseAllowedOrigins,
} from './bridge/origin.ts';
export { createLineLogger, silentLogger, type LogEvent, type Logger } from './bridge/logger.ts';
export { dispatch, type DispatchResult } from './bridge/dispatch.ts';
export { EXIT_CODES, MAX_PENDING_REQUESTS, startHost, type HostOptions } from './bridge/host.ts';
export type * from './handlers/services.ts';
export { createServices, main } from './main.ts';
