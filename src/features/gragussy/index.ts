import type { Feature } from '../../core/registry.ts';
import { gragussyCommand } from './command.ts';

export const gragussyFeature: Feature<unknown> = {
  name: 'gragussy',
  commands: [gragussyCommand],
  components: [],
  jobs: [],
};
