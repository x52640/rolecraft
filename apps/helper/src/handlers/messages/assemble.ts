// 服務組裝入口（main.ts 只呼叫這一個）：訊息服務＋使用者選定的 Claude 模型。
import type { DatabaseSync } from 'node:sqlite';

import type { ProvidersService } from '../providers/service.ts';
import { claimGateOf } from '../sources/claim-gate.ts';
import type { SourcesService } from '../sources/service.ts';
import { createClaudeDraftEngine } from './claude-engine.ts';
import type { MessagesService } from './service.ts';
import { createMessagesService as createStorageMessagesService } from './storage-service.ts';

export function createMessagesService(
  db: DatabaseSync,
  providers: ProvidersService,
  sources?: SourcesService,
): Required<MessagesService> {
  return createStorageMessagesService({
    db,
    resolveEngine: createClaudeDraftEngine({ providers }),
    claimGate: claimGateOf(sources),
  });
}
