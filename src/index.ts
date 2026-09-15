import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { COMMAND_NAME, loadServerConfig } from './config.ts';
import { createDiscordRest } from './discord/rest.ts';
import { createMetadataTokenSource } from './gcp/auth.ts';
import { createFirestore } from './gcp/firestore.ts';
import { createCloudTasks } from './gcp/tasks.ts';
import { createApp, type HttpRequest } from './server.ts';
import { createStore } from './state/rotations.ts';

/** Discord interaction payloads are small; anything larger is not ours. */
const MAX_BODY_BYTES = 256 * 1024;

const config = loadServerConfig();
const getToken = createMetadataTokenSource();

const app = createApp({
  publicKeyHex: config.discordPublicKey,
  commandName: COMMAND_NAME,
  store: createStore(createFirestore(config.projectId, getToken)),
  tasks: createCloudTasks(
    {
      projectId: config.projectId,
      location: config.tasksLocation,
      queue: config.tasksQueue,
      targetUrl: `${config.serviceUrl}/close`,
    },
    getToken,
  ),
  discord: createDiscordRest(config.discordToken),
  now: () => Date.now(),
  randomSecret: () => randomBytes(16).toString('hex'),
});

/**
 * The body must be read as raw bytes: Discord signs exactly what it sent, so
 * reserialising parsed JSON would break every signature.
 */
function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        request.destroy();

        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function headersOf(request: IncomingMessage): HttpRequest['headers'] {
  const headers: HttpRequest['headers'] = {};
  for (const [name, value] of Object.entries(request.headers)) {
    headers[name] = Array.isArray(value) ? value[0] : value;
  }

  return headers;
}

const server = createServer((request, response) => {
  void (async () => {
    try {
      const rawBody = await readBody(request);
      if (rawBody === null) {
        response.writeHead(413, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'payload too large' }));

        return;
      }

      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const result = await app({
        method: request.method ?? 'GET',
        path,
        headers: headersOf(request),
        rawBody,
      });

      response.writeHead(result.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result.body ?? {}));
    } catch (error) {
      console.error('[server] request failed', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'internal error' }));
    }
  })();
});

server.listen(config.port, () => {
  console.log(`[server] escuchando en :${config.port}`);
});

// Cloud Run sends SIGTERM before reclaiming an idle instance.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
