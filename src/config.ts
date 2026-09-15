export const DEFAULT_DURATION_SECONDS = 120;
export const MIN_DURATION_SECONDS = 10;
export const MAX_DURATION_SECONDS = 3600;

export const COMMAND_NAME = 'rotacion';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];

  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

export type CommandConfig = {
  discordToken: string;
  applicationId: string;
  guildId: string | null;
};

export type ServerConfig = CommandConfig & {
  port: number;
  discordPublicKey: string;
  projectId: string;
  tasksLocation: string;
  tasksQueue: string;
  /** The service's own public URL; Cloud Tasks calls back to `${serviceUrl}/close`. */
  serviceUrl: string;
};

/** Registering commands needs far less than running the service. */
export function loadCommandConfig(): CommandConfig {
  return {
    discordToken: required('DISCORD_TOKEN'),
    applicationId: required('APPLICATION_ID'),
    guildId: process.env.GUILD_ID?.trim() || null,
  };
}

/**
 * Read lazily rather than at import time, so the tests can import anything without a
 * token in the environment.
 */
export function loadServerConfig(): ServerConfig {
  return {
    ...loadCommandConfig(),
    port: Number.parseInt(optional('PORT', '8080'), 10),
    discordPublicKey: required('DISCORD_PUBLIC_KEY'),
    projectId: optional('GOOGLE_CLOUD_PROJECT', '') || required('GCP_PROJECT'),
    tasksLocation: optional('TASKS_LOCATION', 'us-east1'),
    tasksQueue: optional('TASKS_QUEUE', 'lilibot-close'),
    serviceUrl: required('SERVICE_URL').replace(/\/+$/, ''),
  };
}
