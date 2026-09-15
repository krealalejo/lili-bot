import { createStore, type Store } from './rotations.ts';
import type { Firestore } from '../gcp/firestore.ts';

/**
 * An in-memory Firestore stand-in. Used by the tests to drive the real handlers and the
 * real store logic without a network, and to run the server locally without a GCP project.
 */
export function createMemoryFirestore(): Firestore {
  const documents = new Map<string, { data: Record<string, unknown>; updateTime: string }>();
  let clock = 0;

  const key = (collection: string, id: string): string => `${collection}/${id}`;

  return {
    async get<T>(collection: string, id: string) {
      const stored = documents.get(key(collection, id));

      return stored === undefined
        ? { data: null, updateTime: null }
        : { data: structuredClone(stored.data) as T, updateTime: stored.updateTime };
    },

    async set(collection, id, data, expectedUpdateTime) {
      const stored = documents.get(key(collection, id));
      const actual = stored?.updateTime ?? null;

      // Same optimistic-concurrency contract as the real client.
      if (actual !== expectedUpdateTime) {
        return false;
      }

      clock += 1;
      documents.set(key(collection, id), {
        data: structuredClone(data),
        updateTime: `t${clock}`,
      });

      return true;
    },
  };
}

export function createMemoryStore(): Store {
  return createStore(createMemoryFirestore());
}
