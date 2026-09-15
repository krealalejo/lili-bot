import { describe, expect, it } from 'vitest';
import { createDocumentStore } from './store.ts';
import { createMemoryFirestore } from './memory.ts';

type Counter = { hits: number; label: string };

const normalise = (data: Partial<Counter> | null): Counter => ({
  hits: typeof data?.hits === 'number' ? data.hits : 0,
  label: typeof data?.label === 'string' ? data.label : '',
});

describe('createDocumentStore', () => {
  it('works for a document shape that has nothing to do with rotations', async () => {
    const store = createDocumentStore<Counter>(createMemoryFirestore(), 'counters', normalise);

    expect(await store.read('a')).toEqual({ hits: 0, label: '' });

    await store.update('a', (doc) => ({ ...doc, hits: doc.hits + 1, label: 'first' }));
    await store.update('a', (doc) => ({ ...doc, hits: doc.hits + 1 }));

    expect(await store.read('a')).toEqual({ hits: 2, label: 'first' });
  });

  it('keeps collections apart', async () => {
    const firestore = createMemoryFirestore();
    const counters = createDocumentStore<Counter>(firestore, 'counters', normalise);
    const others = createDocumentStore<Counter>(firestore, 'others', normalise);

    await counters.update('same-id', (doc) => ({ ...doc, hits: 10 }));

    expect((await others.read('same-id')).hits).toBe(0);
    expect((await counters.read('same-id')).hits).toBe(10);
  });

  it('names the collection it gave up on', async () => {
    const stubborn = {
      async get() {
        return { data: null, updateTime: null };
      },
      async set() {
        return false;
      },
    };

    await expect(
      createDocumentStore<Counter>(stubborn, 'counters', normalise).update('a', (d) => d),
    ).rejects.toThrow('Gave up writing counters/a');
  });
});
