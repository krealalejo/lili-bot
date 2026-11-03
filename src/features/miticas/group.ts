import { shuffle } from '../../core/random.ts';

export const ROLES = ['tank', 'healer', 'dps'] as const;

export type Role = (typeof ROLES)[number];

export type Signup = {
  id: string;
  roles: Role[];
};

export const SLOTS: readonly Role[] = ['tank', 'healer', 'dps', 'dps', 'dps'];

export const GROUP_SIZE = SLOTS.length;

export type Seat = {
  role: Role;
  id: string | null;
};

export type GroupResult = {
  seats: Seat[];
  playing: string[];
  benched: string[];
  missing: Role[];
};

function place(
  id: string,
  rolesOf: ReadonlyMap<string, readonly Role[]>,
  holders: (string | null)[],
  visited: boolean[],
): boolean {
  const roles = rolesOf.get(id) ?? [];

  for (let slot = 0; slot < SLOTS.length; slot += 1) {
    if (visited[slot] || !roles.includes(SLOTS[slot])) {
      continue;
    }

    visited[slot] = true;
    const holder = holders[slot];
    if (holder === null || place(holder, rolesOf, holders, visited)) {
      holders[slot] = id;

      return true;
    }
  }

  return false;
}

export function resolveGroup(
  participants: readonly Signup[],
  priority: ReadonlySet<string>,
): GroupResult {
  const rolesOf = new Map(participants.map((signup) => [signup.id, signup.roles]));
  const ids = participants.map((signup) => signup.id);
  const order = [
    ...shuffle(ids.filter((id) => priority.has(id))),
    ...shuffle(ids.filter((id) => !priority.has(id))),
  ];

  const holders: (string | null)[] = SLOTS.map(() => null);
  for (const id of order) {
    place(id, rolesOf, holders, SLOTS.map(() => false));
  }

  const seated = new Set(holders.filter((id): id is string => id !== null));

  return {
    seats: SLOTS.map((role, slot) => ({ role, id: holders[slot] })),
    playing: holders.filter((id): id is string => id !== null),
    benched: ids.filter((id) => !seated.has(id)),
    missing: SLOTS.filter((_, slot) => holders[slot] === null),
  };
}
