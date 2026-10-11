// P1-T058：以 JSON 列保存的 ClaudeVersionStore（helper 接資料區用）。
import { describe, expect, it } from 'vitest';

import { CLAUDE_VERIFIED_VERSION } from './constants.ts';
import {
  ClaudeVersionGate,
  type ClaudeVersionRecord,
  type ClaudeVersionRows,
  jsonClaudeVersionStore,
} from './version-gate.ts';

function memoryRows(initial: string[] = []): ClaudeVersionRows & { rows: string[] } {
  const rows = [...initial];
  return { rows, list: () => [...rows], append: (json) => void rows.push(json) };
}

const verified = (version: string): ClaudeVersionRecord => ({
  version,
  outcome: 'verified',
  verifiedAt: '2026-10-11T00:00:00.000Z',
  cases: [{ id: 'no-tool-calls', passed: true, detail: 'ok' }],
  modelCalls: 3,
});

describe('jsonClaudeVersionStore', () => {
  it('通過重新驗證的版本保存後，新的閘門（模擬重啟）讀回仍接受；ADR-0002 版本永遠接受', async () => {
    const rows = memoryRows();
    const first = new ClaudeVersionGate(jsonClaudeVersionStore(rows));
    expect(await first.load()).toBe(true);
    expect(first.beginReverify('9.9.9')).toBe(true);
    expect(await first.saveProvisional('9.9.9', '2026-10-11T00:00:00.000Z')).toBe(true);
    await first.finishReverify(verified('9.9.9'));
    expect(first.isAccepted('9.9.9')).toBe(true);

    const restarted = new ClaudeVersionGate(jsonClaudeVersionStore(rows));
    expect(await restarted.load()).toBe(true);
    expect(restarted.isAccepted('9.9.9')).toBe(true);
    expect(restarted.isAccepted(CLAUDE_VERIFIED_VERSION)).toBe(true);
    expect(restarted.state.kind).toBe('ready');
    expect(restarted.canReverify).toBe(true);
  });

  it('只有 verified 才接受：只留下暫定失敗紀錄（中途當掉）→ 重啟後不接受且停用', async () => {
    const rows = memoryRows();
    const gate = new ClaudeVersionGate(jsonClaudeVersionStore(rows));
    await gate.load();
    gate.beginReverify('9.9.9');
    await gate.saveProvisional('9.9.9', '2026-10-11T00:00:00.000Z');

    const restarted = new ClaudeVersionGate(jsonClaudeVersionStore(rows));
    expect(await restarted.load()).toBe(true);
    expect(restarted.isAccepted('9.9.9')).toBe(false);
    expect(restarted.isAccepted(CLAUDE_VERIFIED_VERSION)).toBe(true);
    expect(restarted.state.kind).toBe('disabled');
  });

  it('列內容壞掉：讀取失敗，只接受 ADR-0002 版本、不自動重新驗證', async () => {
    const gate = new ClaudeVersionGate(jsonClaudeVersionStore(memoryRows(['{not json'])));
    expect(await gate.load()).toBe(false);
    expect(gate.canReverify).toBe(false);
    expect(gate.isAccepted(CLAUDE_VERIFIED_VERSION)).toBe(true);
    const wrongShape = new ClaudeVersionGate(
      jsonClaudeVersionStore(memoryRows([JSON.stringify({ version: '9.9.9' })])),
    );
    expect(await wrongShape.load()).toBe(false);
    expect(wrongShape.isAccepted('9.9.9')).toBe(false);
  });

  it('寫入失敗：saveProvisional 回 false 並停用（不呼叫模型）', async () => {
    const rows: ClaudeVersionRows = {
      list: () => [],
      append: () => {
        throw new Error('disk full');
      },
    };
    const gate = new ClaudeVersionGate(jsonClaudeVersionStore(rows));
    await gate.load();
    gate.beginReverify('9.9.9');
    expect(await gate.saveProvisional('9.9.9', '2026-10-11T00:00:00.000Z')).toBe(false);
    expect(gate.state.kind).toBe('disabled');
  });
});
