import type { Role } from './group.ts';

export const CUSTOM_ID_PREFIX = 'mit:';

export const CustomId = {
  Tank: `${CUSTOM_ID_PREFIX}tank`,
  Healer: `${CUSTOM_ID_PREFIX}healer`,
  Dps: `${CUSTOM_ID_PREFIX}dps`,
  Leave: `${CUSTOM_ID_PREFIX}leave`,
  Close: `${CUSTOM_ID_PREFIX}close`,
} as const;

export const ROLE_BY_CUSTOM_ID: Readonly<Record<string, Role>> = {
  [CustomId.Tank]: 'tank',
  [CustomId.Healer]: 'healer',
  [CustomId.Dps]: 'dps',
};
