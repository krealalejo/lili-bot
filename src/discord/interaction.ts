import type { Interaction, InteractionUser } from './types.ts';

/** Reading an interaction payload. Generic to Discord, not to any one feature. */

export function actorOf(interaction: Interaction): InteractionUser | null {
  return interaction.member?.user ?? interaction.user ?? null;
}

export function displayNameOf(user: InteractionUser): string {
  return user.global_name ?? user.username ?? 'alguien';
}

export function optionValue(interaction: Interaction, name: string): string | number | undefined {
  return interaction.data?.options?.find((option) => option.name === name)?.value;
}
