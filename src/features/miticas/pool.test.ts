import { describe, expect, it } from 'vitest';
import { isOpen, leavePool, rolesOf, toggleRole } from './pool.ts';
import type { Pool } from './state.ts';

const pool = (participants: Pool['participants'] = [], closesAt = 2_000): Pool => ({
  messageId: 'm1',
  hostId: 'host',
  note: null,
  closesAt,
  participants,
  closeSecret: 'secret',
});

describe('isOpen', () => {
  it('is open before the closing time and closed after it', () => {
    expect(isOpen(null, 1_000)).toBe(false);
    expect(isOpen(pool([], 2_000), 1_999)).toBe(true);
    expect(isOpen(pool([], 2_000), 2_000)).toBe(false);
  });
});

describe('toggleRole', () => {
  it('signs a newcomer up with the role they pressed', () => {
    expect(toggleRole(pool(), 'a', 'healer').participants).toEqual([{ id: 'a', roles: ['healer'] }]);
  });

  it('adds further roles in a fixed order', () => {
    let current = toggleRole(pool(), 'a', 'dps');
    current = toggleRole(current, 'a', 'tank');

    expect(rolesOf(current, 'a')).toEqual(['tank', 'dps']);
  });

  it('removes a role pressed a second time', () => {
    let current = toggleRole(pool(), 'a', 'tank');
    current = toggleRole(current, 'a', 'dps');
    current = toggleRole(current, 'a', 'tank');

    expect(rolesOf(current, 'a')).toEqual(['dps']);
  });

  it('takes someone off the list when their last role is removed', () => {
    const current = toggleRole(toggleRole(pool(), 'a', 'tank'), 'a', 'tank');

    expect(current.participants).toEqual([]);
  });

  it('keeps each person in their sign-up position', () => {
    let current = toggleRole(pool(), 'a', 'tank');
    current = toggleRole(current, 'b', 'dps');
    current = toggleRole(current, 'a', 'healer');

    expect(current.participants.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the pool it was given', () => {
    const before = pool([{ id: 'a', roles: ['tank'] }]);
    toggleRole(before, 'a', 'dps');

    expect(before.participants).toEqual([{ id: 'a', roles: ['tank'] }]);
  });
});

describe('leavePool', () => {
  it('removes someone whatever roles they had', () => {
    const before = pool([
      { id: 'a', roles: ['tank', 'dps'] },
      { id: 'b', roles: ['dps'] },
    ]);

    expect(leavePool(before, 'a').participants).toEqual([{ id: 'b', roles: ['dps'] }]);
  });

  it('ignores someone who never joined', () => {
    const before = pool([{ id: 'a', roles: ['tank'] }]);

    expect(leavePool(before, 'z')).toBe(before);
  });
});
