// claims 測試共用：真實 SQLite（記憶體）＋暫存檔案區，預先放四個事實項與一個專案。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { BridgeRequest, Claim } from '@rolecraft/contracts';
import {
  createLocalFileStore,
  createRepositories,
  openDatabase,
  type FileStore,
} from '@rolecraft/storage';

import { recordingLogger } from '../../../__fixtures__/requests.ts';
import { dispatch } from '../../../bridge/dispatch.ts';
import type { HelperServices } from '../../services.ts';
import { createClaimsService } from '../storage-service.ts';

export const CONFIRMED_AT = '2026-10-10T08:00:00.000Z';
export const P = 'project-1';
export const INVALID = { ok: false, error: { code: 'invalid_request' } };

export function claim(id: string, over: Partial<Claim> = {}): Claim {
  return {
    id,
    type: 'feature',
    text: '支援 PDF 匯出',
    completionStatus: 'documented_done',
    basis: {
      sourceExcerpts: [
        {
          sourceDocumentId: 'doc-1',
          contentVersion: 1,
          contentHash: 'a'.repeat(64),
          location: 'tb2:0:1/1:x',
          text: '已完成 PDF 匯出',
        },
      ],
      userConfirmation: null,
    },
    reviewStatus: 'normal',
    ...over,
  };
}

export interface ClaimsDb {
  dir: string;
  db: ReturnType<typeof openDatabase>['db'];
  fileStore: FileStore;
  services: HelperServices;
  send(request: BridgeRequest | Record<string, unknown>): Promise<unknown>;
  stored(id: string): Claim | null;
  cleanup(): void;
}

export function openClaimsDb(): ClaimsDb {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-claims-'));
  const { db } = openDatabase(':memory:');
  const fileStore = createLocalFileStore(path.join(dir, 'files'));
  const services = { claims: createClaimsService({ db, fileStore, now: () => CONFIRMED_AT }) };
  const repos = createRepositories(db);
  repos.claims.save(claim('c-feature'));
  const role: Claim = { ...claim('c-role'), type: 'personal_role', text: '負責後端' };
  delete role.completionStatus;
  repos.claims.save(role);
  repos.claims.save(claim('c-review', { reviewStatus: 'needs_review' }));
  repos.claims.save(claim('c-removed', { reviewStatus: 'source_removed' }));
  repos.projectEvidence.save({
    id: P,
    name: 'RoleCraft',
    summary: '履歷編輯器',
    claimIds: ['c-feature', 'c-role', 'c-review', 'c-removed'],
  });
  return {
    dir,
    db,
    fileStore,
    services,
    send: async (request) => (await dispatch(request, services, recordingLogger())).response,
    stored: (id) => createRepositories(db).claims.get(id),
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
