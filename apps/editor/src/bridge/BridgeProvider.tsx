import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { createEditorBridge, type EditorBridge } from './client.ts';
import { createDefaultTransport, type BridgeTransport } from './transport.ts';

const BridgeContext = createContext<EditorBridge | null>(null);

interface BridgeProviderProps {
  /** 測試可注入假通道；省略時用擴充功能頁的 chrome.runtime（開發用 harness 頁改用 HTTP，P1-T068）。 */
  transport?: BridgeTransport | null;
  children: ReactNode;
}

export function BridgeProvider({ transport, children }: BridgeProviderProps) {
  const bridge = useMemo(
    () => createEditorBridge(transport === undefined ? createDefaultTransport() : transport),
    [transport],
  );
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

/** 取得橋接客戶端；必須在 BridgeProvider 之內使用。 */
export function useBridge(): EditorBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error('useBridge 必須在 BridgeProvider 之內使用');
  return bridge;
}
