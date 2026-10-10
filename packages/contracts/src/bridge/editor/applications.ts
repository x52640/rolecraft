import { z } from 'zod';

import { ApplicationInitiation, ApplicationRecord } from '../../entities/application-record.ts';
import { Id, NonEmptyText, Timestamp } from '../../entities/common.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * applications.*：投遞紀錄（F09、R3、D19；P1-T028）。
 * 只是記錄；沒有任何代為投遞的操作（D7）。實際投出版本只能指向匯出版本（R3）。
 */

const ApplicationFields = {
  initiation: ApplicationInitiation,
  appliedAt: Timestamp,
  status: NonEmptyText,
  /** 實際投出的匯出版本 */
  exportVersionId: OpaqueId,
};

const ApplicationRef = z.strictObject({ applicationId: OpaqueId });

export const APPLICATIONS_SCHEMAS = {
  'applications.list': {
    request: bridgeOp('applications.list', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), applications: z.array(ApplicationRecord) }),
    ),
  },
  'applications.create': {
    request: bridgeOp('applications.create', z.strictObject(ApplicationFields)),
    response: withFailure(z.strictObject({ ok: z.literal(true), applicationId: Id })),
  },
  'applications.update': {
    request: bridgeOp(
      'applications.update',
      z.strictObject({ applicationId: OpaqueId, ...ApplicationFields }),
    ),
    response: withFailure(Ack),
  },
  /** 整筆刪除投遞紀錄（D19）；匯出版本本身不在這裡刪。 */
  'applications.delete': {
    request: bridgeOp('applications.delete', ApplicationRef),
    response: withFailure(Ack),
  },
} as const;
