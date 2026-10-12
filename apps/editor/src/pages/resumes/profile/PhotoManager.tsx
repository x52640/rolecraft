import { useState } from 'react';

import { PHOTO_TEXT } from './profile-labels.ts';
import type { PhotoState } from './usePhoto.ts';

interface Props {
  readonly state: PhotoState;
  readonly locked: boolean;
  readonly onAdd: () => void;
  readonly onReplace: () => void;
  readonly onRemove: () => void;
  readonly onReload: () => void;
}

type Confirming = 'replace' | 'remove' | null;

/**
 * 照片縮圖與加入／更換／刪除（P1-T085；resume-output「照片」）。
 * 更換與刪除都先說明 D19 後果、使用者確認後才送；更換確認後才開選取器。
 */
export function PhotoManager({ state, locked, onAdd, onReplace, onRemove, onReload }: Props) {
  const [confirming, setConfirming] = useState<Confirming>(null);

  if (state.kind === 'loading') return <p>讀取照片中…</p>;
  if (state.kind === 'unsupported' || state.kind === 'unknown') {
    return (
      <>
        <p className="resume-hint">
          {state.kind === 'unsupported' ? PHOTO_TEXT.notImplemented : state.message}
        </p>
        {state.kind === 'unknown' ? <p className="resume-hint">{PHOTO_TEXT.unknown}</p> : null}
        <button type="button" disabled={locked} onClick={onReload}>
          重新讀取照片
        </button>
      </>
    );
  }

  const { current } = state;
  if (current === null) {
    return (
      <>
        <p className="resume-hint">{PHOTO_TEXT.none}</p>
        <button type="button" disabled={locked} onClick={onAdd}>
          加入照片
        </button>
      </>
    );
  }

  const confirm = () => {
    const action = confirming === 'replace' ? onReplace : onRemove;
    setConfirming(null);
    action();
  };

  return (
    <>
      <img
        className="profile-photo"
        src={`data:${current.thumbnail.mimeType};base64,${current.thumbnail.base64}`}
        alt="目前的照片"
      />
      <p className="resume-meta">
        {String(current.photo.width)} × {String(current.photo.height)} px（JPEG，已去除中繼資料）
      </p>
      {confirming === null ? (
        <div className="resume-actions">
          <button type="button" disabled={locked} onClick={() => setConfirming('replace')}>
            更換照片
          </button>
          <button type="button" disabled={locked} onClick={() => setConfirming('remove')}>
            刪除照片
          </button>
        </div>
      ) : (
        <div className="resume-warning">
          <p>{confirming === 'replace' ? PHOTO_TEXT.replaceWarning : PHOTO_TEXT.removeWarning}</p>
          <div className="resume-actions">
            <button type="button" disabled={locked} onClick={confirm}>
              {confirming === 'replace' ? '確認更換並選擇照片' : '確認刪除照片'}
            </button>
            <button type="button" onClick={() => setConfirming(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
