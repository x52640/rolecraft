import { buildDraft } from './draft/build-draft.ts';
import { layoutPage } from './pdf/layout.ts';
import { assessQuality } from './pdf/quality.ts';
import { PdfReadError, readTextLayer } from './pdf/read-text-layer.ts';
import type { ExtractResult, RawPage } from './types.ts';

/**
 * 在本機擷取履歷 PDF 的文字層（F02）。
 * 只讀文字層、不做 OCR（D18）；無文字層、亂碼過多、讀取順序異常都回傳明確失敗，不當成成功。
 */
export async function extractResumePdf(data: Uint8Array): Promise<ExtractResult> {
  let raw: RawPage[];
  try {
    raw = await readTextLayer(data);
  } catch (error) {
    if (error instanceof PdfReadError)
      return { ok: false, reason: error.kind, message: error.message };
    throw error;
  }
  const failure = assessQuality(raw);
  if (failure) return failure;
  const pages = raw.map(layoutPage);
  return {
    ok: true,
    pageCount: raw.length,
    pages,
    pagesWithoutText: raw.filter((p) => p.runs.length === 0).map((p) => p.pageNumber),
    draft: buildDraft(pages),
  };
}
