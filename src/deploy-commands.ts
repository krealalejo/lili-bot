import { loadCommandConfig } from './config.ts';
import { createRegistry } from './core/registry.ts';
import { features } from './features/index.ts';

const API_BASE = 'https://discord.com/api/v10';

// Whatever the features declare is what gets registered: there is no second copy of the
// command JSON to drift out of sync with the handlers.
const definitions = createRegistry(features).definitions();
const config = loadCommandConfig();

// Guild-scoped commands appear instantly; global ones take up to an hour to propagate.
const path = config.guildId
  ? `/applications/${config.applicationId}/guilds/${config.guildId}/commands`
  : `/applications/${config.applicationId}/commands`;

const response = await fetch(`${API_BASE}${path}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${config.discordToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(definitions),
});

if (!response.ok) {
  console.error(`[deploy] falló con ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const names = definitions.map((definition) => `/${definition.name}`).join(', ');
console.log(
  config.guildId
    ? `[deploy] ${names} registrado(s) en el servidor ${config.guildId}`
    : `[deploy] ${names} registrado(s) globalmente (tarda en propagarse)`,
);
