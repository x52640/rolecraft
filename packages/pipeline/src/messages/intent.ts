/**
 * 回覆意圖（F08）：只有接受邀約、詢問職務、婉拒三種，必須由使用者明確選定。
 * 空白、別的寫法或任何其他值都是「意圖不明」：不猜、不送出，交回畫面請使用者確認。
 */
import type { ReplyIntent } from './types.ts';

export const REPLY_INTENTS: readonly ReplyIntent[] = ['accept', 'inquire', 'decline'];

export const REPLY_INTENT_LABELS: Record<ReplyIntent, string> = {
  accept: '接受邀約',
  inquire: '詢問職務',
  decline: '婉拒',
};

/** 提示中對模型說明意圖（本機產生，放在資料區塊外）。 */
export const REPLY_INTENT_GUIDANCE: Record<ReplyIntent, string> = {
  accept:
    '接受邀約：感謝對方並表達有興趣進一步了解或安排面試；請對方提供後續安排方式，不要自己提出或答應任何時間。',
  inquire: '詢問職務：感謝對方，並針對職務內容、團隊或工作範圍提出一到三個問題。',
  decline: '婉拒：禮貌感謝對方並婉拒，可表示保持聯繫；不需要說明私人理由。',
};

/** 只接受三個固定值（完全相同）；其他一律 null＝意圖不明。 */
export function parseReplyIntent(value: string): ReplyIntent | null {
  return REPLY_INTENTS.find((intent) => intent === value) ?? null;
}
