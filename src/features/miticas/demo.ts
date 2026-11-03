import { ROLES, type Signup } from './group.ts';

export const DEMO_PLAYERS = 9;

const DEMO_ID_PREFIX = 'demo-';

export const isDemo = (id: string): boolean => id.startsWith(DEMO_ID_PREFIX);

export const demoName = (id: string): string => `Bot ${id.slice(DEMO_ID_PREFIX.length)}`;

export function demoPlayers(count = DEMO_PLAYERS): Signup[] {
  return Array.from({ length: count }, (_, i) => {
    const picked = ROLES.filter(() => Math.random() < 0.5);
    const roles =
      picked.length > 0 ? picked : [ROLES[Math.floor(Math.random() * ROLES.length)]];

    return { id: `${DEMO_ID_PREFIX}${i + 1}`, roles };
  });
}
