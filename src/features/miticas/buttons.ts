import { actorOf, displayNameOf } from '../../discord/interaction.ts';
import { ephemeral, updateMessage } from '../../discord/responses.ts';
import type { Interaction, InteractionResponse } from '../../discord/types.ts';
import { commitClose } from './close.ts';
import type { MiticasDeps } from './deps.ts';
import { CustomId, ROLE_BY_CUSTOM_ID } from './ids.ts';
import { isOpen, leavePool, toggleRole } from './pool.ts';
import { activePriority } from './state.ts';
import { closedMessage, resultMessage, signupMessage } from './render.ts';

const ALREADY_CLOSED = 'Esas míticas ya están cerradas.';

export async function handleButton(
  interaction: Interaction,
  deps: MiticasDeps,
): Promise<InteractionResponse> {
  const channelId = interaction.channel_id;
  const actor = actorOf(interaction);
  const customId = interaction.data?.custom_id;

  if (channelId === undefined || actor === null || customId === undefined) {
    return ephemeral('No he podido identificar la convocatoria.');
  }

  if (customId === CustomId.Close) {
    const outcome = await commitClose(channelId, deps);
    if (!outcome.closed) {
      return ephemeral(ALREADY_CLOSED);
    }

    await deps.discord.createMessage(
      channelId,
      resultMessage({
        result: outcome.result,
        participants: outcome.participants,
        priority: outcome.priority,
      }),
    );

    return updateMessage(
      closedMessage(outcome.participants.length, `Cerrada por ${displayNameOf(actor)}`),
    );
  }

  const role = Object.hasOwn(ROLE_BY_CUSTOM_ID, customId) ? ROLE_BY_CUSTOM_ID[customId] : undefined;
  if (role === undefined && customId !== CustomId.Leave) {
    return ephemeral('No reconozco ese botón.');
  }

  const updated = await deps.miticasStore.update(channelId, (doc) => {
    if (!isOpen(doc.pool, deps.now()) || doc.pool === null) {
      return null;
    }

    const pool =
      role === undefined ? leavePool(doc.pool, actor.id) : toggleRole(doc.pool, actor.id, role);

    return { ...doc, pool };
  });

  if (updated === null || updated.pool === null) {
    return ephemeral(ALREADY_CLOSED);
  }

  return updateMessage(
    signupMessage({
      participants: updated.pool.participants,
      note: updated.pool.note,
      closesAt: updated.pool.closesAt,
      priority: new Set(activePriority(updated, deps.now())),
    }),
  );
}
