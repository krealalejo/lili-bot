import type { DiscordRest } from '../discord/rest.ts';
import type { Store } from '../state/rotations.ts';
import type { Tasks } from '../gcp/tasks.ts';
import type { Interaction, InteractionUser } from '../types.ts';

/**
 * Everything the handlers touch that is not pure, injected rather than imported, so the
 * tests can drive the real handler logic with in-memory fakes and a frozen clock.
 */
export type Deps = {
  store: Store;
  tasks: Tasks;
  discord: DiscordRest;
  now: () => number;
  randomSecret: () => string;
};

export function actorOf(interaction: Interaction): InteractionUser | null {
  return interaction.member?.user ?? interaction.user ?? null;
}

export function displayNameOf(user: InteractionUser): string {
  return user.global_name ?? user.username ?? 'alguien';
}

export function optionValue(interaction: Interaction, name: string): string | number | undefined {
  return interaction.data?.options?.find((option) => option.name === name)?.value;
}
