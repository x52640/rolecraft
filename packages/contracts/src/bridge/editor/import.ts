import { z } from 'zod';

import { Id, NonEmptyText } from '../../entities/common.ts';
import { ProfileContent } from '../../entities/profile.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';
import {
  ImportAiDraft,
  ImportAiFailure,
  ImportDraft,
  ResumeImportFailureReason,
} from './import-shapes.ts';
import {
  ImportAiParseNames,
  ImportAiSource,
  ImportLatestCapture,
  ImportManualResult,
  ImportWebAiDraft,
  ImportWebCaptureResult,
} from './import-web.ts';

/**
 * import.*：履歷匯入與校正（F02、R10、D18；P1-T020；D28 加網頁與手動來源）。
 * 檔案只能由 helper 開系統選取器選（R7、ADR-0003）：請求不帶任何路徑，回傳不透明 importId 與顯示名稱。
 * 欄位草稿積木在 import-shapes.ts，網頁與手動來源在 import-web.ts。
 */

/**
 * 解析結果（import.get）。依 status 分辨來源（D28／W4）：
 * - parsed／failed：PDF（形狀不變）。成功時有原文（依閱讀順序的行）與欄位草稿；失敗只有原因，不當成功
 * - web_capture：網頁擷取，原文是區塊清單（import-web.ts）
 * - manual：手動輸入，沒有原文
 */
export const ImportResult = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('parsed'),
    displayName: NonEmptyText,
    pages: z.array(z.strictObject({ pageNumber: z.int().min(1), lines: z.array(z.string()) })),
    pagesWithoutText: z.array(z.int().min(1)),
    draft: ImportDraft,
  }),
  z.strictObject({
    status: z.literal('failed'),
    displayName: NonEmptyText,
    reason: ResumeImportFailureReason,
  }),
  ImportWebCaptureResult,
  ImportManualResult,
]);
export type ImportResult = z.infer<typeof ImportResult>;

/** 匯入來源種類。 */
export type ImportSourceKind = 'pdf' | 'web' | 'manual';

/** 解析結果的來源：parsed／failed 是 PDF。 */
export function importSourceOf(result: ImportResult): ImportSourceKind {
  if (result.status === 'web_capture') return 'web';
  if (result.status === 'manual') return 'manual';
  return 'pdf';
}

/**
 * 最近一次 AI 整理（只存在 helper 記憶體）。成功才有草稿，失敗才有 failure。
 * D28 相加：source 分辨來源（省略＝PDF）；網頁來源的草稿放 webDraft（出處是區塊編號），draft 為 null。
 */
export const ImportAiParseView = z
  .strictObject({
    state: z.enum(['running', 'succeeded', 'failed']),
    failure: ImportAiFailure.nullable(),
    draft: ImportAiDraft.nullable(),
    source: ImportAiSource.optional(),
    webDraft: ImportWebAiDraft.nullable().optional(),
  })
  .refine((v) => (v.state === 'failed') === (v.failure !== null), {
    path: ['failure'],
    message: '只有失敗有原因',
  })
  .refine((v) => (v.state === 'succeeded') === (v.draft !== null || v.webDraft != null), {
    path: ['draft'],
    message: '只有成功有草稿',
  })
  .refine((v) => (v.source === 'web' ? v.draft === null : v.webDraft == null), {
    path: ['webDraft'],
    message: '草稿出處與來源不符',
  });
export type ImportAiParseView = z.infer<typeof ImportAiParseView>;

/**
 * 使用者校正後的個人資料（Profile 去掉 id 與確認旗標；確認旗標只由 import.confirm 設定）。
 * D30：也不含版本號與出處（由 helper 管理、從工作階段原文取出；呼叫端送來就被 schema 擋）。
 */
export const ProfileInput = ProfileContent;
export type ProfileInput = z.infer<typeof ProfileInput>;

const ImportRef = z.strictObject({ importId: OpaqueId });
const WithProfile = z.strictObject({ importId: OpaqueId, profile: ProfileInput });

export const IMPORT_SCHEMAS = {
  /** helper 開系統檔案選取器（只限 PDF）並解析；使用者取消回 cancelled。 */
  'import.pick_pdf': {
    request: bridgeOp('import.pick_pdf', EmptyPayload),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        selection: z.discriminatedUnion('status', [
          z.strictObject({
            status: z.literal('selected'),
            importId: Id,
            displayName: NonEmptyText,
          }),
          z.strictObject({ status: z.literal('cancelled') }),
        ]),
      }),
    ),
  },
  /** 取得解析結果。 */
  'import.get': {
    request: bridgeOp('import.get', ImportRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), result: ImportResult })),
  },
  /** 暫存逐欄校正（不算確認，不能用於生成）。 */
  'import.save_corrections': {
    request: bridgeOp('import.save_corrections', WithProfile),
    response: withFailure(Ack),
  },
  /**
   * 使用者確認校正結果，寫入 Profile 並標為已確認（R10）。
   * 帶的是使用者確認當下看到的內容；解析失敗時也可確認手動輸入的內容（D18）。
   * D28／Q8（網頁、PDF、手動共用）：已有一份 Profile 就更新那一份（保留 id），沒有才新增；
   * 已有多份時不寫入，回 invalid_request＋固定原因 multiple_profiles。
   * D30：請求形狀不變；helper 依工作階段草稿比對寫下各欄出處（不接受呼叫端的出處文字）、版本號加一。
   */
  'import.confirm': {
    request: bridgeOp('import.confirm', WithProfile),
    response: withFailure(z.strictObject({ ok: z.literal(true), profileId: Id })),
  },
  /**
   * 用使用者選定的 Claude 模型整理已解析的文字（P1-T069）：在背景執行、立即回狀態；已有執行中的就回同一個。
   * 姓名與聯絡資料在本機抽出、不送模型。找不到匯入、解析失敗、沒有選定且可用的模型、超過輸入預算回
   * invalid_request（固定訊息），不呼叫模型。
   * D28 相加選填 names：使用者確認的姓名（可多個寫法；只用於本機遮蔽與預填，不送模型）。網頁來源本次頁面
   * 姓名沒辨識出來又沒帶 names 時回 invalid_request＋固定原因 name_required，不呼叫模型。
   */
  'import.ai_parse': {
    request: bridgeOp(
      'import.ai_parse',
      z.strictObject({ importId: OpaqueId, names: ImportAiParseNames.optional() }),
    ),
    response: withFailure(z.strictObject({ ok: z.literal(true), parse: ImportAiParseView })),
  },
  /** 最近一次 AI 整理的狀態與（成功時）草稿；沒有整理過（或 helper 重開）為 null。 */
  'import.ai_status': {
    request: bridgeOp('import.ai_status', ImportRef),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), parse: ImportAiParseView.nullable() }),
    ),
  },
  /** 最近一次網頁擷取（D28）；沒有（或已被擠出記憶體）為 null。查詢不觸發 AI 整理。 */
  'import.latest_capture': {
    request: bridgeOp('import.latest_capture', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), capture: ImportLatestCapture.nullable() }),
    ),
  },
  /** 建立沒有原文的匯入工作階段（D28，手動輸入），回 importId。 */
  'import.start_manual': {
    request: bridgeOp('import.start_manual', EmptyPayload),
    response: withFailure(z.strictObject({ ok: z.literal(true), importId: Id })),
  },
} as const;
