import type { Feature } from '../../core/registry.ts';
import { handleButton } from './buttons.ts';
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
};

export { handleScheduledClose } from './close.ts';
export { createRotationStore } from './state.ts';
export type { RotationDeps } from './deps.ts';
