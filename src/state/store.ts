import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { STATE_FILE } from '../config.ts';
import type { RotationState } from '../types.ts';

type StateFile = {
  channels: Record<string, RotationState>;
};

/**
 * The rotation memory. One entry per channel, holding the users benched in that
 * channel's last round. The file on disk is only a mirror of this Map.
 */
const channels = new Map<string, RotationState>();

/** Read the mirror back at boot. A missing or broken file simply means "no memory yet". */
export async function load(): Promise<void> {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StateFile;

    channels.clear();
    for (const [channelId, state] of Object.entries(parsed.channels ?? {})) {
      if (Array.isArray(state?.benched)) {
        channels.set(channelId, { benched: state.benched, lastRoundAt: state.lastRoundAt });
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`[store] ${STATE_FILE} unreadable, starting with an empty rotation memory`, error);
    }
    channels.clear();
  }
}

/**
 * Temp file plus rename, so a crash mid-write cannot leave a half-written state file
 * behind: the rename is atomic on the same filesystem.
 */
async function persist(): Promise<void> {
  const payload: StateFile = { channels: Object.fromEntries(channels) };
  const temporary = `${STATE_FILE}.tmp`;

  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, STATE_FILE);
}

/** Who cannot be nominated in this channel's next round. */
export function getImmune(channelId: string): Set<string> {
  return new Set(channels.get(channelId)?.benched ?? []);
}

/**
 * Close a round: the people benched now become the immune ones next time. An empty
 * list (five players or fewer) therefore wipes the slate, which is intended.
 */
export async function recordRound(channelId: string, benched: readonly string[]): Promise<void> {
  channels.set(channelId, { benched: [...benched], lastRoundAt: new Date().toISOString() });
  await persist();
}
