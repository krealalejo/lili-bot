import type { Message, ReactionCollector } from 'discord.js';

/**
 * What survives between rounds, per channel. `benched` is the list of users who sat out
 * the last round: they are the ones holding immunity for the next one.
 */
export type RotationState = {
  benched: string[];
  lastRoundAt: string;
};

/** Outcome of a single draw. `benched` becomes the next round's immune list. */
export type RoundResult = {
  playing: string[];
  benched: string[];
};

/** A sign-up that is currently open. Lives in memory only and dies with the process. */
export type ActivePool = {
  channelId: string;
  hostId: string;
  note: string | null;
  message: Message;
  collector: ReactionCollector;
  participants: Set<string>;
  closesAt: number;
  timer: NodeJS.Timeout;
  refreshTimer: NodeJS.Timeout | null;
  closed: boolean;
};
