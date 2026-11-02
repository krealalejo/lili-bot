import { CallbackType, CommandType, InteractionContext } from '../../discord/constants.ts';
import type { CommandDefinition, InteractionResponse } from '../../discord/types.ts';
import type { CommandModule } from '../../core/registry.ts';

export const COMMAND_NAME = 'gragussy';

export const IMAGE_URL = 'https://storage.googleapis.com/lilibot-513513-public/gragussy.png';

export const definition: CommandDefinition = {
  name: COMMAND_NAME,
  type: CommandType.ChatInput,
  description: 'Gragussy',
  contexts: [InteractionContext.Guild],
};

export async function handleGragussy(): Promise<InteractionResponse> {
  return {
    type: CallbackType.ChannelMessageWithSource,
    data: { embeds: [{ image: { url: IMAGE_URL } }] },
  };
}

export const gragussyCommand: CommandModule<unknown> = {
  definition,
  handle: handleGragussy,
};
