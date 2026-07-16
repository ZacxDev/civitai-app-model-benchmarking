import { describe, expect, it } from 'vitest';
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';

import { isTerminalSnapshot, mapSnapshotStatus, pollToTerminal } from './workflow.js';

const immediate = () => Promise.resolve();

describe('mapSnapshotStatus', () => {
  it('maps host statuses to cell-run statuses', () => {
    expect(mapSnapshotStatus('pending')).toBe('submitting');
    expect(mapSnapshotStatus('processing')).toBe('processing');
    expect(mapSnapshotStatus('succeeded')).toBe('succeeded');
    expect(mapSnapshotStatus('failed')).toBe('failed');
    expect(mapSnapshotStatus('expired')).toBe('failed');
    expect(mapSnapshotStatus('canceled')).toBe('canceled');
  });
});

describe('isTerminalSnapshot', () => {
  it('recognises terminal states', () => {
    expect(isTerminalSnapshot('succeeded')).toBe(true);
    expect(isTerminalSnapshot('failed')).toBe(true);
    expect(isTerminalSnapshot('processing')).toBe(false);
    expect(isTerminalSnapshot('pending')).toBe(false);
  });
});

describe('pollToTerminal', () => {
  it('polls until succeeded', async () => {
    const seq: BlockWorkflowSnapshot[] = [
      { workflowId: 'w', status: 'processing' },
      { workflowId: 'w', status: 'processing' },
      { workflowId: 'w', status: 'succeeded', imageUrls: ['u'] },
    ];
    let i = 0;
    const poll = async () => seq[i++];
    const terminal = await pollToTerminal(poll, { workflowId: 'w', status: 'pending' }, { sleep: immediate, delayMs: 0, maxDelayMs: 0 });
    expect(terminal.status).toBe('succeeded');
  });

  it('returns the last non-terminal snapshot when the poll cap trips', async () => {
    const poll = async (): Promise<BlockWorkflowSnapshot> => ({ workflowId: 'w', status: 'processing' });
    const terminal = await pollToTerminal(poll, { workflowId: 'w', status: 'pending' }, { sleep: immediate, delayMs: 0, maxDelayMs: 0, maxPolls: 3 });
    expect(isTerminalSnapshot(terminal.status)).toBe(false);
    expect(terminal.workflowId).toBe('w');
  });

  it('returns immediately when the first snapshot is already terminal', async () => {
    let called = 0;
    const poll = async (): Promise<BlockWorkflowSnapshot> => {
      called += 1;
      return { workflowId: 'w', status: 'processing' };
    };
    const terminal = await pollToTerminal(poll, { workflowId: 'w', status: 'succeeded' }, { sleep: immediate });
    expect(terminal.status).toBe('succeeded');
    expect(called).toBe(0);
  });
});
