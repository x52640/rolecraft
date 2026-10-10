import type { ComponentType } from 'react';

import { ApplicationsPage } from '../pages/applications/ApplicationsPage.tsx';
import { ClaimsPage } from '../pages/claims/ClaimsPage.tsx';
import { ImportPage } from '../pages/import/ImportPage.tsx';
import { JobsPage } from '../pages/jobs/JobsPage.tsx';
import { MessagesPage } from '../pages/messages/MessagesPage.tsx';
import { ProjectsPage } from '../pages/projects/ProjectsPage.tsx';
import { ResumesPage } from '../pages/resumes/ResumesPage.tsx';
import { SettingsPage } from '../pages/settings/SettingsPage.tsx';

export interface EditorRoute {
  /** hash 路徑，例如 "jobs" 對應 #/jobs。 */
  path: string;
  /** 導覽列文字（繁體中文）。 */
  label: string;
  Page: ComponentType;
}

/** 導覽列順序即此陣列順序；新增頁面在 src/pages/<名稱>/ 建資料夾後登記在這裡。 */
export const ROUTES: readonly EditorRoute[] = [
  { path: 'import', label: '匯入', Page: ImportPage },
  { path: 'projects', label: '專案', Page: ProjectsPage },
  { path: 'claims', label: '事實項', Page: ClaimsPage },
  { path: 'jobs', label: '職缺', Page: JobsPage },
  { path: 'messages', label: '訊息', Page: MessagesPage },
  { path: 'resumes', label: '履歷', Page: ResumesPage },
  { path: 'applications', label: '投遞', Page: ApplicationsPage },
  { path: 'settings', label: '設定', Page: SettingsPage },
];

/** 空路徑（#、#/ 或沒有 hash）顯示的頁面。 */
export const DEFAULT_ROUTE_PATH = 'import';

/** 路徑 → 路由；空路徑回預設頁，找不到回 null。 */
export function matchRoute(path: string): EditorRoute | null {
  const target = path === '' ? DEFAULT_ROUTE_PATH : path;
  return ROUTES.find((route) => route.path === target) ?? null;
}
