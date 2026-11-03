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
import { CLOSE_JOB } from './close.ts';
import type { MiticasDeps } from './deps.ts';
import { isOpen } from './pool.ts';
import { closedMessage, signupMessage } from './render.ts';

export const COMMAND_NAME = 'miticas';

const OPTION = {
  duration: 'duracion',
  note: 'nota',
} as const;

const NOTE_MAX_LENGTH = 200;

export const definition: CommandDefinition = {
  name: COMMAND_NAME,
  type: CommandType.ChatInput,
  description: 'Abre una convocatoria de míticas: elige tank, healer o DPS para entrar en el grupo',
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

export async function handleMiticas(
  interaction: Interaction,
  deps: MiticasDeps,
): Promise<InteractionResponse> {
  const channelId = interaction.channel_id;
  const actor = actorOf(interaction);

  if (channelId === undefined || actor === null) {
    return ephemeral('Este comando solo funciona dentro de un canal de un servidor.');
  }

  const existing = await deps.miticasStore.read(channelId);
  if (isOpen(existing.pool, deps.now())) {
    return ephemeral('Ya hay unas míticas abiertas en este canal. Ciérralas antes de abrir otras.');
  }

  const rawDuration = optionValue(interaction, OPTION.duration);
  const duration = clamp(typeof rawDuration === 'number' ? rawDuration : DEFAULT_DURATION_SECONDS);
  const rawNote = optionValue(interaction, OPTION.note);
  const note = typeof rawNote === 'string' && rawNote.length > 0 ? rawNote : null;

  const closesAt = deps.now() + duration * 1_000;
  const priority = new Set(existing.priority);

  const message = await deps.discord.createMessage(
    channelId,
    signupMessage({ participants: [], note, closesAt, priority }),
  );

  const closeSecret = deps.randomSecret();
  const written = await deps.miticasStore.update(channelId, (doc) => {
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
    await deps.discord
      .editMessage(channelId, message.id, closedMessage(0, 'Convocatoria duplicada'))
      .catch(() => undefined);

    return ephemeral('Ya hay unas míticas abiertas en este canal.');
  }

  await deps.tasks.scheduleClose({ job: CLOSE_JOB, channelId, closeSecret }, closesAt);

  return ephemeral('Míticas abiertas 👇');
}

export const miticasCommand: CommandModule<MiticasDeps> = {
  definition,
  handle: handleMiticas,
};
