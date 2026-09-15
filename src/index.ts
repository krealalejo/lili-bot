import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import {
  CLOSE_BUTTON_ID,
  handleCloseButton,
  handleRotacion,
  rotacionCommand,
} from './commands/rotacion.ts';
import { loadConfig } from './config.ts';
import { load as loadState } from './state/store.ts';

const config = loadConfig();

const client = new Client({
  // GuildMessageReactions is the only non-obvious one: without it no reaction ever
  // reaches the collector. MessageContent is deliberately not requested, the bot
  // never reads what people write.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  // Reactions on a message that is no longer cached arrive partial; without these the
  // events are dropped silently.
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

client.once(Events.ClientReady, (ready) => {
  console.log(`[bot] conectado como ${ready.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === rotacionCommand.name) {
      await handleRotacion(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === CLOSE_BUTTON_ID) {
      await handleCloseButton(interaction);
    }
  } catch (error) {
    console.error('[bot] fallo atendiendo una interacción', error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: 'Algo ha fallado, inténtalo otra vez.', flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }
  }
});

await loadState();
await client.login(config.token);
