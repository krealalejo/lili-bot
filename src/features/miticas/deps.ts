import type { DiscordRest } from '../../discord/rest.ts';
import type { Tasks } from '../../gcp/tasks.ts';
import type { MiticasStore } from './state.ts';

export type MiticasDeps = {
  miticasStore: MiticasStore;
  tasks: Tasks;
  discord: DiscordRest;
  now: () => number;
  randomSecret: () => string;
};
