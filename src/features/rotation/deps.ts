import type { DiscordRest } from '../../discord/rest.ts';
import type { Tasks } from '../../gcp/tasks.ts';
import type { RotationStore } from './state.ts';

/**
 * What this feature needs from the outside world. Declared by the feature rather than
 * handed down by the app, so a second feature states its own needs and the application's
 * dependency bag becomes the intersection of them.
 */
export type RotationDeps = {
  store: RotationStore;
  tasks: Tasks;
  discord: DiscordRest;
  now: () => number;
  randomSecret: () => string;
};
