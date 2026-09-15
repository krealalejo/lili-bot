import {
  DEFAULT_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
} from '../../config.ts';
import { CommandOptionType, CommandType, InteractionContext } from '../../discord/constants.ts';
import { actorOf, optionValue } from '../../discord/interaction.ts';
import { ephemeral } from '../../discord/responses.ts';
import type { CommandDefinition, Interaction, InteractionResponse } from '../../discord/types.ts';
import type { CommandModule } from '../../core/registry.ts';
import type { RotationDeps } from './deps.ts';
import { isOpen } from './pool.ts';
import { closedMessage, signupMessage } from './render.ts';

export const COMMAND_NAME = 'rotacion';

/**
 * Option names written once. The definition below and the handler further down are the
 * only two readers, so they cannot drift apart the way two files could.
 */
const OPTION = {
  duration: 'duracion',
  note: 'nota',
} as const;

const NOTE_MAX_LENGTH = 200;

export const definition: CommandDefinition = {
  name: COMMAND_NAME,
  type: CommandType.ChatInput,
  description: 'Abre una convocatoria: pulsa Apuntarme para entrar en el sorteo',
  contexts: [InteractionContext.Guild],
  options: [
    {
      name: OPTION.duration,
      type: CommandOptionType.Integer,
      description: `Segundos que sigue abierta (por defecto ${DEFAULT_DURATION_SECONDS})`,
      required: false,
      min_value: MIN_DURATION_SECONDS,
      max_value: MAX_DURATION_SECONDS,
    },
    {
      name: OPTION.note,
      type: CommandOptionType.String,
      description: 'Texto extra para la convocatoria',
      required: false,
      max_length: NOTE_MAX_LENGTH,
    },
  ],
};

const clamp = (seconds: number): number =>
  Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.trunc(seconds)));

/**
 * Opening a convocatoria, in the order the platform forces:
 *
 * The bot posts the message itself rather than replying with it, because the message id is
 * needed in the document and only `POST /channels/{id}/messages` returns it. It also means
 * the close path edits with the bot token, so a convocatoria can outlive the 15-minute
 * interaction token. Everything happens before responding: Cloud Run only guarantees CPU
 * while a request is in flight.
 */
export async function handleRotacion(
  interaction: Interaction,
  deps: RotationDeps,
): Promise<InteractionResponse> {
  const channelId = interaction.channel_id;
  const actor = actorOf(interaction);

  if (channelId === undefined || actor === null) {
    return ephemeral('Este comando solo funciona dentro de un canal de un servidor.');
  }

  const existing = await deps.store.read(channelId);
  if (isOpen(existing.pool, deps.now())) {
    return ephemeral('Ya hay una convocatoria abierta en este canal. Ciérrala antes de abrir otra.');
  }

  const rawDuration = optionValue(interaction, OPTION.duration);
  const duration = clamp(typeof rawDuration === 'number' ? rawDuration : DEFAULT_DURATION_SECONDS);
  const rawNote = optionValue(interaction, OPTION.note);
  const note = typeof rawNote === 'string' && rawNote.length > 0 ? rawNote : null;

  const closesAt = deps.now() + duration * 1_000;
  const immune = new Set(existing.immune);

  const message = await deps.discord.createMessage(
    channelId,
    signupMessage({ participants: [], note, closesAt, immune }),
  );

  const closeSecret = deps.randomSecret();
  const written = await deps.store.update(channelId, (doc) => {
    // Somebody opened one between our read and our write.
    if (isOpen(doc.pool, deps.now())) {
      return null;
    }

    return {
      ...doc,
      pool: {
        messageId: message.id,
        hostId: actor.id,
        note,
        closesAt,
        participants: [],
        closeSecret,
      },
    };
  });

  if (written === null) {
    // Lost the race: retract the message we just posted so no orphan is left behind.
    await deps.discord
      .editMessage(channelId, message.id, closedMessage(0, 'Convocatoria duplicada'))
      .catch(() => undefined);

    return ephemeral('Ya hay una convocatoria abierta en este canal.');
  }

  await deps.tasks.scheduleClose({ channelId, closeSecret }, closesAt);

  return ephemeral('Convocatoria abierta 👇');
}

export const rotacionCommand: CommandModule<RotationDeps> = {
  definition,
  handle: handleRotacion,
};
