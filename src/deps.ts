import type { MiticasDeps } from './features/miticas/index.ts';
import type { RotationDeps } from './features/rotation/index.ts';

/**
 * What the running application provides: the intersection of what every feature asks for.
 * Each handler keeps compiling as features are added because it only declared its own part.
 */
export type AppDeps = RotationDeps & MiticasDeps;
