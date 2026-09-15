import type { Feature } from '../core/registry.ts';
import type { AppDeps } from '../deps.ts';
import { rotationFeature } from './rotation/index.ts';

/**
 * Every feature the bot has. Adding one is a new folder beside `rotation/` and one entry
 * in this list — `server.ts`, `index.ts` and `deploy-commands.ts` stay untouched.
 */
export const features: Feature<AppDeps>[] = [rotationFeature];
