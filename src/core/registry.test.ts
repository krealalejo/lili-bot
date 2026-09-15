import { describe, expect, it } from 'vitest';
import { createRegistry, type Feature } from './registry.ts';
import type { InteractionResponse } from '../discord/types.ts';

type NoDeps = Record<string, never>;

const reply = (content: string) => async (): Promise<InteractionResponse> => ({
  type: 4,
  data: { content },
});

const feature = (
  name: string,
  commandName: string,
  prefix: string,
): Feature<NoDeps> => ({
  name,
  commands: [
    {
      definition: { name: commandName, type: 1, description: `the ${commandName} command` },
      handle: reply(`${name}:command`),
    },
  ],
  components: [{ prefix, handle: reply(`${name}:component`) }],
});

const noDeps: NoDeps = {};

describe('createRegistry', () => {
  it('routes a command to the feature that declared it', async () => {
    const registry = createRegistry([feature('rotation', 'rotacion', 'rot:')]);
    const command = registry.command('rotacion');

    expect(await command?.handle({ type: 2 }, noDeps)).toEqual({
      type: 4,
      data: { content: 'rotation:command' },
    });
  });

  it('routes a component by custom_id prefix', async () => {
    const registry = createRegistry([feature('rotation', 'rotacion', 'rot:')]);

    expect(await registry.component('rot:join')?.handle({ type: 3 }, noDeps)).toEqual({
      type: 4,
      data: { content: 'rotation:component' },
    });
  });

  it('returns nothing for names and ids it does not know', () => {
    const registry = createRegistry([feature('rotation', 'rotacion', 'rot:')]);

    expect(registry.command('stats')).toBeUndefined();
    expect(registry.command(undefined)).toBeUndefined();
    expect(registry.component('stats:refresh')).toBeUndefined();
    expect(registry.component(undefined)).toBeUndefined();
  });

  it('collects every definition for registration', () => {
    const registry = createRegistry([
      feature('rotation', 'rotacion', 'rot:'),
      feature('stats', 'stats', 'stats:'),
    ]);

    expect(registry.definitions().map((d) => d.name)).toEqual(['rotacion', 'stats']);
  });

  it('refuses two features claiming the same command', () => {
    expect(() =>
      createRegistry([feature('a', 'rotacion', 'a:'), feature('b', 'rotacion', 'b:')]),
    ).toThrow(/Duplicate command "\/rotacion"/);
  });

  it('refuses overlapping component prefixes', () => {
    expect(() =>
      createRegistry([feature('a', 'one', 'rot:'), feature('b', 'two', 'rot:extra:')]),
    ).toThrow(/overlaps/);
  });

  it('refuses an empty prefix, which would swallow everything', () => {
    expect(() => createRegistry([feature('a', 'one', '')])).toThrow(/empty component prefix/);
  });
});
