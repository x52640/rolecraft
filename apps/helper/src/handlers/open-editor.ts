import type { OpenEditorResponse } from '@rolecraft/contracts';

import { notImplemented, type HelperServices } from './services.ts';

/** open_editor：不帶參數。 */
export async function openEditor(services: HelperServices): Promise<OpenEditorResponse> {
  if (!services.editor) return notImplemented();
  await services.editor.open();
  return { ok: true };
}
