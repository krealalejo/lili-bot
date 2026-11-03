import { ROLES, type Role } from './group.ts';
import type { Pool } from './state.ts';

export function isOpen(pool: Pool | null, now: number): boolean {
  return pool !== null && pool.closesAt > now;
}

export function rolesOf(pool: Pool, userId: string): Role[] {
  return pool.participants.find((signup) => signup.id === userId)?.roles ?? [];
}

export function toggleRole(pool: Pool, userId: string, role: Role): Pool {
  const current = rolesOf(pool, userId);
  const roles = current.includes(role)
    ? current.filter((existing) => existing !== role)
    : ROLES.filter((candidate) => candidate === role || current.includes(candidate));

  if (current.length === 0) {
    return { ...pool, participants: [...pool.participants, { id: userId, roles }] };
  }

  if (roles.length === 0) {
    return leavePool(pool, userId);
  }

  return {
    ...pool,
    participants: pool.participants.map((signup) =>
      signup.id === userId ? { id: userId, roles } : signup,
    ),
  };
}

export function leavePool(pool: Pool, userId: string): Pool {
  if (rolesOf(pool, userId).length === 0) {
    return pool;
  }

  return { ...pool, participants: pool.participants.filter((signup) => signup.id !== userId) };
}
