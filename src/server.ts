import { timingSafeEqual } from 'node:crypto';
import { InteractionType } from './discord/constants.ts';
import { closedMessage, resultMessage } from './discord/render.ts';
import { ephemeral, pong } from './discord/responses.ts';
import { isSignatureValid } from './discord/verify.ts';
import { handleButton } from './handlers/buttons.ts';
import { commitClose } from './handlers/close.ts';
import { handleRotacion } from './handlers/rotacion.ts';
import type { Deps } from './handlers/deps.ts';
import type { Interaction } from './types.ts';

export type HttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  rawBody: string;
};

export type HttpResponse = {
  status: number;
  body?: unknown;
};

export type AppDeps = Deps & {
  publicKeyHex: string;
  commandName: string;
};

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}

async function handleInteraction(rawBody: string, deps: AppDeps): Promise<HttpResponse> {
  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return { status: 400, body: { error: 'invalid json' } };
  }

  // Discord validates the endpoint by sending a PING before anything else exists.
  if (interaction.type === InteractionType.Ping) {
    return { status: 200, body: pong() };
  }

  try {
    if (interaction.type === InteractionType.ApplicationCommand) {
      if (interaction.data?.name !== deps.commandName) {
        return { status: 200, body: ephemeral('No conozco ese comando.') };
      }

      return { status: 200, body: await handleRotacion(interaction, deps) };
    }

    if (interaction.type === InteractionType.MessageComponent) {
      return { status: 200, body: await handleButton(interaction, deps) };
    }

    return { status: 200, body: ephemeral('No sé qué hacer con eso.') };
  } catch (error) {
    // Anything unhandled still has to produce a reply, or Discord shows
    // "the application did not respond" to the user.
    console.error('[interactions] handler failed', error);

    return { status: 200, body: ephemeral('Algo ha fallado. Inténtalo otra vez.') };
  }
}

/**
 * The delayed auto-close, called back by Cloud Tasks at `closesAt`.
 *
 * The service must accept unauthenticated requests because Discord does not authenticate,
 * so this route cannot lean on IAM. Instead the task carries the single-use secret written
 * into the pool document when it was opened.
 */
async function handleScheduledClose(rawBody: string, deps: AppDeps): Promise<HttpResponse> {
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

export function createApp(deps: AppDeps): (request: HttpRequest) => Promise<HttpResponse> {
  return async function handle(request: HttpRequest): Promise<HttpResponse> {
    if (request.method === 'GET' && request.path === '/healthz') {
      return { status: 200, body: { ok: true } };
    }

    if (request.method !== 'POST') {
      return { status: 404, body: { error: 'not found' } };
    }

    if (request.path === '/interactions') {
      const valid = await isSignatureValid({
        publicKeyHex: deps.publicKeyHex,
        signatureHex: request.headers['x-signature-ed25519'],
        timestamp: request.headers['x-signature-timestamp'],
        rawBody: request.rawBody,
      });

      // Discord requires a 401 here, and checks for it when validating the endpoint.
      if (!valid) {
        return { status: 401, body: { error: 'invalid request signature' } };
      }

      return handleInteraction(request.rawBody, deps);
    }

    if (request.path === '/close') {
      return handleScheduledClose(request.rawBody, deps);
    }

    return { status: 404, body: { error: 'not found' } };
  };
}
