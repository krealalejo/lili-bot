import type { Firestore } from '../gcp/firestore.ts';

/** Two people clicking at the same instant is the realistic case; four attempts is ample. */
const MAX_ATTEMPTS = 4;

export type DocumentStore<T> = {
  read(id: string): Promise<T>;
  /**
   * Read, apply `mutate`, write back — retrying from a fresh read if someone else wrote in
   * between. Returning null from `mutate` means "nothing to do", and writes nothing.
   */
  update(id: string, mutate: (doc: T) => T | null): Promise<T | null>;
};

/**
 * One document per id in one collection, with optimistic concurrency.
 *
 * The valuable part here is the `updateTime` precondition and the bounded retry, and none of
 * it cares what shape the document is. `normalise` is what each feature supplies to turn a
 * missing or older document into something its code can rely on.
 */
export function createDocumentStore<T>(
  firestore: Firestore,
  collection: string,
  normalise: (data: Partial<T> | null) => T,
): DocumentStore<T> {
  return {
    async read(id) {
      const snapshot = await firestore.get<Partial<T>>(collection, id);

      return normalise(snapshot.data);
    },

    async update(id, mutate) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const snapshot = await firestore.get<Partial<T>>(collection, id);
        const next = mutate(normalise(snapshot.data));

        if (next === null) {
          return null;
        }

        const written = await firestore.set(
          collection,
          id,
          next as unknown as Record<string, unknown>,
          snapshot.updateTime,
        );

        if (written) {
          return next;
        }
      }

      throw new Error(`Gave up writing ${collection}/${id} after ${MAX_ATTEMPTS} attempts`);
    },
  };
}
