import type { HttpRequest, HttpResponse } from './core/http.ts';
import type { Registry } from './core/registry.ts';
import type { AppDeps } from './deps.ts';
import { InteractionType } from './discord/constants.ts';
import { ephemeral, pong } from './discord/responses.ts';
import type { Interaction } from './discord/types.ts';
import { isSignatureValid } from './discord/verify.ts';
import { CLOSE_JOB as LEGACY_CLOSE_JOB } from './features/rotation/index.ts';

export type { HttpRequest, HttpResponse } from './core/http.ts';

export type ServerDeps = AppDeps & {
  publicKeyHex: string;
  registry: Registry<AppDeps>;
};

async function handleInteraction(rawBody: string, deps: ServerDeps): Promise<HttpResponse> {
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
      const command = deps.registry.command(interaction.data?.name);

      return command === undefined
        ? { status: 200, body: ephemeral('No conozco ese comando.') }
        : { status: 200, body: await command.handle(interaction, deps) };
    }

    if (interaction.type === InteractionType.MessageComponent) {
      const component = deps.registry.component(interaction.data?.custom_id);

      return component === undefined
        ? { status: 200, body: ephemeral('No reconozco ese botón.') }
        : { status: 200, body: await component.handle(interaction, deps) };
    }

    return { status: 200, body: ephemeral('No sé qué hacer con eso.') };
  } catch (error) {
    // Anything unhandled still has to produce a reply, or Discord shows
    // "the application did not respond" to the user.
    console.error('[interactions] handler failed', error);

    return { status: 200, body: ephemeral('Algo ha fallado. Inténtalo otra vez.') };
  }
}

async function handleJob(rawBody: string, deps: ServerDeps): Promise<HttpResponse> {
  let payload: { job?: unknown } | null;
  try {
    payload = JSON.parse(rawBody) as { job?: unknown } | null;
  } catch {
    return { status: 400, body: { error: 'invalid json' } };
  }

  const name = typeof payload?.job === 'string' ? payload.job : LEGACY_CLOSE_JOB;
  const job = deps.registry.job(name);

  if (job === undefined) {
    console.error(`[close] no feature handles job "${name}"`);

    return { status: 200, body: { skipped: true } };
  }

  return job.handle(rawBody, deps);
}

export function createApp(deps: ServerDeps): (request: HttpRequest) => Promise<HttpResponse> {
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
      return handleJob(request.rawBody, deps);
    }

    return { status: 404, body: { error: 'not found' } };
  };
}
