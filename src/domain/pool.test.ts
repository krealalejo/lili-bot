import { describe, expect, it } from 'vitest';
import { hasJoined, isOpen, joinPool, leavePool } from './pool.ts';
import type { Pool } from '../types.ts';

const pool = (participants: string[] = [], closesAt = 2_000): Pool => ({
  messageId: 'm1',
  hostId: 'host',
  note: null,
  closesAt,
  participants,
  closeSecret: 'secret',
});

describe('isOpen', () => {
  it('is closed when there is no pool', () => {
    expect(isOpen(null, 1_000)).toBe(false);
  });

  it('is open before the closing time and closed after it', () => {
    expect(isOpen(pool([], 2_000), 1_999)).toBe(true);
    expect(isOpen(pool([], 2_000), 2_000)).toBe(false);
    expect(isOpen(pool([], 2_000), 2_001)).toBe(false);
  });
});

describe('joinPool', () => {
  it('adds a newcomer', () => {
    expect(joinPool(pool(['a']), 'b').participants).toEqual(['a', 'b']);
  });

  it('counts a person once however many times they click', () => {
    let current = pool();
    for (let i = 0; i < 5; i += 1) {
      current = joinPool(current, 'a');
    }

    expect(current.participants).toEqual(['a']);
  });

  it('does not mutate the pool it was given', () => {
    const before = pool(['a']);
    joinPool(before, 'b');

    expect(before.participants).toEqual(['a']);
  });
});

describe('leavePool', () => {
  it('removes someone who had joined', () => {
    expect(leavePool(pool(['a', 'b']), 'a').participants).toEqual(['b']);
  });

  it('ignores someone who never joined', () => {
    const before = pool(['a']);

    expect(leavePool(before, 'z')).toBe(before);
  });

  it('lets a person rejoin after leaving', () => {
    const left = leavePool(pool(['a', 'b']), 'a');

    expect(hasJoined(left, 'a')).toBe(false);
    expect(joinPool(left, 'a').participants).toEqual(['b', 'a']);
  });
});
