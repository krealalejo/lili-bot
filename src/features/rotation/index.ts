import type { Feature } from '../../core/registry.ts';
import { handleButton } from './buttons.ts';
import { CLOSE_JOB, handleScheduledClose } from './close.ts';
import { rotacionCommand } from './command.ts';
import type { RotationDeps } from './deps.ts';
import { CUSTOM_ID_PREFIX } from './ids.ts';

/**
 * Everything this feature answers to, in one declaration. Adding a command or a button
 * means adding it here — nothing outside `src/features/rotation/` needs to know.
 */
export const rotationFeature: Feature<RotationDeps> = {
  name: 'rotation',
  commands: [rotacionCommand],
  components: [{ prefix: CUSTOM_ID_PREFIX, handle: handleButton }],
  jobs: [{ name: CLOSE_JOB, handle: handleScheduledClose }],
};

export { CLOSE_JOB } from './close.ts';
export { createRotationStore } from './state.ts';
export type { RotationDeps } from './deps.ts';
