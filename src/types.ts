/** Outcome of a single draw. `benched` becomes the next round's immune list. */
export type RoundResult = {
  playing: string[];
  benched: string[];
};

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
