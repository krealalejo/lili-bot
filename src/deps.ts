import type { RotationDeps } from './features/rotation/index.ts';

/**
 * What the running application provides. Today it is exactly what the rotation feature
 * asks for; a second feature makes this an intersection of both, and every existing
 * handler keeps working because it only ever declared the part it needed.
 */
export type AppDeps = RotationDeps;
