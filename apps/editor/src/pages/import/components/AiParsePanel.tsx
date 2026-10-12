import { DISCARD_TEXT, PREFILL_LABELS, type PrefillSource } from '../ai-form.ts';
import type { AiParseState } from '../useAiParse.ts';
import { NameConfirm } from './NameConfirm.tsx';
import { PersonalMark } from './PersonalMark.tsx';

interface AiParsePanelProps {
  state: AiParseState;
  source: PrefillSource;
  /** 網頁來源（D28 Q4＝B）：一律按「用 AI 整理」才呼叫模型 */
  web: boolean;
  /** 使用者改過預填內容：重新整理前要再按一次確認 */
  confirmingRerun: boolean;
  onRerun: () => void;
  /** 使用者確認姓名後送出（只在 helper 回「需確認姓名」時用到） */
  onConfirmNames: (names: string[]) => void;
}

function IdleText({ web, source }: { web: boolean; source: PrefillSource }) {
  if (web) {
    return (
      <p role="status" className="import-hint">
        還沒有使用 AI。核對右邊擷取到的區塊與「內容不完整」標示後，按「用 AI
        整理」才會送出（用你選定的 Claude
        模型、會用到訂閱額度；姓名與聯絡資料不會送出）。也可以直接手動輸入。
      </p>
    );
  }
  return (
    <p role="status" className="import-hint">
      預填來源：{PREFILL_LABELS[source]}（沒有使用 AI）。需要時可按「用 AI 重新整理」。
    </p>
  );
}

/**
 * AI 整理狀態（P1-T069；D28 加網頁來源）：整理中、需確認姓名、失敗原因與目前預填來源、被略過的欄位、
 * 其他段落（不寫入個人資料）、「用 AI 整理」。姓名與聯絡資料只在本機處理，不送 AI。
 */
export function AiParsePanel(props: AiParsePanelProps) {
  const { state, source, web, confirmingRerun, onRerun, onConfirmNames } = props;
  const firstRun = web && state.kind === 'idle';
  return (
    <section className="import-ai" aria-label="AI 整理">
      {state.kind === 'idle' && <IdleText web={web} source={source} />}
      {state.kind === 'running' && (
        <p role="status" className="import-hint">
          AI 整理中…（用你選定的 Claude 模型；姓名與聯絡資料不會送出）。完成前表單暫時鎖住。
        </p>
      )}
      {state.kind === 'needs_name' && <NameConfirm onConfirm={onConfirmNames} />}
      {state.kind === 'failed' && (
        <p role="status" className="import-warning">
          AI 整理沒有完成：{state.message}。目前欄位是用「{PREFILL_LABELS[source]}」預填的，
          {web ? '請對照右邊擷取到的區塊手動輸入或逐欄核對。' : '請逐欄核對。'}
        </p>
      )}
      {state.kind === 'succeeded' && (
        <>
          <p role="status" className="import-success">
            預填來源：{PREFILL_LABELS[source]}。仍請逐欄核對後再確認。
          </p>
          {state.draft.discarded.length > 0 && (
            <div className="import-warning">
              <p>AI 給的值與原文不符，已略過：</p>
              <ul aria-label="已略過的欄位">
                {state.draft.discarded.map((d, i) => (
                  <li key={i}>
                    {d.field}（{DISCARD_TEXT[d.reason]}）
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.draft.otherSections.length > 0 && (
            <details className="import-draft">
              <summary>其他段落（AI 整理，不寫入個人資料，僅供參考）</summary>
              {state.draft.otherSections.map((s, i) => (
                <div key={i} className="import-draft-group">
                  <h4>
                    {s.heading.value}
                    {(s.heading.containsPersonalData === true ||
                      s.body.containsPersonalData === true) && <PersonalMark />}
                  </h4>
                  <p className="import-pre">{s.body.value}</p>
                </div>
              ))}
            </details>
          )}
        </>
      )}
      {state.kind !== 'running' && state.kind !== 'needs_name' && (
        <p>
          <button type="button" className="import-btn import-btn-secondary" onClick={onRerun}>
            {confirmingRerun
              ? '確定重新整理（放棄目前的修改）'
              : firstRun
                ? '用 AI 整理'
                : '用 AI 重新整理'}
          </button>
          {confirmingRerun && (
            <span role="note" aria-label="覆蓋提醒" className="import-hint">
              {' '}
              你已修改過欄位，重新整理會蓋掉目前的內容。
            </span>
          )}
        </p>
      )}
    </section>
  );
}
