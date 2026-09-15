import type { ActivePool } from './types.ts';

/**
 * Sign-ups that are open right now, one per channel. Deliberately not persisted: if the
 * bot restarts mid-convocatoria the pool is gone, but the rotation memory is not.
 */
const pools = new Map<string, ActivePool>();

export function getPool(channelId: string): ActivePool | undefined {
  return pools.get(channelId);
}

export function hasPool(channelId: string): boolean {
  return pools.has(channelId);
}

export function setPool(pool: ActivePool): void {
  pools.set(pool.channelId, pool);
}

export function deletePool(channelId: string): void {
  pools.delete(channelId);
}
