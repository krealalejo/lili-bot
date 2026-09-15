/**
 * Discord's wire protocol: the shapes that arrive from Discord and the shapes we send back.
 * Nothing here knows what this bot does, which is the point — features depend on these,
 * these depend on nothing.
 */

export type InteractionUser = {
  id: string;
  username?: string;
  global_name?: string | null;
};

export type CommandOption = {
  name: string;
  type: number;
  value?: string | number;
};

export type Interaction = {
  type: number;
  channel_id?: string;
  member?: { user?: InteractionUser };
  user?: InteractionUser;
  data?: {
    name?: string;
    custom_id?: string;
    options?: CommandOption[];
  };
};

export type InteractionResponse = {
  type: number;
  data?: Record<string, unknown>;
};

/** An option as declared when registering a command. Option types live in constants.ts. */
export type CommandOptionDefinition = {
  name: string;
  type: number;
  description: string;
  required?: boolean;
  min_value?: number;
  max_value?: number;
  max_length?: number;
};

/** What `PUT /applications/{id}/commands` expects for one command. */
export type CommandDefinition = {
  name: string;
  type: number;
  description: string;
  contexts?: number[];
  options?: CommandOptionDefinition[];
};
