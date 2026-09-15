import { describe, expect, it } from 'vitest';
import { buildCloseTask } from './tasks.ts';

const config = {
  projectId: 'lilibot-prod',
  location: 'us-east1',
  queue: 'lilibot-close',
  targetUrl: 'https://lilibot-abc.a.run.app/close',
};

describe('buildCloseTask', () => {
  it('schedules the callback at the closing time', () => {
    const at = Date.UTC(2026, 8, 15, 20, 30, 0);
    const task = buildCloseTask(config, { channelId: '123', closeSecret: 's' }, at) as {
      task: { scheduleTime: string };
    };

    expect(task.task.scheduleTime).toBe('2026-09-15T20:30:00.000Z');
  });

  it('base64-encodes the payload Cloud Tasks will post back', () => {
    const task = buildCloseTask(config, { channelId: '123', closeSecret: 'secret' }, 0) as {
      task: { httpRequest: { url: string; httpMethod: string; body: string } };
    };

    expect(task.task.httpRequest.url).toBe(config.targetUrl);
    expect(task.task.httpRequest.httpMethod).toBe('POST');
    expect(JSON.parse(Buffer.from(task.task.httpRequest.body, 'base64').toString('utf8'))).toEqual({
      channelId: '123',
      closeSecret: 'secret',
    });
  });
});
