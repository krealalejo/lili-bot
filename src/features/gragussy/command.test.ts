import { describe, expect, it } from 'vitest';
import { createRegistry } from '../../core/registry.ts';
import { features } from '../index.ts';
import { IMAGE_URL } from './command.ts';

describe('/gragussy', () => {
  it('replies in the channel with the image as an embed', async () => {
    const command = createRegistry(features).command('gragussy');

    expect(await command?.handle({ type: 2 }, {} as never)).toEqual({
      type: 4,
      data: { embeds: [{ image: { url: IMAGE_URL } }] },
    });
  });

  it('is registered alongside /rotacion', () => {
    const names = createRegistry(features)
      .definitions()
      .map((definition) => definition.name);

    expect(names).toEqual(expect.arrayContaining(['rotacion', 'gragussy']));
  });
});
