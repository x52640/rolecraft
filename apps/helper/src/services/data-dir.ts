// 開啟資料區與「一個資料區只准一個 helper」（擁有者裁定 #13、#14）。
// 鎖被另一個 helper 持有時本 helper 不退出、不開儲存：不需儲存的操作（providers、sources）照沒有資料區時運作，
// 需要儲存的操作回 helper_unavailable 固定訊息；每次收到需要儲存的操作都再試一次取得鎖，
// 對方結束後就接手（同一瀏覽器重連時，舊 helper 可能還在收尾，不能一輩子卡在占用狀態）。
import type { BridgeFailure, BridgeOperation } from '@rolecraft/contracts';

import type { HelperServices } from '../handlers/services.ts';
import {
  DataDirInUseError,
  openHelperRuntime,
  type HelperRuntime,
  type RuntimeConfig,
} from './runtime.ts';

/** 擁有者裁定 #13 的固定訊息（不含路徑或任何請求內容）。 */
export const DATA_DIR_IN_USE_MESSAGE =
  'RoleCraft 正在另一個瀏覽器使用中，請先關閉該瀏覽器的 RoleCraft';

/** 啟動時等對方放鎖的上限：涵蓋同一瀏覽器重連時舊 helper 正在結束的短暫重疊。 */
export const STARTUP_LOCK_WAIT_MS = 2000;

/** 不需要本機儲存的群組：沒有資料區時 createServices 也會接上（main.test.ts 驗一致）。 */
export const STORAGE_FREE_GROUPS: readonly string[] = ['providers', 'sources'];

/**
 * 無群組前綴的擷取操作（含 D28 的 submit_resume_capture：匯入工作階段雖只在記憶體，但與 PDF 匯入共用、
 * 確認時寫入 Profile）一律算需要儲存；其餘看「群組.動作」的群組（import、profile、photo 都需要）。
 */
export function needsStorage(op: BridgeOperation): boolean {
  const dot = op.indexOf('.');
  return dot < 0 || !STORAGE_FREE_GROUPS.includes(op.slice(0, dot));
}

export function dataDirInUse(): BridgeFailure {
  return { ok: false, error: { code: 'helper_unavailable', message: DATA_DIR_IN_USE_MESSAGE } };
}

/** 啟動流程要記的固定事件（不含路徑、例外訊息）。 */
export type DataDirNotice = 'data_dir_in_use' | 'orphan_pdf_sweep_failed';

export interface DataDirDeps {
  /** 資料區開好後組裝全部服務；base＝占用期間已在用的服務（沿用其記憶體狀態） */
  readonly assemble: (runtime: HelperRuntime, base?: HelperServices) => HelperServices;
  /** 不含儲存的服務（資料區被占用期間） */
  readonly withoutStorage: () => HelperServices;
  readonly notice: (notice: DataDirNotice) => void;
  /** 測試用：換掉 openHelperRuntime */
  readonly open?: typeof openHelperRuntime;
}

interface Gate {
  /** 取得鎖並組裝完成後的服務；null＝仍被占用 */
  full: HelperServices | null;
  readonly retry: () => HelperServices | null;
}

const gates = new WeakMap<HelperServices, Gate>();

function tryOpen(
  config: RuntimeConfig,
  deps: DataDirDeps,
  lockWaitMs: number,
  base?: HelperServices,
): HelperServices | null {
  let runtime: HelperRuntime;
  try {
    runtime = (deps.open ?? openHelperRuntime)(config, { lockWaitMs });
  } catch (error) {
    if (error instanceof DataDirInUseError) return null;
    throw error;
  }
  if (runtime.orphanSweepFailed) deps.notice('orphan_pdf_sweep_failed');
  try {
    return deps.assemble(runtime, base);
  } catch (error) {
    runtime.close();
    throw error;
  }
}

/**
 * 開啟資料區並組裝服務。設定錯、資料庫打不開、清掃失敗（已清除素材的 PDF 刪不掉等）照拋，由 main 結束行程。
 * 鎖被占用：回不含儲存的服務，並登記成「被占用」，之後由 resolveServices 決定每個操作怎麼走。
 */
export function connectDataDir(config: RuntimeConfig, deps: DataDirDeps): HelperServices {
  const opened = tryOpen(config, deps, STARTUP_LOCK_WAIT_MS);
  if (opened) return opened;
  deps.notice('data_dir_in_use');
  const base = deps.withoutStorage();
  gates.set(base, { full: null, retry: () => tryOpen(config, deps, 0, base) });
  return base;
}

/**
 * 分派前決定這個操作用哪組服務（registry 包在每個 handler 外）。
 * 一般服務原樣通過；被占用的服務：已接手 → 完整服務；不需儲存 → 原服務；需要儲存 → 再試一次取得鎖，
 * 仍被占用回固定的 helper_unavailable。接手時開資料庫、清掃失敗照拋（dispatch 回 internal_error，下次再試）。
 */
export function resolveServices(
  op: BridgeOperation,
  services: HelperServices,
): HelperServices | BridgeFailure {
  const gate = gates.get(services);
  if (!gate) return services;
  if (gate.full) return gate.full;
  if (!needsStorage(op)) return services;
  gate.full = gate.retry();
  return gate.full ?? dataDirInUse();
}
