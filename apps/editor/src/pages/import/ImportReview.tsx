import { importSourceOf, type ImportResult } from '@rolecraft/contracts';
import type { Ref } from 'react';

import type { PrefillSource } from './ai-form.ts';
import { AiParsePanel } from './components/AiParsePanel.tsx';
import { ConfirmBar } from './components/ConfirmBar.tsx';
import { WebPreview } from './components/WebPreview.tsx';
import { FAILURE_TEXT, type ProfileForm } from './form-model.ts';
import { ParsePreview } from './ParsePreview.tsx';
import { ProfileFormFields } from './ProfileForm.tsx';
import type { AiParseState } from './useAiParse.ts';

export interface ImportReviewProps {
  result: ImportResult;
  form: ProfileForm;
  onFormChange: (form: ProfileForm) => void;
  ai: { state: AiParseState; running: boolean };
  source: PrefillSource;
  rerunArmed: boolean;
  onRerun: () => void;
  onConfirmNames: (names: string[]) => void;
  problems: readonly string[];
  problemsRef: Ref<HTMLUListElement>;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onSubmit: () => void;
  onPick: () => void;
  onManual: () => void;
}

/**
 * 核對畫面（PDF、網頁、手動共用）：來源列、AI 整理狀態、校正表單、原文預覽（PDF 頁／行、網頁區塊）、
 * 確認列。網頁來源一律按「用 AI 整理」才呼叫模型（D28 Q4＝B）；「手動輸入」入口一律在。
 */
export function ImportReview(props: ImportReviewProps) {
  const { result, form, ai, source, problems } = props;
  const kind = importSourceOf(result);
  const hasPreview = result.status === 'parsed' || result.status === 'web_capture';
  return (
    <form
      className="import-review"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <div className="import-file-bar">
        <span>
          {kind === 'pdf' ? '檔案' : '來源'}：<strong>{result.displayName}</strong>
        </span>
        <button type="button" className="import-btn import-btn-secondary" onClick={props.onPick}>
          {kind === 'pdf' ? '改選其他檔案' : '改選履歷 PDF'}
        </button>
        <button type="button" className="import-btn import-btn-secondary" onClick={props.onManual}>
          手動輸入
        </button>
      </div>
      {result.status === 'failed' && (
        <div role="alert" aria-label="解析失敗" className="import-warning">
          <p>無法可靠解析這份 PDF：{FAILURE_TEXT[result.reason]}</p>
          <p>解析結果不會被使用。請在下方手動輸入個人資料、經歷與技能。</p>
        </div>
      )}
      {result.status === 'manual' && (
        <p className="import-hint">手動輸入：沒有原文，請直接填寫個人資料、經歷與技能。</p>
      )}

      <div className={hasPreview ? 'import-layout' : undefined}>
        <div className="import-form-column">
          {hasPreview && (
            <AiParsePanel
              state={ai.state}
              source={source}
              web={kind === 'web'}
              confirmingRerun={props.rerunArmed}
              onRerun={props.onRerun}
              onConfirmNames={props.onConfirmNames}
            />
          )}
          <ProfileFormFields form={form} onChange={props.onFormChange} disabled={ai.running} />
          {problems.length > 0 && (
            <ul
              ref={props.problemsRef}
              tabIndex={-1}
              role="alert"
              aria-label="需要修正"
              className="import-error"
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
        {result.status === 'parsed' && <ParsePreview result={result} />}
        {result.status === 'web_capture' && <WebPreview result={result} />}
      </div>

      <ConfirmBar
        checked={props.checked}
        onCheck={props.onCheck}
        problemCount={problems.length}
        locked={ai.running}
      />
    </form>
  );
}
