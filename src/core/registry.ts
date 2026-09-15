import type { CommandDefinition, Interaction, InteractionResponse } from '../discord/types.ts';

/**
 * Generic over the dependency bag so that core knows nothing about what a feature needs.
 * A feature declares what it answers to; the server asks the registry who that is.
 */
export type Handler<D> = (interaction: Interaction, deps: D) => Promise<InteractionResponse>;

export type CommandModule<D> = {
  /** The JSON registered with Discord. Lives beside the handler that reads its options. */
  definition: CommandDefinition;
  handle: Handler<D>;
};

export type ComponentModule<D> = {
  /** The `custom_id` prefix this feature owns, for example `rot:`. */
  prefix: string;
  handle: Handler<D>;
};

export type Feature<D> = {
  name: string;
  commands: CommandModule<D>[];
  components: ComponentModule<D>[];
};

export type Registry<D> = {
  command(name: string | undefined): CommandModule<D> | undefined;
  component(customId: string | undefined): ComponentModule<D> | undefined;
  /** Every command definition, for `deploy-commands.ts` to register. */
  definitions(): CommandDefinition[];
};

/**
 * Clashes throw here, at construction, rather than letting one feature silently shadow
 * another in production. The service builds its registry at boot, so a mistake is a crash
 * on the first deploy instead of a mystery weeks later.
 */
export function createRegistry<D>(features: readonly Feature<D>[]): Registry<D> {
  const commands = new Map<string, CommandModule<D>>();
  const components: ComponentModule<D>[] = [];

  for (const feature of features) {
    for (const command of feature.commands) {
      const { name } = command.definition;
      if (commands.has(name)) {
        throw new Error(`Duplicate command "/${name}" declared by feature "${feature.name}"`);
      }

      commands.set(name, command);
    }

    for (const component of feature.components) {
      if (component.prefix === '') {
        throw new Error(`Feature "${feature.name}" declares an empty component prefix`);
      }

      const clash = components.find(
        (existing) =>
          existing.prefix.startsWith(component.prefix) ||
          component.prefix.startsWith(existing.prefix),
      );
      if (clash !== undefined) {
        throw new Error(
          `Component prefix "${component.prefix}" from "${feature.name}" overlaps "${clash.prefix}"`,
        );
      }

      components.push(component);
    }
  }

  // Longest prefix first keeps resolution predictable even as namespaces grow.
  components.sort((a, b) => b.prefix.length - a.prefix.length);

  return {
    command(name) {
      return name === undefined ? undefined : commands.get(name);
    },

    component(customId) {
      return customId === undefined
        ? undefined
        : components.find((candidate) => customId.startsWith(candidate.prefix));
    },

    definitions() {
      return [...commands.values()].map((command) => command.definition);
    },
  };
}
