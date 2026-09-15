import { createDocumentStore, type DocumentStore } from '../../core/store.ts';
import type { Firestore } from '../../gcp/firestore.ts';

const COLLECTION = 'rotations';

/** An open convocatoria, as stored in Firestore. */
export type Pool = {
  messageId: string;
  hostId: string;
  note: string | null;
  closesAt: number;
  participants: string[];
  /** Single-use secret proving a close request came from our Cloud Tasks queue. */
  closeSecret: string;
};

/** One document per channel: the rotation memory plus whatever convocatoria is open. */
export type RotationDoc = {
  immune: string[];
  lastRoundAt: string | null;
  pool: Pool | null;
};

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

export type RotationStore = DocumentStore<RotationDoc>;

export function createRotationStore(firestore: Firestore): RotationStore {
  return createDocumentStore<RotationDoc>(firestore, COLLECTION, normalise);
}
