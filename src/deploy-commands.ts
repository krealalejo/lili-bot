import {
  COMMAND_NAME,
  loadCommandConfig,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  DEFAULT_DURATION_SECONDS,
} from './config.ts';

const API_BASE = 'https://discord.com/api/v10';

// Option types: 3 = STRING, 4 = INTEGER. Context 0 = GUILD.
const command = {
  name: COMMAND_NAME,
  type: 1,
  description: 'Abre una convocatoria: pulsa Apuntarme para entrar en el sorteo',
  contexts: [0],
  options: [
    {
      name: 'duracion',
      type: 4,
      description: `Segundos que sigue abierta (por defecto ${DEFAULT_DURATION_SECONDS})`,
      required: false,
      min_value: MIN_DURATION_SECONDS,
      max_value: MAX_DURATION_SECONDS,
    },
    {
      name: 'nota',
      type: 3,
      description: 'Texto extra para la convocatoria',
      required: false,
      max_length: 200,
    },
  ],
};

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
  body: JSON.stringify([command]),
});

if (!response.ok) {
  console.error(`[deploy] falló con ${response.status}: ${await response.text()}`);
  process.exit(1);
}

console.log(
  config.guildId
    ? `[deploy] /${COMMAND_NAME} registrado en el servidor ${config.guildId}`
    : `[deploy] /${COMMAND_NAME} registrado globalmente (tarda en propagarse)`,
);
