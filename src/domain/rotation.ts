import type { RoundResult } from '../types.ts';

/** Hard cap of the game: five people per match, no exceptions. */
export const GROUP_SIZE = 5;

/** Fisher-Yates on a copy, so the caller's array is never mutated. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The whole business rule, kept free of discord.js so it can be tested on its own.
 *
 * `immune` is whoever was benched in the previous round of this channel. They have a
 * guaranteed seat and can never be nominated.
 */
export function resolveRound(participants: readonly string[], immune: ReadonlySet<string>): RoundResult {
  // Nobody is left out: everybody plays and the immunity list is cleared.
  if (participants.length <= GROUP_SIZE) {
    return { playing: [...participants], benched: [] };
  }

  const immuneNow = participants.filter((id) => immune.has(id));
  const challengers = participants.filter((id) => !immune.has(id));

  // More people are owed a seat than there are seats. Draw among them, and whoever
  // misses out stays benched *and* keeps immunity for the round after this one.
  if (immuneNow.length >= GROUP_SIZE) {
    const playing = shuffle(immuneNow).slice(0, GROUP_SIZE);
    const seated = new Set(playing);
    return { playing, benched: participants.filter((id) => !seated.has(id)) };
  }

  // Normal case: the immune are seated automatically and the remaining seats are
  // drawn at random among the people who did play last time.
  const shuffled = shuffle(challengers);
  const freeSeats = GROUP_SIZE - immuneNow.length;

  return {
    playing: [...immuneNow, ...shuffled.slice(0, freeSeats)],
    benched: shuffled.slice(freeSeats),
  };
}
