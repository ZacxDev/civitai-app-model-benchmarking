// The pure DRAFT ↔ SUBMIT layer (docs/matchups.md §4). These cover the shapes
// the App writes to and reads back from the per-viewer KV, the pointer rewrite
// that survives a submit, and the quota formatter whose whole job is to report
// the HOST's ceilings rather than a hard-coded 50 MB.

import { describe, expect, it } from 'vitest';

import type { DraftPointer, DraftUnsubmitted, ModelConfig } from '../types.js';
import {
  buildDraft,
  DRAFT_PREFIX,
  draftKey,
  draftToInput,
  formatBytes,
  formatQuota,
  isSubmitted,
  newDraftLocalId,
  parseDraft,
  sortDrafts,
  submittedPointer,
} from './drafts.js';

const cfg = (id: string): ModelConfig => ({
  id,
  checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
  loras: [],
});

describe('draft keys live under the app-chosen prefix', () => {
  it('prefixes every draft key, so list({prefix}) narrows to drafts only', () => {
    expect(DRAFT_PREFIX).toBe('draft:v1:');
    expect(draftKey('abc')).toBe('draft:v1:abc');
    expect(draftKey(newDraftLocalId()).startsWith(DRAFT_PREFIX)).toBe(true);
  });

  it('mints a distinct local id per draft', () => {
    expect(newDraftLocalId()).not.toBe(newDraftLocalId());
  });
});

describe('buildDraft', () => {
  it('stores the whole editable matchup, trimmed, with a timestamp', () => {
    const d = buildDraft(
      'l1',
      { name: '  Realism showdown  ', description: '  two setups  ', configs: [cfg('c1')] },
      new Date('2026-08-30T12:00:00.000Z'),
    );
    expect(d).toEqual({
      v: 1,
      localId: 'l1',
      name: 'Realism showdown',
      description: 'two setups',
      configs: [cfg('c1')],
      updatedAt: '2026-08-30T12:00:00.000Z',
    });
    expect(isSubmitted(d)).toBe(false);
  });

  it('round-trips through draftToInput so the form re-opens on the same content', () => {
    const input = { name: 'A', description: 'B', configs: [cfg('c1'), cfg('c2')] };
    expect(draftToInput(buildDraft('l1', input))).toEqual(input);
  });

  it('copies the config list rather than aliasing the caller’s array', () => {
    const configs = [cfg('c1')];
    const d = buildDraft('l1', { name: 'A', description: '', configs });
    configs[0].label = 'mutated after the save';
    expect(d.configs[0].label).toBeUndefined();
  });
});

describe('submittedPointer — what the draft becomes after submit (spec §4)', () => {
  it('keeps the draft as a pointer carrying the host-minted shared key', () => {
    const p = submittedPointer('l1', 'shared_9', new Date('2026-08-30T12:00:00.000Z'));
    expect(p).toEqual({
      v: 1,
      localId: 'l1',
      sharedKey: 'shared_9',
      submittedAt: '2026-08-30T12:00:00.000Z',
    });
    expect(isSubmitted(p)).toBe(true);
  });

  it('drops the editable body — the public row is the single source of truth once live', () => {
    const p = submittedPointer('l1', 'shared_9') as DraftPointer & Partial<DraftUnsubmitted>;
    expect(p.name).toBeUndefined();
    expect(p.configs).toBeUndefined();
  });
});

describe('parseDraft — defensive read of the per-viewer store', () => {
  it('parses an unsubmitted draft', () => {
    const stored = buildDraft('l1', { name: 'A', description: 'B', configs: [cfg('c1')] });
    expect(parseDraft(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('parses a pointer, and the pointer WINS over any stale body left beside it', () => {
    const parsed = parseDraft({
      v: 1,
      localId: 'l1',
      sharedKey: 'shared_9',
      submittedAt: 'ts',
      name: 'stale',
      configs: [cfg('c1')],
    });
    expect(parsed).toEqual({ v: 1, localId: 'l1', sharedKey: 'shared_9', submittedAt: 'ts' });
    expect(isSubmitted(parsed!)).toBe(true);
  });

  it('drops junk rather than crashing the list', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('nope')).toBeNull();
    expect(parseDraft({})).toBeNull();
    // Unknown schema version.
    expect(parseDraft({ v: 2, localId: 'l1', configs: [cfg('c1')] })).toBeNull();
    // No local id.
    expect(parseDraft({ v: 1, configs: [cfg('c1')] })).toBeNull();
    // An unsubmitted draft with no usable config is not editable or submittable.
    expect(parseDraft({ v: 1, localId: 'l1', name: 'A', configs: [] })).toBeNull();
    expect(parseDraft({ v: 1, localId: 'l1', name: 'A', configs: [{ id: 'c1' }] })).toBeNull();
  });

  it('tolerates missing optional text on an otherwise usable draft', () => {
    expect(parseDraft({ v: 1, localId: 'l1', configs: [cfg('c1')] })).toEqual({
      v: 1,
      localId: 'l1',
      name: '',
      description: '',
      configs: [cfg('c1')],
      updatedAt: '',
    });
  });
});

describe('sortDrafts', () => {
  it('orders newest-touched first and breaks ties on localId (deterministic)', () => {
    const a = buildDraft('a', { name: 'a', description: '', configs: [cfg('c')] }, new Date(1000));
    const b = buildDraft('b', { name: 'b', description: '', configs: [cfg('c')] }, new Date(3000));
    const c = buildDraft('c', { name: 'c', description: '', configs: [cfg('c')] }, new Date(3000));
    expect(sortDrafts([a, c, b]).map((d) => d.localId)).toEqual(['b', 'c', 'a']);
    expect(sortDrafts([c, b, a]).map((d) => d.localId)).toEqual(['b', 'c', 'a']);
  });
});

describe('formatBytes', () => {
  it('renders each magnitude in the unit a person reads', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1024 * 64)).toBe('64 KB');
    expect(formatBytes(1024 * 1024 * 3)).toBe('3.0 MB');
    expect(formatBytes(1024 * 1024 * 48)).toBe('48 MB');
  });

  it('refuses to invent a number for a nonsense input', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatQuota — acceptance criterion 6', () => {
  it('reports the HOST’s ceilings, not a hard-coded 50 MB / 1M rows', () => {
    // Deliberately unlike the documented defaults: a formatter that hard-coded
    // them could not produce this string.
    const line = formatQuota({
      usedBytes: 1024 * 1024 * 3,
      rowCount: 12,
      limitBytes: 1024 * 1024 * 12,
      limitRows: 4321,
    })!;
    expect(line).toContain('3.0 MB');
    expect(line).toContain('12 MB');
    expect(line).toContain('4,321');
    expect(line).not.toContain('50 MB');
    expect(line).not.toContain('1,000,000');
  });

  it('renders nothing at all until the host has answered', () => {
    expect(formatQuota(null)).toBeNull();
  });
});
