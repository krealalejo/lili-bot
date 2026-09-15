import { createDocumentStore, type DocumentStore } from '../core/store.ts';
import type { Firestore } from '../gcp/firestore.ts';
import type { RotationDoc } from '../types.ts';

const COLLECTION = 'rotations';

export function emptyDoc(): RotationDoc {
  return { immune: [], lastRoundAt: null, pool: null };
}

/** A document written by an older version, or none at all, must still read cleanly. */
export function normalise(data: Partial<RotationDoc> | null): RotationDoc {
  if (data === null) {
    return emptyDoc();
  }

  return {
    immune: Array.isArray(data.immune) ? data.immune : [],
    lastRoundAt: typeof data.lastRoundAt === 'string' ? data.lastRoundAt : null,
    pool: data.pool ?? null,
  };
}

export type Store = DocumentStore<RotationDoc>;

export function createStore(firestore: Firestore): Store {
  return createDocumentStore<RotationDoc>(firestore, COLLECTION, normalise);
}
