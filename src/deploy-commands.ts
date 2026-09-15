import { REST, Routes } from 'discord.js';
import { rotacionCommand } from './commands/rotacion.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const rest = new REST().setToken(config.token);

// Guild-scoped commands appear instantly; global ones can take up to an hour to
// propagate. Set GUILD_ID while developing, drop it to publish everywhere.
const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

await rest.put(route, { body: [rotacionCommand.toJSON()] });

console.log(
  config.guildId
    ? `[deploy] /${rotacionCommand.name} registrado en el servidor ${config.guildId}`
    : `[deploy] /${rotacionCommand.name} registrado globalmente (tarda en propagarse)`,
);
