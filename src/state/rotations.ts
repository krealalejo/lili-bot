import type { Firestore } from '../gcp/firestore.ts';
import type { RotationDoc } from '../types.ts';

const COLLECTION = 'rotations';

/** Two people clicking at the same instant is the realistic case; four attempts is ample. */
const MAX_ATTEMPTS = 4;

export function emptyDoc(): RotationDoc {
  return { immune: [], lastRoundAt: null, pool: null };
}

/** A document written by an older version, or none at all, must still read cleanly. */
function normalise(data: Partial<RotationDoc> | null): RotationDoc {
  if (data === null) {
    return emptyDoc();
  }

  return {
    immune: Array.isArray(data.immune) ? data.immune : [],
    lastRoundAt: typeof data.lastRoundAt === 'string' ? data.lastRoundAt : null,
    pool: data.pool ?? null,
  };
}

export type Store = {
  read(channelId: string): Promise<RotationDoc>;
  /**
   * Read, apply `mutate`, write back — retrying from a fresh read if someone else wrote in
   * between. Returning null from `mutate` means "nothing to do", and writes nothing.
   */
  update(
    channelId: string,
    mutate: (doc: RotationDoc) => RotationDoc | null,
  ): Promise<RotationDoc | null>;
};

export function createStore(firestore: Firestore): Store {
  return {
    async read(channelId) {
      const snapshot = await firestore.get<Partial<RotationDoc>>(COLLECTION, channelId);

      return normalise(snapshot.data);
    },

    async update(channelId, mutate) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const snapshot = await firestore.get<Partial<RotationDoc>>(COLLECTION, channelId);
        const next = mutate(normalise(snapshot.data));

        if (next === null) {
          return null;
        }

        const written = await firestore.set(
          COLLECTION,
          channelId,
          next as unknown as Record<string, unknown>,
          snapshot.updateTime,
        );

        if (written) {
          return next;
        }
      }

      throw new Error(`Gave up writing rotations/${channelId} after ${MAX_ATTEMPTS} attempts`);
    },
  };
}
