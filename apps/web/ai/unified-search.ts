import {
  unifiedSearch as execute,
  projectSearchResult as project,
} from './search-execution';
import { observeSearch } from './search-observer';
export const unifiedSearch = (...args: Parameters<typeof execute>) =>
  observeSearch(() => execute(...args));
export const projectSearchResult = (...args: Parameters<typeof project>) =>
  observeSearch(() => project(...args));
