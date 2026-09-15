import { timingSafeEqual } from 'node:crypto';
import type { HttpResponse } from '../../core/http.ts';
import type { RotationDeps } from './deps.ts';
import { closedMessage, resultMessage } from './render.ts';
import { resolveRound, type RoundResult } from './rotation.ts';
import type { Pool } from './state.ts';

export type CloseOutcome =
  | { closed: false }
  | {
      closed: true;
      pool: Pool;
      participants: string[];
      immune: Set<string>;
      result: RoundResult;
    };

type Resolved = { pool: Pool; immune: Set<string>; result: RoundResult };

/**
 * Resolves the round and commits it to Firestore, without touching Discord — the caller
 * renders the outcome, because closing from a button can piggyback on the interaction
 * response while the Cloud Tasks callback has to edit the message over REST.
 *
 * Committing before announcing is deliberate: the document is the source of truth and
 * closing it first is what stops a button press and the scheduled task both resolving
 * the same convocatoria.
 */
export async function commitClose(channelId: string, deps: RotationDeps): Promise<CloseOutcome> {
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

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The delayed auto-close, called back by Cloud Tasks at `closesAt`.
 *
 * The service must accept unauthenticated requests because Discord does not authenticate,
 * so this route cannot lean on IAM. Instead the task carries the single-use secret written
 * into the pool document when it was opened.
 */
export async function handleScheduledClose(
  rawBody: string,
  deps: RotationDeps,
): Promise<HttpResponse> {
  let payload: { channelId?: string; closeSecret?: string };
  try {
    payload = JSON.parse(rawBody) as { channelId?: string; closeSecret?: string };
  } catch {
    return { status: 400, body: { error: 'invalid json' } };
  }

  const { channelId, closeSecret } = payload;
  if (channelId === undefined || closeSecret === undefined) {
    return { status: 400, body: { error: 'missing fields' } };
  }

  const doc = await deps.store.read(channelId);

  // Closed early by the button, or a stale task: nothing to do, and a 200 stops
  // Cloud Tasks retrying.
  if (doc.pool === null || !constantTimeEquals(doc.pool.closeSecret, closeSecret)) {
    return { status: 200, body: { skipped: true } };
  }

  const outcome = await commitClose(channelId, deps);
  if (!outcome.closed) {
    return { status: 200, body: { skipped: true } };
  }

  // Past this point the round is committed, so failures must not trigger a retry that
  // would find nothing to close and announce nothing.
  try {
    await deps.discord.editMessage(
      channelId,
      outcome.pool.messageId,
      closedMessage(outcome.participants.length, 'Se acabó el tiempo'),
    );
    await deps.discord.createMessage(
      channelId,
      resultMessage({
        result: outcome.result,
        participants: outcome.participants,
        immune: outcome.immune,
      }),
    );
  } catch (error) {
    console.error('[close] round committed but announcing it failed', error);
  }

  return { status: 200, body: { closed: true } };
}
