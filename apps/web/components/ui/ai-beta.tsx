import { Badge } from './badge';

/** Only public search and the existing project assistant header use this badge. */
export function AIBeta() {
  return (
    <Badge variant="secondary" className="ai-beta" data-ai-beta dir="ltr">
      BETA
    </Badge>
  );
}
