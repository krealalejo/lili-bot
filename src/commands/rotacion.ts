import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  userMention,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type MessageReaction,
  type User,
} from 'discord.js';
import {
  DEFAULT_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
} from '../config.ts';
import { GROUP_SIZE, resolveRound } from '../domain/rotation.ts';
import { deletePool, getPool, hasPool, setPool } from '../pools.ts';
import { getImmune, recordRound } from '../state/store.ts';
import type { ActivePool, RoundResult } from '../types.ts';

export const CLOSE_BUTTON_ID = 'rotacion:cerrar';

const REFRESH_DELAY_MS = 1500;
const OPEN_COLOR = 0x5865f2;
const RESULT_COLOR = 0x57f287;
const CLOSED_COLOR = 0x4f545c;

export const rotacionCommand = new SlashCommandBuilder()
  .setName('rotacion')
  .setDescription('Abre una convocatoria: reacciona con cualquier emoji para apuntarte')
  .setContexts(InteractionContextType.Guild)
  .addIntegerOption((option) =>
    option
      .setName('duracion')
      .setDescription(`Segundos que la convocatoria sigue abierta (por defecto ${DEFAULT_DURATION_SECONDS})`)
      .setMinValue(MIN_DURATION_SECONDS)
      .setMaxValue(MAX_DURATION_SECONDS),
  )
  .addStringOption((option) =>
    option.setName('nota').setDescription('Texto extra para la convocatoria').setMaxLength(200),
  );

function closeRow(disabled: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_BUTTON_ID)
      .setLabel(disabled ? 'Convocatoria cerrada' : 'Cerrar convocatoria')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function listMentions(ids: readonly string[]): string {
  return ids.length === 0 ? '—' : ids.map((id) => userMention(id)).join('\n');
}

/**
 * The authoritative head count. The collector keeps the live counter cheap, but every
 * decision is taken from a fresh read of the message: it survives events lost while the
 * bot was down and reactions added before the collector was attached.
 *
 * A user is counted once no matter how many emojis they used, because they land in a Set.
 */
async function collectParticipants(message: Message): Promise<Set<string>> {
  const fresh = await message.fetch();
  const participants = new Set<string>();

  for (const reaction of fresh.reactions.cache.values()) {
    const users = await reaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot) {
        participants.add(user.id);
      }
    }
  }

  return participants;
}

type SignupView = {
  participants: readonly string[];
  note: string | null;
  closesAt: number;
};

