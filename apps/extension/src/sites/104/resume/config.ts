import { resumePageRule } from '../../registry.ts';
import type { ResumeSiteConfig } from '../../resume/types.ts';
import { UI_NOISE_104 } from './ui-noise.ts';

/**
 * 104 履歷頁擷取設定：根節點與姓名元素取自 registry（ADR-0004 第 5 節），只有一份來源。
 * registry 沒登記 104 履歷頁是打包設定錯誤（這支腳本只在有登記時才會打包）。
 */
export function resumeConfig104(): ResumeSiteConfig {
  const rule = resumePageRule('104');
  if (!rule) throw new Error('registry 沒有登記 104 履歷頁');
  return {
    platform: '104',
    rootSelector: rule.rootSelector,
    nameSelector: rule.nameSelector,
    uiNoise: UI_NOISE_104,
  };
}
