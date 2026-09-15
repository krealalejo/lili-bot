import type { Pool } from './state.ts';

/**
 * Pure membership rules for an open convocatoria. No I/O, no Discord, no Firestore —
 * the handlers read a document, apply one of these, and write it back.
 */

/** A pool that has passed its closing time is no longer open, even if nothing closed it yet. */
export function isOpen(pool: Pool | null, now: number): boolean {
  return pool !== null && pool.closesAt > now;
}

export function hasJoined(pool: Pool, userId: string): boolean {
  return pool.participants.includes(userId);
}

/** Joining twice is a no-op: a person counts once, which is the whole point. */
export function joinPool(pool: Pool, userId: string): Pool {
  if (hasJoined(pool, userId)) {
    return pool;
  }

  return { ...pool, participants: [...pool.participants, userId] };
}

export function leavePool(pool: Pool, userId: string): Pool {
  if (!hasJoined(pool, userId)) {
    return pool;
  }

  return { ...pool, participants: pool.participants.filter((id) => id !== userId) };
}
