import { describe, expect, it } from 'vitest';
import { GROUP_SIZE, ROLES, resolveGroup, SLOTS, type Role, type Signup } from './group.ts';

const none = new Set<string>();
const all: Role[] = ['tank', 'healer', 'dps'];
const signup = (id: string, ...roles: Role[]): Signup => ({ id, roles });

function fits(group: readonly Signup[], taken: boolean[] = SLOTS.map(() => false)): boolean {
  const [first, ...rest] = group;
  if (first === undefined) {
    return true;
  }

  return SLOTS.some((role, slot) => {
    if (taken[slot] || !first.roles.includes(role)) {
      return false;
    }

    const next = [...taken];
    next[slot] = true;

    return fits(rest, next);
  });
}

function best(participants: readonly Signup[], priority: ReadonlySet<string>) {
  let size = 0;
  let prioritised = 0;

  for (let mask = 0; mask < 1 << participants.length; mask += 1) {
    const group = participants.filter((_, i) => (mask >> i) & 1);
    if (group.length > GROUP_SIZE || !fits(group)) {
      continue;
    }

    const owed = group.filter((s) => priority.has(s.id)).length;
    if (group.length > size || (group.length === size && owed > prioritised)) {
      size = group.length;
      prioritised = owed;
    }
  }

  return { size, prioritised };
}

function randomSignups(count: number): Signup[] {
  return Array.from({ length: count }, (_, i) => {
    const roles = ROLES.filter(() => Math.random() < 0.5);

    return signup(`u${i + 1}`, ...(roles.length > 0 ? roles : (['dps'] as Role[])));
  });
}

describe('resolveGroup', () => {
  it('only ever seats people in a role they picked, one per slot', () => {
    for (let run = 0; run < 200; run += 1) {
      const participants = randomSignups(9);
      const rolesOf = new Map(participants.map((s) => [s.id, s.roles]));
      const result = resolveGroup(participants, none);

      expect(result.seats.map((seat) => seat.role)).toEqual(SLOTS);
      for (const seat of result.seats) {
        if (seat.id !== null) {
          expect(rolesOf.get(seat.id)).toContain(seat.role);
        }
      }
      expect(new Set(result.playing).size).toBe(result.playing.length);
      expect([...result.playing, ...result.benched].sort()).toEqual(
        participants.map((s) => s.id).sort(),
      );
    }
  });

  it('fills as many seats as the roles allow, and seats as many prioritised players as possible within that', () => {
    for (let run = 0; run < 200; run += 1) {
      const participants = randomSignups(8);
      const priority = new Set(participants.filter(() => Math.random() < 0.4).map((s) => s.id));
      const result = resolveGroup(participants, priority);
      const expected = best(participants, priority);

      expect(result.playing).toHaveLength(expected.size);
      expect(result.playing.filter((id) => priority.has(id))).toHaveLength(expected.prioritised);
    }
  });

  it('lets everybody play when they fit, and benches nobody', () => {
    const result = resolveGroup(
      [signup('t', 'tank'), signup('h', 'healer'), signup('d1', 'dps'), signup('d2', 'dps')],
      none,
    );

    expect(result.benched).toEqual([]);
    expect(result.missing).toEqual(['dps']);
  });

  it('moves last round’s tank to DPS so the benched tank can tank', () => {
    const participants = [
      signup('ana', 'tank', 'dps'),
      signup('bruno', 'tank'),
      signup('h', 'healer'),
      signup('d1', 'dps'),
      signup('d2', 'dps'),
    ];

    for (let run = 0; run < 50; run += 1) {
      const result = resolveGroup(participants, new Set(['bruno']));

      expect(result.seats[0]).toEqual({ role: 'tank', id: 'bruno' });
      expect(result.seats.filter((seat) => seat.role === 'dps').map((seat) => seat.id)).toContain('ana');
      expect(result.benched).toEqual([]);
    }
  });

  it('benches the previous tank when they cannot play anything else', () => {
    const participants = [
      signup('ana', 'tank'),
      signup('bruno', 'tank'),
      signup('h', 'healer'),
      signup('d1', 'dps'),
    ];

    for (let run = 0; run < 50; run += 1) {
      const result = resolveGroup(participants, new Set(['bruno']));

      expect(result.seats[0]?.id).toBe('bruno');
      expect(result.benched).toEqual(['ana']);
    }
  });

  it('keeps the only healer in even when every prioritised player wants a seat', () => {
    const owed = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const participants = [...owed.map((id) => signup(id, 'tank', 'dps')), signup('carla', 'healer')];

    for (let run = 0; run < 50; run += 1) {
      const result = resolveGroup(participants, new Set(owed));

      expect(result.seats[1]).toEqual({ role: 'healer', id: 'carla' });
      expect(result.playing.filter((id) => owed.includes(id))).toHaveLength(4);
      expect(result.benched).toHaveLength(1);
      expect(owed).toContain(result.benched[0]);
    }
  });

  it('draws among the prioritised when they outnumber the seats', () => {
    const owed = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const participants = [...owed, 'x', 'y'].map((id) => signup(id, ...all));
    const seenBenched = new Set<string>();

    for (let run = 0; run < 200; run += 1) {
      const result = resolveGroup(participants, new Set(owed));

      expect(result.playing.every((id) => owed.includes(id))).toBe(true);
      expect(result.benched).toHaveLength(3);
      for (const id of result.benched.filter((id) => owed.includes(id))) {
        seenBenched.add(id);
      }
    }

    expect([...seenBenched].sort()).toEqual(owed);
  });

  it('reports the roles nobody could fill', () => {
    const result = resolveGroup(
      [signup('a', 'tank', 'dps'), signup('b', 'dps'), signup('c', 'dps'), signup('d', 'dps')],
      none,
    );

    expect(result.missing).toEqual(['healer']);
    expect(result.seats[1]).toEqual({ role: 'healer', id: null });
    expect(result.playing).toHaveLength(4);
  });
});
