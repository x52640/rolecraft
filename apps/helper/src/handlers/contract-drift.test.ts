// contracts 的橋接列舉是 domain／resume-import 型別的鏡像（contracts 不能依賴它們）。
// helper 是相依圖頂端，在這裡用型別鎖住兩邊一致：任一邊改了另一邊沒跟上，typecheck 就失敗。
import type {
  BridgeExportCheckKind,
  BridgeExportIssueCode,
  ConfirmableCompletion as BridgeConfirmableCompletion,
  ResumeImportFailureReason,
} from '@rolecraft/contracts';
import type { ConfirmableCompletion, ExportCheckKind, ExportIssueCode } from '@rolecraft/domain';
import type { ExtractFailureReason } from '@rolecraft/resume-import';
import { describe, expectTypeOf, it } from 'vitest';

describe('橋接列舉與後端型別一致（P1-T041）', () => {
  it('R1 匯出前檢查', () => {
    expectTypeOf<BridgeExportCheckKind>().toEqualTypeOf<ExportCheckKind>();
    expectTypeOf<BridgeExportIssueCode>().toEqualTypeOf<ExportIssueCode>();
  });

  it('事實項可確認的完成狀態', () => {
    expectTypeOf<BridgeConfirmableCompletion>().toEqualTypeOf<ConfirmableCompletion>();
  });

  it('PDF 擷取失敗原因', () => {
    expectTypeOf<ResumeImportFailureReason>().toEqualTypeOf<ExtractFailureReason>();
  });
});