function signupEmbed(view: SignupView, immune: ReadonlySet<string>): EmbedBuilder {
  const signed = [...view.participants];
  const embed = new EmbedBuilder()
    .setColor(OPEN_COLOR)
    .setTitle('🎮 Convocatoria abierta')
    .setDescription(
      [
        'Reacciona con **cualquier emoji** para apuntarte.',
        `Da igual cuántos pongas: cada persona cuenta una sola vez. Caben ${GROUP_SIZE}.`,
        view.note ? `\n> ${view.note}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .addFields(
      { name: `Apuntados (${signed.length})`, value: listMentions(signed) },
      { name: 'Se cierra', value: `<t:${Math.floor(view.closesAt / 1000)}:R>` },
    );

  if (immune.size > 0) {
    embed.addFields({
      name: 'Con plaza asegurada (se quedaron fuera la ronda pasada)',
      value: listMentions([...immune]),
    });
  }

  return embed;
}

function toView(pool: ActivePool): SignupView {
  return { participants: [...pool.participants], note: pool.note, closesAt: pool.closesAt };
}

/**
 * Trailing-edge debounce: a burst of reactions produces a single message edit instead of
 * one per emoji, which is what keeps this away from Discord's rate limits.
 */
function scheduleRefresh(pool: ActivePool): void {
  if (pool.closed || pool.refreshTimer !== null) {
    return;
  }

  pool.refreshTimer = setTimeout(() => {
    pool.refreshTimer = null;
    if (pool.closed) {
      return;
    }

    void pool.message
      .edit({ embeds: [signupEmbed(toView(pool), getImmune(pool.channelId))], components: [closeRow(false)] })
      .catch((error: unknown) => console.warn('[rotacion] no se pudo refrescar el mensaje', error));
  }, REFRESH_DELAY_MS);
}

function resultEmbed(
  result: RoundResult,
  participants: readonly string[],
  immune: ReadonlySet<string>,
): EmbedBuilder {
  if (participants.length === 0) {
    return new EmbedBuilder()
      .setColor(CLOSED_COLOR)
      .setTitle('Convocatoria vacía')
      .setDescription('No se apuntó nadie, así que la rotación se queda como estaba.');
  }

  if (result.benched.length === 0) {
    return new EmbedBuilder()
      .setColor(RESULT_COLOR)
      .setTitle('✅ Jugáis todos, no hay rotación')
      .setDescription(`Sois ${participants.length}, caben ${GROUP_SIZE}.`)
      .addFields({ name: 'Equipo', value: listMentions(result.playing) });
  }

  const seatedByImmunity = result.playing.filter((id) => immune.has(id));
  const embed = new EmbedBuilder()
    .setColor(RESULT_COLOR)
    .setTitle('🎲 Rotación resuelta')
    .setDescription(`Sois ${participants.length} y caben ${GROUP_SIZE}: se quedan fuera ${result.benched.length}.`)
    .addFields(
      { name: `Juegan (${result.playing.length})`, value: listMentions(result.playing) },
      { name: `Nominados (${result.benched.length})`, value: listMentions(result.benched) },
    )
    .setFooter({ text: 'Los nominados tienen plaza asegurada en la próxima convocatoria.' });

  if (seatedByImmunity.length > 0) {
    embed.addFields({
      name: 'Entraron con plaza asegurada',
      value: listMentions(seatedByImmunity),
    });
  }

  return embed;
}

/**
 * Single exit point for a pool, shared by the timer and by the button. The `closed` flag
 * makes it idempotent, so a button press racing the timeout still resolves the round once.
 */
export async function closePool(pool: ActivePool, reason: string): Promise<void> {
  if (pool.closed) {
    return;
  }

  pool.closed = true;
  clearTimeout(pool.timer);
  if (pool.refreshTimer !== null) {
    clearTimeout(pool.refreshTimer);
    pool.refreshTimer = null;
  }
  pool.collector.stop(reason);
  deletePool(pool.channelId);

  const participants = [...(await collectParticipants(pool.message))];
  const immune = getImmune(pool.channelId);
  const result = resolveRound(participants, immune);

  // An empty convocatoria must not wipe the immunity list: nobody played, so nobody
  // has paid their turn off.
  if (participants.length > 0) {
    await recordRound(pool.channelId, result.benched);
  }

  const closedEmbed = new EmbedBuilder()
    .setColor(CLOSED_COLOR)
    .setTitle('🔒 Convocatoria cerrada')
    .setDescription(`${reason} · ${participants.length} apuntado(s).`);

  await pool.message.edit({ embeds: [closedEmbed], components: [closeRow(true)] });
  await pool.message.reply({ embeds: [resultEmbed(result, participants, immune)] });
}

export async function handleRotacion(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;

  if (hasPool(channelId)) {
    await interaction.reply({
      content: 'Ya hay una convocatoria abierta en este canal. Ciérrala antes de abrir otra.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const duration = interaction.options.getInteger('duracion') ?? DEFAULT_DURATION_SECONDS;
  const note = interaction.options.getString('nota');
  const immune = getImmune(channelId);
  const closesAt = Date.now() + duration * 1000;

  await interaction.reply({
    embeds: [signupEmbed({ participants: [], note, closesAt }, immune)],
    components: [closeRow(false)],
  });
  const message = await interaction.fetchReply();

  // `dispose: true` is what makes the collector emit `remove`, so somebody can withdraw.
  const collector = message.createReactionCollector({
    filter: (_reaction: MessageReaction, user: User) => !user.bot,
    dispose: true,
  });

  const pool: ActivePool = {
    channelId,
    hostId: interaction.user.id,
    note,
    message,
    collector,
    participants: new Set<string>(),
    closesAt,
    timer: setTimeout(() => {
      void closePool(pool, 'Se acabó el tiempo');
    }, duration * 1000),
    refreshTimer: null,
    closed: false,
  };

  collector.on('collect', (_reaction: MessageReaction, user: User) => {
    pool.participants.add(user.id);
    scheduleRefresh(pool);
  });

  // Removing one emoji is not leaving: a user only drops out once they hold no
  // reaction at all on the message.
  collector.on('remove', (_reaction: MessageReaction, user: User) => {
    void (async () => {
      const current = await collectParticipants(pool.message).catch(() => null);
      if (current !== null && !current.has(user.id)) {
        pool.participants.delete(user.id);
        scheduleRefresh(pool);
      }
    })();
  });

  setPool(pool);

  // A starter reaction so nobody has to think about which emoji to use.
  await message.react('✅').catch(() => undefined);
}

export async function handleCloseButton(interaction: ButtonInteraction): Promise<void> {
  const pool = getPool(interaction.channelId);

  if (pool === undefined || pool.closed) {
    await interaction.reply({
      content: 'Esa convocatoria ya está cerrada.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  await closePool(pool, `Cerrada por ${interaction.user.displayName}`);
}
