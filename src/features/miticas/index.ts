import type { Feature } from '../../core/registry.ts';
import { handleButton } from './buttons.ts';
import { CLOSE_JOB, handleScheduledClose } from './close.ts';
import { miticasCommand } from './command.ts';
import type { MiticasDeps } from './deps.ts';
import { CUSTOM_ID_PREFIX } from './ids.ts';

export const miticasFeature: Feature<MiticasDeps> = {
  name: 'miticas',
  commands: [miticasCommand],
  components: [{ prefix: CUSTOM_ID_PREFIX, handle: handleButton }],
  jobs: [{ name: CLOSE_JOB, handle: handleScheduledClose }],
};

export { createMiticasStore } from './state.ts';
export type { MiticasDeps } from './deps.ts';
