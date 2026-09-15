import { resolveRound } from '../domain/rotation.ts';
import type { Deps } from './deps.ts';
import type { Pool, RoundResult } from '../types.ts';

export type CloseOutcome =
  | { closed: false }
  | {
      closed: true;
      pool: Pool;
      participants: string[];
      immune: Set<string>;
      result: RoundResult;
    };

/**
 * Resolves the round and commits it to Firestore, without touching Discord — the caller
 * renders the outcome, because closing from a button can piggyback on the interaction
 * response while the Cloud Tasks callback has to edit the message over REST.
 *
 * Committing before announcing is deliberate: the document is the source of truth and
 * closing it first is what stops a button press and the scheduled task both resolving
 * the same convocatoria.
 */
type Resolved = { pool: Pool; immune: Set<string>; result: RoundResult };

export async function commitClose(channelId: string, deps: Deps): Promise<CloseOutcome> {
  // Held in an object rather than a bare `let`: the callback runs inside the store call,
  // which is exactly the shape TypeScript cannot narrow through.
  const captured: { value: Resolved | null } = { value: null };

  const written = await deps.store.update(channelId, (doc) => {
    if (doc.pool === null) {
      return null;
    }

    const immune = new Set(doc.immune);
    const result = resolveRound(doc.pool.participants, immune);
    captured.value = { pool: doc.pool, immune, result };

    return {
      // An empty convocatoria must not wipe the immunity list: nobody played, so nobody
      // has paid their turn off.
      immune: doc.pool.participants.length > 0 ? result.benched : doc.immune,
      lastRoundAt: new Date(deps.now()).toISOString(),
      pool: null,
    };
  });

  if (written === null || captured.value === null) {
    return { closed: false };
  }

  const { pool, immune, result } = captured.value;

  return { closed: true, pool, participants: pool.participants, immune, result };
}
