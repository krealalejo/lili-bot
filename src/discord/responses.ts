import { CallbackType, MessageFlags } from './constants.ts';
import type { MessagePayload } from './rest.ts';
import type { InteractionResponse } from '../types.ts';

/** Only the person who clicked sees this. Used for every error and acknowledgement. */
export function ephemeral(content: string): InteractionResponse {
  return {
    type: CallbackType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral },
  };
}

/** Edits the message the button lives on, as the response itself — saves a REST round trip. */
export function updateMessage(payload: MessagePayload): InteractionResponse {
  return { type: CallbackType.UpdateMessage, data: payload as Record<string, unknown> };
}

export function pong(): InteractionResponse {
  return { type: CallbackType.Pong };
}
