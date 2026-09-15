import { describe, expect, it } from 'vitest';
import { createMemoryFirestore, createMemoryStore } from './memory.ts';
import { createStore, emptyDoc } from './rotations.ts';
import type { Firestore } from '../gcp/firestore.ts';
import type { RotationDoc } from '../types.ts';

describe('rotation store', () => {
  it('reads an empty document for a channel that has never played', async () => {
    const store = createMemoryStore();

    expect(await store.read('new-channel')).toEqual(emptyDoc());
  });

  it('persists what it writes', async () => {
    const store = createMemoryStore();

    await store.update('c1', (doc) => ({ ...doc, immune: ['a', 'b'] }));

    expect((await store.read('c1')).immune).toEqual(['a', 'b']);
  });

  it('writes nothing when the mutation declines', async () => {
    const store = createMemoryStore();
    await store.update('c1', (doc) => ({ ...doc, immune: ['a'] }));

    expect(await store.update('c1', () => null)).toBeNull();
    expect((await store.read('c1')).immune).toEqual(['a']);
  });

  it('retries from a fresh read when another writer got there first', async () => {
    const inner = createMemoryFirestore();
    let sabotaged = false;

    // Simulate a concurrent click: the first write lands on a stale precondition.
    const contended: Firestore = {
      get: inner.get.bind(inner),
      async set(collection, id, data, expected) {
        if (!sabotaged) {
          sabotaged = true;
          await inner.set(collection, id, { immune: ['other'], lastRoundAt: null, pool: null }, expected);

          return false;
        }

        return inner.set(collection, id, data, expected);
      },
    };

    const store = createStore(contended);
    const seen: RotationDoc[] = [];

    const result = await store.update('c1', (doc) => {
      seen.push(doc);

      return { ...doc, immune: [...doc.immune, 'mine'] };
    });

    // The retry saw the other writer's value, so nothing was lost.
    expect(seen).toHaveLength(2);
    expect(result?.immune).toEqual(['other', 'mine']);
  });

  it('gives up rather than spinning forever under permanent contention', async () => {
    const alwaysStale: Firestore = {
      async get() {
        return { data: null, updateTime: null };
      },
      async set() {
        return false;
      },
    };

    await expect(createStore(alwaysStale).update('c1', (doc) => doc)).rejects.toThrow(/Gave up/);
  });
});
