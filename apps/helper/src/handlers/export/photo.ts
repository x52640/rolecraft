// 匯出用的照片（D28；resume-output「照片」）：讀一次目前照片，印進 PDF 的與記進匯出版本的
// 是同一份內容。照片只進匯出文件，不進任何提示或模型輸入。
import { createHash } from 'node:crypto';

import type { ExportVersion } from '@rolecraft/contracts';
import type { ResumeDocument } from '@rolecraft/pdf-export';
import type { PhotoRepository } from '@rolecraft/storage';

export interface ExportPhoto {
  /** 印進 PDF 的照片（JPEG data URI） */
  readonly document: NonNullable<ResumeDocument['photo']>;
  /** 記進匯出版本的照片 ID 與雜湊（R3）；storage 建立時會再比對是不是目前照片 */
  readonly record: NonNullable<ExportVersion['photo']>;
}

export type ExportPhotoRead =
  | { readonly ok: true; readonly photo: ExportPhoto | null }
  /** 存下的內容與記錄的雜湊對不上：不印、不匯出（不能記一個與印出內容不同的雜湊） */
  | { readonly ok: false };

export function readExportPhoto(photos: Pick<PhotoRepository, 'get'>): ExportPhotoRead {
  const stored = photos.get();
  if (stored === null) return { ok: true, photo: null };
  const { photo, content } = stored;
  const actual = createHash('sha256').update(content).digest('hex');
  if (photo.format !== 'jpeg' || actual !== photo.sha256) return { ok: false };
  return {
    ok: true,
    photo: {
      document: { dataUri: `data:image/jpeg;base64,${Buffer.from(content).toString('base64')}` },
      record: { photoId: photo.id, sha256: photo.sha256 },
    },
  };
}
