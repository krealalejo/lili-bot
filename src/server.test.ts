import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { CallbackType, CustomId, InteractionType } from './discord/constants.ts';
import { createApp, type AppDeps, type HttpRequest } from './server.ts';
import { createMemoryStore } from './state/memory.ts';
import type { MessagePayload } from './discord/rest.ts';
import type { CloseTaskPayload } from './gcp/tasks.ts';

const CHANNEL = 'channel-1';
const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

let publicKeyHex: string;
let signPayload: (timestamp: string, body: string) => Promise<string>;

beforeAll(async () => {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as unknown as webcrypto.CryptoKeyPair;

  publicKeyHex = toHex(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  signPayload = async (timestamp, body) =>
    toHex(
      await webcrypto.subtle.sign(
        { name: 'Ed25519' },
        pair.privateKey,
        new TextEncoder().encode(timestamp + body),
      ),
    );
});

type Sent = { channelId: string; payload: MessagePayload };

function harness() {
  const created: Sent[] = [];
  const edited: (Sent & { messageId: string })[] = [];
  const scheduled: { payload: CloseTaskPayload; at: number }[] = [];
  let clock = 1_000_000;
  let secretCounter = 0;
  let messageCounter = 0;

  const deps: AppDeps = {
    publicKeyHex,
    commandName: 'rotacion',
    store: createMemoryStore(),
    now: () => clock,
    randomSecret: () => `secret-${(secretCounter += 1)}`,
    discord: {
      async createMessage(channelId, payload) {
        created.push({ channelId, payload });
        messageCounter += 1;

        return { id: `msg-${messageCounter}` };
      },
      async editMessage(channelId, messageId, payload) {
        edited.push({ channelId, messageId, payload });
      },
    },
    tasks: {
      async scheduleClose(payload, at) {
        scheduled.push({ payload, at });
      },
    },
  };

  const app = createApp(deps);

  async function post(path: string, body: unknown, sign = true) {
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(clock / 1_000));
    const headers: HttpRequest['headers'] = sign
      ? {
          'x-signature-ed25519': await signPayload(timestamp, rawBody),
          'x-signature-timestamp': timestamp,
        }
      : {};

    return app({ method: 'POST', path, headers, rawBody });
  }

  const user = (id: string) => ({ user: { id, username: `user${id}` } });

  return {
    deps,
    app,
    post,
    created,
    edited,
    scheduled,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    openRotation: (duracion = 120) =>
      post('/interactions', {
        type: InteractionType.ApplicationCommand,
        channel_id: CHANNEL,
        member: user('host'),
        data: { name: 'rotacion', options: [{ name: 'duracion', type: 4, value: duracion }] },
      }),
    click: (customId: string, userId: string) =>
      post('/interactions', {
        type: InteractionType.MessageComponent,
        channel_id: CHANNEL,
        member: user(userId),
        data: { custom_id: customId },
      }),
  };
}

describe('signature gate', () => {
  it('answers a signed PING with a PONG', async () => {
    const h = harness();
    const response = await h.post('/interactions', { type: InteractionType.Ping });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: CallbackType.Pong });
  });

  it('rejects an unsigned request with 401 and never reaches a handler', async () => {
    const h = harness();
    const response = await h.post('/interactions', { type: InteractionType.Ping }, false);

    expect(response.status).toBe(401);
    expect(h.created).toHaveLength(0);
  });

  it('rejects a body that was altered after signing', async () => {
    const h = harness();
    const rawBody = JSON.stringify({ type: InteractionType.Ping });
    const timestamp = '1700000000';

    const response = await h.app({
      method: 'POST',
      path: '/interactions',
      headers: {
        'x-signature-ed25519': await signPayload(timestamp, rawBody),
        'x-signature-timestamp': timestamp,
      },
      rawBody: JSON.stringify({ type: InteractionType.ApplicationCommand }),
    });

    expect(response.status).toBe(401);
  });

  it('serves health checks without a signature', async () => {
    const h = harness();

    expect(
      await h.app({ method: 'GET', path: '/healthz', headers: {}, rawBody: '' }),
    ).toEqual({ status: 200, body: { ok: true } });
  });
});

describe('opening a convocatoria', () => {
  it('posts the sign-up message and schedules its auto-close', async () => {
    const h = harness();
    const response = await h.openRotation(300);

    expect(response.status).toBe(200);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]?.channelId).toBe(CHANNEL);
    expect(h.scheduled).toEqual([
      { payload: { channelId: CHANNEL, closeSecret: 'secret-1' }, at: h.now() + 300_000 },
    ]);
  });

  it('refuses a second convocatoria while one is open', async () => {
    const h = harness();
    await h.openRotation();
    const second = await h.openRotation();

    expect(JSON.stringify(second.body)).toContain('Ya hay una convocatoria abierta');
    expect(h.scheduled).toHaveLength(1);
  });

  it('allows a new one once the previous has expired', async () => {
    const h = harness();
    await h.openRotation(60);
    h.advance(61_000);

    await h.openRotation(60);

    expect(h.created).toHaveLength(2);
  });
});

