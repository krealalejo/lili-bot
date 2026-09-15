import type { TokenSource } from './auth.ts';

const API_BASE = 'https://cloudtasks.googleapis.com/v2';
const TIMEOUT_MS = 5_000;

export type CloseTaskPayload = {
  channelId: string;
  closeSecret: string;
};

export type Tasks = {
  scheduleClose(payload: CloseTaskPayload, at: number): Promise<void>;
};

export type TasksConfig = {
  projectId: string;
  location: string;
  queue: string;
  /** The service's own /close endpoint. */
  targetUrl: string;
};

/**
 * A scaled-to-zero service has no timers, so the delayed close is a Cloud Tasks task that
 * calls us back at `closesAt`. Pure so the payload shape can be asserted in a test.
 */
export function buildCloseTask(config: TasksConfig, payload: CloseTaskPayload, at: number): unknown {
  return {
    task: {
      scheduleTime: new Date(at).toISOString(),
      httpRequest: {
        url: config.targetUrl,
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
      },
    },
  };
}

export function createCloudTasks(config: TasksConfig, getToken: TokenSource): Tasks {
  const url = `${API_BASE}/projects/${config.projectId}/locations/${config.location}/queues/${config.queue}/tasks`;

  return {
    async scheduleClose(payload, at) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildCloseTask(config, payload, at)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Cloud Tasks create failed: ${response.status} ${detail.slice(0, 300)}`);
      }
    },
  };
}
