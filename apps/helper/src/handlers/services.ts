// handler 透過這些介面呼叫 storage／sources／pipeline 等（服務組裝在 helper 啟動時注入）。
// 每個群組的服務介面放在自己的目錄（handlers/<群組>/service.ts），由負責該群組的 Task 擴充；
// 本檔只把它們組起來，後續 Task 不必改這裡。
// 尚未接上的服務留空，handler 回 not_implemented，不偽造成功。
import type { BridgeFailure } from '@rolecraft/contracts';

import type { AnalysisService } from './analysis/service.ts';
import type { ApplicationsService } from './applications/service.ts';
import type { ClaimsService } from './claims/service.ts';
import type { ExportService } from './export/service.ts';
import type { ResumeImportService } from './import/service.ts';
import type { IntroService } from './intro/service.ts';
import type { JobsService } from './jobs/service.ts';
import type { MessagesService } from './messages/service.ts';
import type { ProvidersService } from './providers/service.ts';
import type { ResumeService } from './resume/service.ts';
import type { SourcesService } from './sources/service.ts';

export type {
  AnalysisService,
  ApplicationsService,
  ClaimsService,
  ExportService,
  IntroService,
  JobsService,
  MessagesService,
  ProvidersService,
  ResumeImportService,
  ResumeService,
  SourcesService,
};

/** 鍵＝群組（handlers 子目錄）；import、export 是保留字，改名 resumeImport、pdfExport。 */
export interface HelperServices {
  jobs?: JobsService;
  resumeImport?: ResumeImportService;
  sources?: SourcesService;
  applications?: ApplicationsService;
  providers?: ProvidersService;
  pdfExport?: ExportService;
  claims?: ClaimsService;
  resume?: ResumeService;
  messages?: MessagesService;
  analysis?: AnalysisService;
  intro?: IntroService;
}

/** 服務尚未接上：回 not_implemented。 */
export function notImplemented(): BridgeFailure {
  return { ok: false, error: { code: 'not_implemented', message: '此操作尚未支援' } };
}
