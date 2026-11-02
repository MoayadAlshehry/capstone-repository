import { createHash, randomUUID } from 'node:crypto';
import type { NativeDescriptor, NativeStorage } from '@capstone/storage/native';

export type DemoUploadIdentity = {
  project: string;
  version: string;
  uploader: string;
  path: string;
  bytes: number;
  sha256: string;
};
export type DemoUploadIntent = DemoUploadIdentity & { correlation: string };
export type DemoUploadReservation = {
  id: string;
  project: string;
  version: string;
  uploader: string;
  path: string;
  bytes: number;
  correlation: string;
  stagingKey: string;
  status: string;
};
export function demoUploadKey(identity: DemoUploadIdentity) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        identity.project,
        identity.version,
        identity.uploader,
        identity.path,
        identity.bytes,
        identity.sha256,
      ]),
    )
    .digest('hex');
}
function sameScope(row: DemoUploadReservation, identity: DemoUploadIdentity) {
  return (
    row.project === identity.project &&
    row.version === identity.version &&
    row.uploader === identity.uploader &&
    row.path === identity.path &&
    Number(row.bytes) === identity.bytes
  );
}
/** Only the stopped, opted-in Demo loader supplies these private journal ports. */
export async function prepareDemoUploadIntent(
  identity: DemoUploadIdentity,
  intents: Record<string, DemoUploadIntent>,
  ports: {
    save: () => Promise<void>;
    known: (correlation: string) => Promise<DemoUploadReservation | undefined>;
    pending: () => Promise<DemoUploadReservation | undefined>;
    verify: NativeStorage['verify'];
  },
): Promise<DemoUploadIntent> {
  const key = demoUploadKey(identity),
    previous = intents[key];
  if (previous) {
    if (
      demoUploadKey(previous) !== key ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(
        previous.correlation,
      )
    )
      throw Error('DEMO_UPLOAD_INTENT_DRIFT');
    const row = await ports.known(previous.correlation);
    if (row && !sameScope(row, identity))
      throw Error('DEMO_UPLOAD_SCOPE_CONFLICT');
    if (!row || ['active', 'finalized'].includes(row.status)) return previous;
    if (!['failed', 'cancelled', 'expired'].includes(row.status))
      throw Error('DEMO_UPLOAD_STATE_CONFLICT');
  }
  const pending = await ports.pending();
  if (
    pending &&
    (!sameScope(pending, identity) ||
      pending.status !== 'active' ||
      !(await ports.verify(pending.stagingKey, {
        size: identity.bytes,
        sha256: identity.sha256,
      })))
  )
    throw Error('DEMO_UNRECOGNIZED_PENDING_UPLOAD');
  // A pre-journal interrupted upload is adopted only when its exact owned scope
  // and immutable staged bytes match this shipped asset. Unknown bytes remain untouched.
  const intent = {
    ...identity,
    correlation: pending?.correlation ?? randomUUID(),
  };
  intents[key] = intent;
  await ports.save();
  return intent;
}
/** Reuse only verified bytes for the current loader intent; never overwrite them.
 * The normal file engine still performs format validation and authorized commit. */
export function resumableDemoStorage(
  storage: NativeStorage,
  expectedWrites: ReadonlyMap<string, NativeDescriptor>,
): NativeStorage {
  return {
    ...storage,
    async write(key, bytes, expected) {
      const known = expectedWrites.get(key);
      // The loader holds its installation lock with application writers stopped.
      // Remove only abandoned temporary writes for this recorded intent, never originals.
      if (known && known.size === expected)
        await storage.removePartialStaging?.(key);
      if (
        known &&
        known.size === expected &&
        (await storage.verify(key, known))
      )
        return known;
      return storage.write(key, bytes, expected);
    },
  };
}
