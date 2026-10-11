// 資料區保存的分析計畫（P1-T060）讀回時的形狀檢查。計畫是 helper 自己寫的純資料，
// 但資料庫可能被破壞或來自舊版：形狀不符就當成過期計畫（重新規劃），不拿去續跑。
import type { AnalysisPlan } from '@rolecraft/pipeline';

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isBudget(v: unknown): boolean {
  return (
    isRec(v) &&
    ['contextLimit', 'outputReserve', 'toolOverheadReserve', 'available'].every((k) =>
      isCount(v[k]),
    )
  );
}

function isSegment(v: unknown): boolean {
  return (
    isRec(v) &&
    isCount(v.start) &&
    isCount(v.end) &&
    v.start < v.end &&
    isCount(v.estimatedTokens) &&
    typeof v.split === 'boolean'
  );
}

function isUnit(v: unknown): boolean {
  return (
    isRec(v) &&
    isText(v.unitId) &&
    isText(v.sourceDocumentId) &&
    isCount(v.contentVersion) &&
    isText(v.contentHash) &&
    Array.isArray(v.segments) &&
    v.segments.length > 0 &&
    v.segments.every(isSegment) &&
    isCount(v.estimatedTokens) &&
    isBudget(v.budget)
  );
}

function isSummary(v: unknown): boolean {
  return isRec(v) && isText(v.sourceDocumentId) && typeof v.label === 'string' && isText(v.text);
}

/** 形狀正確才回計畫；否則 null。 */
export function decodePlan(value: unknown): AnalysisPlan | null {
  if (!isRec(value) || !isText(value.jobId)) return null;
  const { units, globalSummary } = value;
  if (!Array.isArray(units) || units.length === 0 || !units.every(isUnit)) return null;
  if (!Array.isArray(globalSummary) || !globalSummary.every(isSummary)) return null;
  return value as unknown as AnalysisPlan;
}
