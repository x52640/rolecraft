import { BridgeProvider } from '../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../bridge/transport.ts';
import { hrefFor, useHashPath } from './router.ts';
import { DEFAULT_ROUTE_PATH, matchRoute, ROUTES } from './routes.ts';

interface AppProps {
  /** 測試可注入假通道；省略時用擴充功能頁的 chrome.runtime。 */
  transport?: BridgeTransport | null;
}

function NotFound() {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">找不到這個頁面</h1>
      <p>
        <a href={hrefFor(DEFAULT_ROUTE_PATH)}>回到匯入頁</a>
      </p>
    </section>
  );
}

export function App({ transport }: AppProps) {
  const route = matchRoute(useHashPath());
  const Page = route?.Page ?? NotFound;
  return (
    <BridgeProvider {...(transport === undefined ? {} : { transport })}>
      <div className="layout">
        <nav aria-label="主要頁面" className="sidebar">
          <p className="brand">RoleCraft</p>
          <ul>
            {ROUTES.map(({ path, label }) => (
              <li key={path}>
                <a href={hrefFor(path)} aria-current={route?.path === path ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="content">
          <Page />
        </main>
      </div>
    </BridgeProvider>
  );
}
