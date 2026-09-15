export const DEFAULT_DURATION_SECONDS = 120;
export const MIN_DURATION_SECONDS = 10;
export const MAX_DURATION_SECONDS = 3600;

export const STATE_FILE = process.env.STATE_FILE ?? 'data/state.json';

export type BotConfig = {
  token: string;
  clientId: string;
  guildId: string | null;
};

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * Read lazily rather than at import time, so unit tests can import the rest of the
 * codebase without a token in the environment.
 */
export function loadConfig(): BotConfig {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('CLIENT_ID'),
    guildId: process.env.GUILD_ID?.trim() || null,
  };
}
