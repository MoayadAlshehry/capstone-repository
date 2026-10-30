import { productName } from '@capstone/domain';

export interface PublicConfig {
  readonly productName: string;
  readonly foundationPhase: 'PHASE_02';
}
// Explicit projection: no spreading process.env or a server configuration object.
export function publicConfig(): PublicConfig {
  return { productName, foundationPhase: 'PHASE_02' };
}
