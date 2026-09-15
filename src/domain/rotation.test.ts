import { describe, expect, it } from 'vitest';
import { GROUP_SIZE, resolveRound, shuffle } from './rotation.ts';

const users = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i + 1}`);
const none = new Set<string>();

describe('shuffle', () => {
  it('keeps every element and does not mutate the input', () => {
    const input = users(8);
    const snapshot = [...input];
    const result = shuffle(input);

    expect(input).toEqual(snapshot);
    expect([...result].sort()).toEqual([...input].sort());
  });
});

describe('resolveRound', () => {
  it('lets everybody play when the group is not full', () => {
    const result = resolveRound(users(3), none);

    expect(result.playing).toHaveLength(3);
    expect(result.benched).toEqual([]);
  });

  it('lets everybody play at exactly the cap', () => {
    const result = resolveRound(users(GROUP_SIZE), none);

    expect(result.playing).toHaveLength(GROUP_SIZE);
    expect(result.benched).toEqual([]);
  });

  it('benches the excess when the group overflows', () => {
    const participants = users(7);
    const result = resolveRound(participants, none);

    expect(result.playing).toHaveLength(GROUP_SIZE);
    expect(result.benched).toHaveLength(2);
    expect([...result.playing, ...result.benched].sort()).toEqual([...participants].sort());
  });

  it('never nominates an immune player', () => {
    const participants = users(7);
    const immune = new Set(['u6', 'u7']);

    for (let run = 0; run < 200; run += 1) {
      const result = resolveRound(participants, immune);

      expect(result.playing).toContain('u6');
      expect(result.playing).toContain('u7');
      expect(result.benched).not.toContain('u6');
      expect(result.benched).not.toContain('u7');
    }
  });

  it('draws the free seats only among the players who were not benched last round', () => {
    const participants = users(7);
    const immune = new Set(['u6', 'u7']);
    const benchedAcrossRuns = new Set<string>();

    for (let run = 0; run < 200; run += 1) {
      for (const id of resolveRound(participants, immune).benched) {
        benchedAcrossRuns.add(id);
      }
    }

    expect([...benchedAcrossRuns].sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
  });

  it('draws among the immune when they outnumber the seats, and keeps the leftovers immune', () => {
    const participants = users(12);
    const immune = new Set(['u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12']);
    const result = resolveRound(participants, immune);

    expect(result.playing).toHaveLength(GROUP_SIZE);
    expect(result.playing.every((id) => immune.has(id))).toBe(true);
    expect(result.benched).toHaveLength(7);
    // The two immune players who missed out are back in the next round's immune list.
    expect(result.benched.filter((id) => immune.has(id))).toHaveLength(2);
  });

  it('rotates: this round benched players are seated in the next one', () => {
    const participants = users(7);

    const first = resolveRound(participants, none);
    const second = resolveRound(participants, new Set(first.benched));

    expect(second.benched).not.toContain(first.benched[0]);
    expect(second.benched).not.toContain(first.benched[1]);
    for (const id of first.benched) {
      expect(second.playing).toContain(id);
    }
  });

  it('is stable across an odd number of participants below the cap after a big round', () => {
    const first = resolveRound(users(7), none);
    const second = resolveRound(users(4), new Set(first.benched));

    // Under the cap the immunity list is wiped, which is what clears the debt.
    expect(second.benched).toEqual([]);
  });
});
