import { describe, expect, it } from 'vitest';
import { demoName, demoPlayers, DEMO_PLAYERS, isDemo } from './demo.ts';
import { ROLES } from './group.ts';

describe('demoPlayers', () => {
  it('creates nine distinct bots, each with at least one valid role', () => {
    for (let run = 0; run < 100; run += 1) {
      const players = demoPlayers();

      expect(players).toHaveLength(DEMO_PLAYERS);
      expect(new Set(players.map((p) => p.id)).size).toBe(DEMO_PLAYERS);
      for (const player of players) {
        expect(isDemo(player.id)).toBe(true);
        expect(player.roles.length).toBeGreaterThan(0);
        expect(player.roles.every((role) => ROLES.includes(role))).toBe(true);
      }
    }
  });

  it('names bots for display and never mistakes a Discord id for one', () => {
    expect(demoName('demo-3')).toBe('Bot 3');
    expect(isDemo('123456789012345678')).toBe(false);
  });
});
