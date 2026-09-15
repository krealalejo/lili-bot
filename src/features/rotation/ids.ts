/**
 * The `custom_id` namespace this feature owns. The registry routes any component whose id
 * starts with the prefix here, so no other feature may claim it.
 *
 * These strings are baked into messages already posted in Discord — changing one orphans
 * every button on every open convocatoria.
 */
export const CUSTOM_ID_PREFIX = 'rot:';

export const CustomId = {
  Join: `${CUSTOM_ID_PREFIX}join`,
  Leave: `${CUSTOM_ID_PREFIX}leave`,
  Close: `${CUSTOM_ID_PREFIX}close`,
} as const;
