const API_BASE = 'https://discord.com/api/v10';
const TIMEOUT_MS = 5_000;

export type MessagePayload = {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  flags?: number;
};

/**
 * The slice of Discord's REST API this bot needs, behind an interface so the handlers can
 * be tested against a fake. Plain fetch: discord.js is a gateway library and this bot has
 * no gateway, so carrying it would only cost cold-start time.
 */
export type DiscordRest = {
  createMessage(channelId: string, payload: MessagePayload): Promise<{ id: string }>;
  editMessage(channelId: string, messageId: string, payload: MessagePayload): Promise<void>;
};

export function createDiscordRest(botToken: string): DiscordRest {
  async function request(path: string, method: string, payload: MessagePayload): Promise<unknown> {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        // Never logged, never echoed: only ever sent here.
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Discord ${method} ${path} failed: ${response.status} ${detail.slice(0, 300)}`);
    }

    return response.json();
  }

  return {
    async createMessage(channelId, payload) {
      const message = (await request(`/channels/${channelId}/messages`, 'POST', payload)) as {
        id: string;
      };

      return { id: message.id };
    },

    async editMessage(channelId, messageId, payload) {
      await request(`/channels/${channelId}/messages/${messageId}`, 'PATCH', payload);
    },
  };
}
