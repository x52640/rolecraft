import type { MessageSummary } from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { CAPTURE_METHOD_LABELS, PLATFORM_LABELS } from '../jobs/labels.ts';
import { failureText, intentLabel } from './labels.ts';
import { MessageDetail } from './MessageDetail.tsx';
import './messages.css';
import { PasteMessageForm } from './PasteMessageForm.tsx';
import { DEFAULT_POLL, type PollOptions } from './useMessageDraft.ts';

type View = { kind: 'list' } | { kind: 'paste' } | { kind: 'detail'; id: string };

interface MessagesPageProps {
  /** 測試用：縮短輪詢間隔 */
  poll?: PollOptions;
}

/**
 * 訊息頁（F08、D6、D7）：手動貼上招募訊息、選回覆意圖、產生草稿、編輯與一鍵複製。
 * 沒有任何送出功能：草稿只能編輯與複製，由使用者回原平台送出。
 */
export function MessagesPage({ poll = DEFAULT_POLL }: MessagesPageProps) {
  const bridge = useBridge();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [messages, setMessages] = useState<MessageSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await bridge.send({ op: 'messages.list', payload: {} });
    if (response.ok) {
      setMessages(response.messages);
      setFailure(null);
    } else {
      setFailure(failureText(response));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">訊息</h1>
      <p>
        貼上招募訊息，選擇回覆意圖後產生回覆草稿。草稿可編輯、一鍵複製；RoleCraft 不會替你送出。
      </p>
      <p role="note" className="placeholder-note">
        私訊頁自動擷取尚未支援，目前請手動貼上訊息。
      </p>
      {failure ? <p role="alert">{failure}</p> : null}
      {view.kind === 'paste' ? (
        <PasteMessageForm
          onCancel={() => setView({ kind: 'list' })}
          onCreated={(id) => {
            void reload();
            setView({ kind: 'detail', id });
          }}
        />
      ) : (
        <>
          <div className="message-actions">
            <button type="button" onClick={() => setView({ kind: 'paste' })}>
              手動貼上訊息
            </button>
          </div>
          {messages && messages.length === 0 ? <p>還沒有訊息。</p> : null}
          {messages && messages.length > 0 ? (
            <ul className="message-list" aria-label="訊息清單">
              {messages.map((m, i) => (
                <li key={m.messageDraftId}>
                  <button
                    type="button"
                    aria-current={
                      view.kind === 'detail' && view.id === m.messageDraftId ? true : undefined
                    }
                    onClick={() => setView({ kind: 'detail', id: m.messageDraftId })}
                  >
                    {`訊息 ${String(i + 1)}｜${PLATFORM_LABELS[m.platform]}｜${CAPTURE_METHOD_LABELS[m.captureMethod]}｜意圖：${intentLabel(m.replyIntent)}｜${m.hasDraft ? '有草稿' : '尚無草稿'}`}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {view.kind === 'detail' ? (
            <MessageDetail
              key={view.id}
              messageDraftId={view.id}
              poll={poll}
              onChanged={() => void reload()}
              onClose={() => setView({ kind: 'list' })}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
