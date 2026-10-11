// 投遞紀錄頁的純函式：日期換算、匯出版本標籤、已投遞版本數（D19）。
import type {
  ApplicationInitiation,
  ApplicationRecord,
  ExportVersionSummary,
} from '@rolecraft/contracts';

export const INITIATION_LABELS: Record<ApplicationInitiation, string> = {
  proactive: '主動投遞',
  invited: '對方邀約',
};

/** 狀態是自由文字（spec 未定狀態值）；這些只是輸入建議。 */
export const STATUS_SUGGESTIONS = ['已投遞', '已讀', '面試中', '已錄取', '未錄取', '已撤回'];

/** 日期欄（YYYY-MM-DD，使用者當地日期）→ 時間戳記；取當地正午避免跨時區或日光節約跳日。 */
export function dateToTimestamp(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const value = new Date(y, m - 1, d, 12);
  if (value.getFullYear() !== y || value.getMonth() !== m - 1 || value.getDate() !== d) return null;
  return value.toISOString();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 時間戳記 → 當地日期（YYYY-MM-DD）。 */
export function timestampToDate(timestamp: string): string {
  const value = new Date(timestamp);
  return `${String(value.getFullYear())}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** 今天的當地日期（新增表單預設值）。 */
export function today(now = new Date()): string {
  return timestampToDate(now.toISOString());
}

/** 匯出版本的顯示名稱：公司｜職稱｜匯出時間｜短 ID（同一分鐘匯出兩次也能區分）。 */
export function versionLabel(version: ExportVersionSummary): string {
  const exported = new Date(version.exportedAt);
  const time = `${timestampToDate(version.exportedAt)} ${pad(exported.getHours())}:${pad(exported.getMinutes())}`;
  return `${version.company}｜${version.title}｜匯出於 ${time}｜${version.exportVersionId.slice(-6)}`;
}

/** 投遞紀錄指向的匯出版本名稱；清單裡找不到時只顯示「匯出版本」與 ID。 */
export function labelFor(
  exportVersionId: string,
  versions: readonly ExportVersionSummary[],
): string {
  const version = versions.find((v) => v.exportVersionId === exportVersionId);
  return version ? versionLabel(version) : `匯出版本 ${exportVersionId}`;
}

/** 已投遞的匯出版本數（不重複）：刪除素材時這些版本會保留副本（D19）。 */
export function appliedVersionCount(applications: readonly ApplicationRecord[]): number {
  return new Set(applications.map((a) => a.exportVersionId)).size;
}
