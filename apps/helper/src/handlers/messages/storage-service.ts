// MessagesService 的 storage 實作（P1-T029，F08、D6、D7、R10）。
// 訊息內容只是資料：只保存、組進提示的資料區塊，不解讀、不執行。沒有任何送出功能（D7）。
import type { MessageDraft, MessageSummary } from '@rolecraft/contracts';
import { computeInputBudget, type InputBudget } from '@rolecraft/domain';
import { planDraft, type DraftPlanFailure, type DraftReport } from '@rolecraft/pipeline';
import { createRepositories, newId } from '@rolecraft/storage';
import type { DatabaseSync } from 'node:sqlite';

import type { ClaimGate } from '../sources/claim-gate.ts';
import type { ResolveDraftEngine } from './claude-engine.ts';
import { abortableSleep, startDraftJob } from './draft-job.ts';
import type { DraftRefusal, MessagesService } from './service.ts';

export interface MessagesServiceOptions {
  readonly db: DatabaseSync;
  /** 目前可用的 AI 執行端；沒有就不排入工作 */
  readonly resolveEngine: ResolveDraftEngine;
  /** 測試用 */
  readonly newId?: () => string;
  readonly now?: () => number;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly budget?: InputBudget;
  /** 測試用：工作停下時通知 */
  readonly onSettled?: (report: DraftReport) => void;
  /** 草稿讀事實項時的來源關卡（P1-T060） */
  readonly claimGate?: ClaimGate | null;
}

/**
 * 輸入預算（R8）：回覆草稿只送訊息、職缺與可用事實項。上下文上限取保守值，
 * 並預留輸出與官方工具自身開銷。
 */
function defaultBudget(): InputBudget {
  const result = computeInputBudget({
    contextLimit: 200_000,
    outputReserve: 8_000,
    toolOverheadReserve: 40_000,
  });
  if (!result.ok) throw new Error('預設輸入預算不合法');
  return result.budget;
}

function summarize(message: MessageDraft): MessageSummary {
  return {
    messageDraftId: message.id,
    platform: message.platform,
    captureMethod: message.captureMethod,
    jobSnapshotId: message.jobSnapshotId,
    replyIntent: message.replyIntent,
    hasDraft: /\S/u.test(message.draft),
  };
}

const REFUSALS: Record<DraftPlanFailure, DraftRefusal> = {
  message_missing: 'not_found',
  intent_unclear: 'intent_unclear',
  snapshot_missing: 'snapshot_missing',
  snapshot_not_confirmed: 'snapshot_not_confirmed',
};

export function createMessagesService(options: MessagesServiceOptions): Required<MessagesService> {
  const repos = createRepositories(options.db);
  const makeId = options.newId ?? newId;
  const now = options.now ?? Date.now;
  const budget = options.budget ?? defaultBudget();
  /** 正在產生草稿的訊息（同一則一次只跑一個工作） */
  const running = new Set<string>();

  return {
    submitCapture(payload) {
      // 關聯的職缺快照必須是既有的（外鍵；查不到時 storage 丟錯，不默默改成不關聯）。
      const saved = repos.messageDrafts.save({
        id: makeId(),
        platform: payload.platform,
        captureMethod: payload.captureMethod,
        selectedMessageText: payload.selectedMessageText,
        userModified: false,
        jobSnapshotId: payload.jobSnapshotId,
        replyIntent: '',
        draft: '',
      });
      return Promise.resolve({ messageDraftId: saved.id });
    },

    list() {
      return Promise.resolve(repos.messageDrafts.list().map(summarize));
    },

    get(messageDraftId) {
      return Promise.resolve(repos.messageDrafts.get(messageDraftId));
    },

    updateDraft(messageDraftId, draft) {
      const current = repos.messageDrafts.get(messageDraftId);
      if (!current) return Promise.resolve(false);
      repos.messageDrafts.save({ ...current, draft });
      return Promise.resolve(true);
    },

    async requestDraft({ messageDraftId, replyIntent }) {
      const message = repos.messageDrafts.get(messageDraftId);
      if (!message) return { refused: 'not_found' };
      if (running.has(message.id)) return { refused: 'busy' };
      const jobSnapshot = message.jobSnapshotId
        ? repos.jobSnapshots.get(message.jobSnapshotId)
        : null;
      const planned = planDraft({ message, replyIntent, jobSnapshot, budget, newId: makeId });
      if (!planned.ok) return { refused: REFUSALS[planned.reason] };
      running.add(message.id);
      try {
        const engine = await options.resolveEngine();
        if (!engine) {
          running.delete(message.id);
          return { refused: 'no_service' };
        }
        const { plan } = planned;
        // 等待引擎期間使用者可能另外存了草稿：重新讀取，只更新意圖，不用舊快照蓋掉
        const fresh = repos.messageDrafts.get(message.id);
        if (!fresh) {
          running.delete(message.id);
          return { refused: 'not_found' };
        }
        repos.messageDrafts.save({ ...fresh, replyIntent: plan.intent });
        const job = startDraftJob(plan, {
          db: options.db,
          repos,
          engine,
          newId: makeId,
          now,
          sleep: options.sleep ?? abortableSleep,
          gate: options.claimGate ?? null,
        });
        void job
          .then((report) => options.onSettled?.(report))
          .catch(() => undefined)
          .finally(() => running.delete(message.id));
        return { workJobId: plan.jobId };
      } catch (error) {
        running.delete(message.id);
        throw error;
      }
    },
  };
}
