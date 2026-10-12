import { z } from 'zod';

import { Claim, ReviewStatus } from '../../entities/claim.ts';
import { Id, NonEmptyText } from '../../entities/common.ts';
import { ProjectEvidence } from '../../entities/project-evidence.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * claims.*：事實項檢視與確認（F04、R1、R2、D14；P1-T023）。
 * 確認只能由使用者在擴充功能頁發起（content script 不能呼叫，relay 擋）。
 */

/**
 * 使用者對功能／交付物可確認的完成狀態（對應 domain ConfirmableCompletion）：
 * 「文件標示完成」「未知」不是使用者確認的結果。其他類型不得帶。
 */
export const ConfirmableCompletion = z.enum(['user_confirmed_done', 'planned']);
export type ConfirmableCompletion = z.infer<typeof ConfirmableCompletion>;

const ClaimRef = z.strictObject({ claimId: OpaqueId });

/** 專案名稱（使用者確認或修改的）：至少一個非空白字元、最多 100 字。 */
export const PROJECT_NAME_MAX_CHARS = 100;
export const ProjectName = NonEmptyText.max(PROJECT_NAME_MAX_CHARS);

/** 一次確認建立的專案數與每專案文件數上限。 */
export const MAX_PROJECTS_PER_REQUEST = 100;
export const MAX_DOCUMENTS_PER_PROJECT = 1000;

/** 使用者確認的一組專案：名稱＋文件（建議回過的來源文件不透明 ID）。 */
export const ProjectGroupInput = z.strictObject({
  name: ProjectName,
  sourceDocumentIds: z.array(OpaqueId).min(1).max(MAX_DOCUMENTS_PER_PROJECT),
});
export type ProjectGroupInput = z.infer<typeof ProjectGroupInput>;

const ProjectRef = z.strictObject({ projectId: OpaqueId });

/**
 * 事實項來源文件的顯示名稱（P1-T073）：檔名與所屬資料夾名稱都只有最後一段，不含上層路徑（R7）。
 * 只供顯示；畫面不顯示內部 ID。來源文件已不在清單（例如已刪除）就不列。
 */
export const ClaimSourceName = z.strictObject({
  sourceDocumentId: Id,
  name: NonEmptyText,
  rootName: NonEmptyText,
});
export type ClaimSourceName = z.infer<typeof ClaimSourceName>;

/** 事實項清單回應（相加 sourceNames，P1-T073）。 */
const ClaimList = z.strictObject({
  ok: z.literal(true),
  claims: z.array(Claim),
  sourceNames: z.array(ClaimSourceName).optional(),
});

export const CLAIMS_SCHEMAS = {
  /** 列出專案（摘要不帶確認狀態，R1）。 */
  'claims.list_projects': {
    request: bridgeOp('claims.list_projects', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), projects: z.array(ProjectEvidence) }),
    ),
  },
  /** 列出某專案的事實項（含狀態與來源片段）。 */
  'claims.list': {
    request: bridgeOp('claims.list', z.strictObject({ projectId: OpaqueId })),
    response: withFailure(ClaimList),
  },
  /** 列出未歸專案的事實項（D23）：不在任何專案 claimIds 裡、未刪除；依建立順序。 */
  'claims.list_unassigned': {
    request: bridgeOp('claims.list_unassigned', EmptyPayload),
    response: withFailure(ClaimList),
  },
  'claims.get': {
    request: bridgeOp('claims.get', ClaimRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), claim: Claim })),
  },
  /**
   * 確認事實項：text 是使用者確認當下看到（可一併修正）的內容，helper 記錄確認時間與這段文字（R1）。
   * 確認時間由 helper 決定，不由呼叫端給。
   * expectedReviewStatus 是畫面當時顯示的複核狀態；helper 在同一交易比對，不符就拒絕不寫入（R2），
   * 避免使用者對著過時的畫面把待複核、來源矛盾清回正常。
   */
  'claims.confirm': {
    request: bridgeOp(
      'claims.confirm',
      z.strictObject({
        claimId: OpaqueId,
        text: NonEmptyText,
        completion: ConfirmableCompletion.optional(),
        expectedReviewStatus: ReviewStatus,
      }),
    ),
    response: withFailure(Ack),
  },
  /** 修改事實項內容：既有使用者確認失效，要重新確認。 */
  'claims.update': {
    request: bridgeOp('claims.update', z.strictObject({ claimId: OpaqueId, text: NonEmptyText })),
    response: withFailure(Ack),
  },
  /** 否決（刪除）事實項：之後不得用於生成。 */
  'claims.reject': {
    request: bridgeOp('claims.reject', ClaimRef),
    response: withFailure(Ack),
  },
  /**
   * 使用者確認分組後建立專案（D23）：文件須目前已授權、尚未屬於任何專案、不重複，任一不符整批不建立。
   * 同一交易依歸屬規則把未歸專案的事實項歸入新專案（evidence-model「專案分組與事實項歸屬」）。
   */
  'claims.create_projects': {
    request: bridgeOp(
      'claims.create_projects',
      z.strictObject({
        projects: z.array(ProjectGroupInput).min(1).max(MAX_PROJECTS_PER_REQUEST),
      }),
    ),
    response: withFailure(Ack),
  },
  'claims.rename_project': {
    request: bridgeOp(
      'claims.rename_project',
      z.strictObject({ projectId: OpaqueId, name: ProjectName }),
    ),
    response: withFailure(Ack),
  },
  /** 把 projectId 併入 intoProjectId（事實項與文件移過去，來源專案刪除）。 */
  'claims.merge_projects': {
    request: bridgeOp(
      'claims.merge_projects',
      z.strictObject({ projectId: OpaqueId, intoProjectId: OpaqueId }),
    ),
    response: withFailure(Ack),
  },
  /** 把事實項移到另一專案；projectId 為 null 表示移回未歸專案。 */
  'claims.move_claim': {
    request: bridgeOp(
      'claims.move_claim',
      z.strictObject({ claimId: OpaqueId, projectId: OpaqueId.nullable() }),
    ),
    response: withFailure(Ack),
  },
  /** 刪除專案：事實項回到未歸專案，事實項本身不刪。 */
  'claims.delete_project': {
    request: bridgeOp('claims.delete_project', ProjectRef),
    response: withFailure(Ack),
  },
} as const;
