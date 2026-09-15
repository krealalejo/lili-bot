import { actorOf, displayNameOf } from '../../discord/interaction.ts';
import { ephemeral, updateMessage } from '../../discord/responses.ts';
import type { Interaction, InteractionResponse } from '../../discord/types.ts';
import { commitClose } from './close.ts';
import type { RotationDeps } from './deps.ts';
import { CustomId } from './ids.ts';
import { isOpen, joinPool, leavePool } from './pool.ts';
import { closedMessage, resultMessage, signupMessage } from './render.ts';

const ALREADY_CLOSED = 'Esa convocatoria ya está cerrada.';

export async function handleButton(
  interaction: Interaction,
  deps: RotationDeps,
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
        immune: outcome.immune,
      }),
    );

    // The convocatoria message is edited by the response itself, one round trip saved.
    return updateMessage(
      closedMessage(outcome.participants.length, `Cerrada por ${displayNameOf(actor)}`),
    );
  }

  // Anything that is not one of ours must not fall through to a membership change:
  // an unrecognised id used to be treated as "leave".
  if (customId !== CustomId.Join && customId !== CustomId.Leave) {
    return ephemeral('No reconozco ese botón.');
  }

  const updated = await deps.store.update(channelId, (doc) => {
    if (!isOpen(doc.pool, deps.now()) || doc.pool === null) {
      return null;
    }

    const pool =
      customId === CustomId.Join ? joinPool(doc.pool, actor.id) : leavePool(doc.pool, actor.id);

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
      immune: new Set(updated.immune),
    }),
  );
}
