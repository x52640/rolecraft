/** editor 的公開入口（給測試與其他工具用；頁面入口是 src/main.tsx）。 */
export const PACKAGE_NAME = '@rolecraft/editor';

export { App } from './app/App.tsx';
export { ROUTES, DEFAULT_ROUTE_PATH, matchRoute } from './app/routes.ts';
export type { EditorRoute } from './app/routes.ts';
export { BridgeProvider, useBridge } from './bridge/BridgeProvider.tsx';
export { createEditorBridge } from './bridge/client.ts';
export type { EditorBridge, RequestOf, ResponseOf } from './bridge/client.ts';
export { RELAY_CHANNEL, createRuntimeTransport } from './bridge/transport.ts';
export type { BridgeTransport } from './bridge/transport.ts';
