import type { Provider } from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { SERVICE_ORDER, type ServiceStatus } from './labels.ts';
import { ProviderCard } from './ProviderCard.tsx';

/** 設定：AI 服務狀態與設定精靈（F01、S9-1、S9-3；P1-T030）。 */
export function SettingsPage() {
  const bridge = useBridge();
  const [statuses, setStatuses] = useState<readonly ServiceStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<Provider | null>(null);

  const load = useCallback(async () => {
    const res = await bridge.send({ op: 'providers.status', payload: {} });
    if (res.ok) {
      setStatuses(res.services);
      setError(null);
    } else {
      setError(`無法取得服務狀態：${res.error.message}`);
    }
  }, [bridge]);

  useEffect(() => {
    void load();
  }, [load]);

  const recheck = async (service: Provider) => {
    setChecking(service);
    const res = await bridge.send({ op: 'providers.recheck', payload: { service } });
    setChecking(null);
    if (!res.ok) {
      setError(`重新檢查失敗：${res.error.message}`);
      return;
    }
    setError(null);
    setStatuses((prev) =>
      (prev ?? []).some((s) => s.service === service)
        ? (prev ?? []).map((s) => (s.service === service ? res.status : s))
        : [...(prev ?? []), res.status],
    );
  };

  const ordered = SERVICE_ORDER.flatMap((service) => {
    const found = statuses?.find((s) => s.service === service);
    return found ? [found] : [];
  });

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">設定</h1>
      <p>連接你已有訂閱的 AI 服務，並選擇要用的模型。</p>
      <aside className="data-notice" aria-label="資料去向">
        <h2>資料會送到你選定的 AI 服務</h2>
        <p>
          RoleCraft 和官方工具在你的電腦上執行，但模型不是在本機推論：產生或分析內容時，
          相關的履歷、專案文件摘錄與職缺內容會送到你選定的服務（例如 Claude 會送到 Anthropic）處理。
          只會使用你自己的訂閱登入，不會改用 API key 或自動加購。
        </p>
      </aside>
      <p role="note" className="login-guide">
        官方登入：RoleCraft
        不代為輸入帳號密碼，也不讀取登入憑證。從這裡自動開啟官方登入流程尚未實作；
        請依服務的官方說明登入官方工具（Claude 請登入 Claude Code，並選擇以 Claude
        訂閱帳號登入），完成後按「重新檢查」。
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {statuses === null && !error ? <p>讀取服務狀態中…</p> : null}
      <div className="provider-cards">
        {ordered.map((status) => (
          <ProviderCard
            key={status.service}
            status={status}
            busy={checking === status.service}
            onRecheck={() => void recheck(status.service)}
            onSettled={() => void load()}
          />
        ))}
      </div>
    </section>
  );
}
