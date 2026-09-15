/**
 * Discord's numeric protocol codes. Plain const objects rather than TypeScript enums,
 * because `erasableSyntaxOnly` forbids enums: Node strips the types, it does not compile them.
 */

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
} as const;

export const CallbackType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  DeferredUpdateMessage: 6,
  UpdateMessage: 7,
} as const;

export const ComponentType = {
  ActionRow: 1,
  Button: 2,
} as const;

export const ButtonStyle = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
} as const;

export const MessageFlags = {
  Ephemeral: 64,
} as const;


export const CommandType = {
  ChatInput: 1,
} as const;

export const CommandOptionType = {
  String: 3,
  Integer: 4,
} as const;

export const InteractionContext = {
  Guild: 0,
} as const;
