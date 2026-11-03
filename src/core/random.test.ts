import { describe, expect, it } from 'vitest';
import { shuffle } from './random.ts';

const users = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i + 1}`);

describe('shuffle', () => {
  it('keeps every element and does not mutate the input', () => {
    const input = users(8);
    const snapshot = [...input];
    const result = shuffle(input);

    expect(input).toEqual(snapshot);
    expect([...result].sort()).toEqual([...input].sort());
  });
});
