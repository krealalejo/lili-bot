import { timingSafeEqual } from 'node:crypto';
import type { HttpResponse } from '../../core/http.ts';
import type { MiticasDeps } from './deps.ts';
import { resolveGroup, type GroupResult, type Signup } from './group.ts';
import { closedMessage, resultMessage } from './render.ts';
import type { Pool } from './state.ts';

export const CLOSE_JOB = 'miticas';

export type CloseOutcome =
  | { closed: false }
  | {
      closed: true;
      pool: Pool;
      participants: Signup[];
      priority: Set<string>;
      result: GroupResult;
    };

type Resolved = { pool: Pool; priority: Set<string>; result: GroupResult };

export async function commitClose(channelId: string, deps: MiticasDeps): Promise<CloseOutcome> {
  const captured: { value: Resolved | null } = { value: null };

  const written = await deps.miticasStore.update(channelId, (doc) => {
    if (doc.pool === null) {
      return null;
    }

    const priority = new Set(doc.priority);
    const result = resolveGroup(doc.pool.participants, priority);
    captured.value = { pool: doc.pool, priority, result };

    return {
      priority: doc.pool.participants.length > 0 ? result.benched : doc.priority,
      lastRoundAt: new Date(deps.now()).toISOString(),
      pool: null,
    };
  });

  if (written === null || captured.value === null) {
    return { closed: false };
  }

  const { pool, priority, result } = captured.value;

  return { closed: true, pool, participants: pool.participants, priority, result };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}

export async function handleScheduledClose(
  rawBody: string,
  deps: MiticasDeps,
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

  const doc = await deps.miticasStore.read(channelId);

  if (doc.pool === null || !constantTimeEquals(doc.pool.closeSecret, closeSecret)) {
    return { status: 200, body: { skipped: true } };
  }

  const outcome = await commitClose(channelId, deps);
  if (!outcome.closed) {
    return { status: 200, body: { skipped: true } };
  }

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
        priority: outcome.priority,
      }),
    );
  } catch (error) {
    console.error('[miticas] round committed but announcing it failed', error);
  }

  return { status: 200, body: { closed: true } };
}
