import { describe, expect, it } from 'vitest';
import { BENCH_PRIORITY_TTL_MS } from '../../config.ts';
import { activePriority, type MiticasDoc } from './state.ts';

describe('activePriority', () => {
  const lastRoundAt = '2026-01-01T20:00:00.000Z';
  const last = Date.parse(lastRoundAt);
  const doc: MiticasDoc = { priority: ['a', 'b'], lastRoundAt, pool: null };

  it('keeps the priority list until four hours have passed', () => {
    expect(activePriority(doc, last + BENCH_PRIORITY_TTL_MS - 1)).toEqual(['a', 'b']);
  });

  it('drops the priority list once four hours have passed', () => {
    expect(activePriority(doc, last + BENCH_PRIORITY_TTL_MS)).toEqual([]);
  });

  it('treats a document without a last round as expired', () => {
    expect(activePriority({ ...doc, lastRoundAt: null }, last)).toEqual([]);
  });
});
