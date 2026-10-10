// helper 建立 Claude 執行 deps 的唯一入口（P1-T040；ADR-0002 §6、P1-T012 殘餘）。
// 一律經 providers 的 claudeRunDeps 套上串流守門：init 異常、工具呼叫、額度拒絕時立即終止整個程序群組。
// helper 其他檔案不得自己組 Claude 執行 deps（claude-deps.test.ts 靜態檢查）。
import { claudeRunDeps, type StreamGuardOptions } from '@rolecraft/providers';

type DepsBase = Parameters<typeof claudeRunDeps>[0];

export function helperClaudeDeps<T extends DepsBase>(
  base: T,
  options?: StreamGuardOptions,
): ReturnType<typeof claudeRunDeps<T>> {
  return options === undefined ? claudeRunDeps(base) : claudeRunDeps(base, options);
}
