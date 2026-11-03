import { createDocumentStore, type DocumentStore } from '../../core/store.ts';
import type { Firestore } from '../../gcp/firestore.ts';
import type { Signup } from './group.ts';

const COLLECTION = 'miticas';

export type Pool = {
  messageId: string;
  hostId: string;
  note: string | null;
  closesAt: number;
  participants: Signup[];
  closeSecret: string;
};

export type MiticasDoc = {
  priority: string[];
  lastRoundAt: string | null;
  pool: Pool | null;
};

export function emptyDoc(): MiticasDoc {
  return { priority: [], lastRoundAt: null, pool: null };
}

export function normalise(data: Partial<MiticasDoc> | null): MiticasDoc {
  if (data === null) {
    return emptyDoc();
  }

  return {
    priority: Array.isArray(data.priority) ? data.priority : [],
    lastRoundAt: typeof data.lastRoundAt === 'string' ? data.lastRoundAt : null,
    pool: data.pool ?? null,
  };
}

export type MiticasStore = DocumentStore<MiticasDoc>;

export function createMiticasStore(firestore: Firestore): MiticasStore {
  return createDocumentStore<MiticasDoc>(firestore, COLLECTION, normalise);
}
