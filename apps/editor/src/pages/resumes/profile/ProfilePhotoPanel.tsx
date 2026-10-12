import { useEffect } from 'react';

import { PhotoManager } from './PhotoManager.tsx';
import { ProfileCopyList } from './ProfileCopyList.tsx';
import { useBlockLock } from './useBlockLock.ts';
import { usePhoto } from './usePhoto.ts';
import { useProfileCopy } from './useProfileCopy.ts';
import './profile.css';

/**
 * 履歷頁「個人資料與照片」區塊（P1-T085、D28）：已確認的個人資料逐欄複製、匯出用照片管理。
 * 整個區塊共用一把請求鎖（進行中鎖住全部按鈕，過期回應作廢）。沒有任何送出（D7）：
 * 複製後由使用者自己貼到求職網站。
 */
export function ProfilePhotoPanel() {
  const lock = useBlockLock();
  const profile = useProfileCopy(lock);
  const photo = usePhoto(lock);
  const { restart, current, end } = lock;
  const { fetchProfile, apply: applyProfile } = profile;
  const { fetchPhoto, apply: applyPhoto } = photo;

  useEffect(() => {
    // 初次讀取也是一個操作；cleanup（含 StrictMode 的重跑）讓它作廢
    const token = restart('loading');
    void Promise.all([fetchProfile(), fetchPhoto()]).then(([p, ph]) => {
      if (!current(token)) return;
      applyProfile(p);
      applyPhoto(ph);
      end(token);
    });
    // 只在掛載時讀取一次；之後由各按鈕重新讀取
  }, []);

  /** 照片狀態不明或服務未接上時重新讀取（只讀照片）。 */
  const reloadPhoto = () => {
    const token = lock.begin('loading');
    if (token === null) return;
    void fetchPhoto().then((res) => {
      if (!current(token)) return;
      applyPhoto(res);
      end(token);
    });
  };

  const locked = lock.busy !== null;
  const photoKey = photo.state.kind === 'ready' ? (photo.state.current?.photo.id ?? 'none') : '';
  return (
    <section aria-labelledby="profile-photo-title" className="profile-photo-panel">
      <h2 id="profile-photo-title">個人資料與照片</h2>
      <p className="resume-hint">
        複製前會向本機輔助程式重新讀取已確認的內容，與畫面一致才複製；不會自動送出任何內容。
      </p>
      <ProfileCopyList
        state={profile.state}
        locked={locked}
        onCopy={(key) => void profile.copy(key)}
      />
      {profile.message !== null ? (
        <p aria-live="polite" className="resume-notice">
          {profile.message}
        </p>
      ) : null}
      <h3>照片</h3>
      <PhotoManager
        key={photoKey}
        state={photo.state}
        locked={locked}
        onAdd={() => void photo.add()}
        onReplace={() => void photo.replace()}
        onRemove={() => void photo.remove()}
        onReload={reloadPhoto}
      />
      {photo.message !== null ? (
        <p aria-live="polite" className="resume-notice">
          {photo.message}
        </p>
      ) : null}
    </section>
  );
}