describe('joining', () => {
  it('counts a person once however many times they click', async () => {
    const h = harness();
    await h.openRotation();

    for (let i = 0; i < 4; i += 1) {
      await h.click(CustomId.Join, 'a');
    }

    const doc = await h.deps.store.read(CHANNEL);
    expect(doc.pool?.participants).toEqual(['a']);
  });

  it('lets someone leave and rejoin', async () => {
    const h = harness();
    await h.openRotation();
    await h.click(CustomId.Join, 'a');
    await h.click(CustomId.Join, 'b');
    await h.click(CustomId.Leave, 'a');

    expect((await h.deps.store.read(CHANNEL)).pool?.participants).toEqual(['b']);

    await h.click(CustomId.Join, 'a');
    expect((await h.deps.store.read(CHANNEL)).pool?.participants).toEqual(['b', 'a']);
  });

  it('refreshes the sign-up message in the interaction response', async () => {
    const h = harness();
    await h.openRotation();
    const response = await h.click(CustomId.Join, 'a');

    expect((response.body as { type: number }).type).toBe(CallbackType.UpdateMessage);
    expect(JSON.stringify(response.body)).toContain('Apuntados (1)');
  });

  it('tells a latecomer the convocatoria is closed', async () => {
    const h = harness();
    await h.openRotation(60);
    h.advance(61_000);

    expect(JSON.stringify((await h.click(CustomId.Join, 'a')).body)).toContain('ya está cerrada');
  });
});

describe('closing and rotating', () => {
  const joinAll = async (h: ReturnType<typeof harness>, ids: string[]) => {
    for (const id of ids) {
      await h.click(CustomId.Join, id);
    }
  };

  it('lets everybody play when five or fewer signed up', async () => {
    const h = harness();
    await h.openRotation();
    await joinAll(h, ['a', 'b', 'c']);
    await h.click(CustomId.Close, 'a');

    const result = JSON.stringify(h.created.at(-1)?.payload);
    expect(result).toContain('Jugáis todos');
    expect((await h.deps.store.read(CHANNEL)).immune).toEqual([]);
  });

  it('seats five and nominates the excess', async () => {
    const h = harness();
    await h.openRotation();
    await joinAll(h, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    await h.click(CustomId.Close, 'a');

    const doc = await h.deps.store.read(CHANNEL);
    expect(doc.pool).toBeNull();
    expect(doc.immune).toHaveLength(2);
    expect(JSON.stringify(h.created.at(-1)?.payload)).toContain('Nominados (2)');
  });

  it('never nominates the same people twice in a row', async () => {
    const h = harness();
    const everyone = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    await h.openRotation();
    await joinAll(h, everyone);
    await h.click(CustomId.Close, 'a');
    const firstNominees = (await h.deps.store.read(CHANNEL)).immune;

    await h.openRotation();
    await joinAll(h, everyone);
    await h.click(CustomId.Close, 'a');
    const secondNominees = (await h.deps.store.read(CHANNEL)).immune;

    expect(firstNominees).toHaveLength(2);
    expect(secondNominees).toHaveLength(2);
    for (const id of firstNominees) {
      expect(secondNominees).not.toContain(id);
    }
  });

  it('is idempotent: a second close changes nothing', async () => {
    const h = harness();
    await h.openRotation();
    await joinAll(h, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    await h.click(CustomId.Close, 'a');
    const after = h.created.length;

    const again = await h.click(CustomId.Close, 'b');

    expect(JSON.stringify(again.body)).toContain('ya está cerrada');
    expect(h.created).toHaveLength(after);
  });

  it('does not wipe immunity when nobody signed up', async () => {
    const h = harness();
    await h.openRotation();
    await joinAll(h, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    await h.click(CustomId.Close, 'a');
    const owed = (await h.deps.store.read(CHANNEL)).immune;

    await h.openRotation();
    await h.click(CustomId.Close, 'a');

    expect((await h.deps.store.read(CHANNEL)).immune).toEqual(owed);
  });
});

describe('the scheduled close', () => {
  it('closes the convocatoria and announces it', async () => {
    const h = harness();
    await h.openRotation(60);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      await h.click(CustomId.Join, id);
    }

    const task = h.scheduled[0];
    const response = await h.app({
      method: 'POST',
      path: '/close',
      headers: {},
      rawBody: JSON.stringify(task?.payload),
    });

    expect(response).toEqual({ status: 200, body: { closed: true } });
    expect(h.edited.at(-1)?.payload.embeds).toBeDefined();
    expect(JSON.stringify(h.created.at(-1)?.payload)).toContain('Nominados (2)');
  });

  it('ignores a task whose secret does not match', async () => {
    const h = harness();
    await h.openRotation(60);

    const response = await h.app({
      method: 'POST',
      path: '/close',
      headers: {},
      rawBody: JSON.stringify({ channelId: CHANNEL, closeSecret: 'wrong' }),
    });

    expect(response).toEqual({ status: 200, body: { skipped: true } });
    expect((await h.deps.store.read(CHANNEL)).pool).not.toBeNull();
  });

  it('no-ops when the button already closed it', async () => {
    const h = harness();
    await h.openRotation(60);
    await h.click(CustomId.Join, 'a');
    const task = h.scheduled[0];
    await h.click(CustomId.Close, 'a');
    const after = h.created.length;

    const response = await h.app({
      method: 'POST',
      path: '/close',
      headers: {},
      rawBody: JSON.stringify(task?.payload),
    });

    expect(response).toEqual({ status: 200, body: { skipped: true } });
    expect(h.created).toHaveLength(after);
  });
});
