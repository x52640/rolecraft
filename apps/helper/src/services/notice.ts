// 資料區啟動事件的日誌行（裁定 #13、#14）：與 bridge/logger 同格式（每行一筆 JSON、附時間、只寫 stderr），
// 只有固定事件名，不含路徑、雜湊或例外訊息。
import type { DataDirNotice } from './data-dir.ts';

export function writeNotice(write: (line: string) => void, event: DataDirNotice): void {
  write(`${JSON.stringify({ at: new Date().toISOString(), event })}\n`);
}
