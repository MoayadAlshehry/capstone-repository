import { createHash, randomUUID } from 'node:crypto';
import type { Clock } from '@capstone/domain';
export class MutableClock implements Clock {
  private instant: number;
  constructor(utc: string) {
    if (!utc.endsWith('Z') || !Number.isFinite(Date.parse(utc)))
      throw new Error('Valid UTC instant required.');
    this.instant = Date.parse(utc);
  }
  now() {
    return new Date(this.instant);
  }
  advance(milliseconds: number) {
    if (
      !Number.isSafeInteger(milliseconds) ||
      !Number.isFinite(this.instant + milliseconds)
    )
      throw new Error('Invalid clock advance.');
    this.instant += milliseconds;
  }
}
export function deterministicId(seed: string, ordinal: number) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0)
    throw new Error('Invalid ordinal.');
  return createHash('sha256')
    .update(`${seed}:${ordinal}`)
    .digest('hex')
    .slice(0, 16);
}
export function technicalUuid(seed: string, ordinal: number) {
  const hex = createHash('sha256')
    .update(deterministicId(seed, ordinal))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function namespace(run: string = randomUUID(), worker = '0') {
  return deterministicId(`${run}:${worker}`, 0);
}
export class Cleanup {
  private actions: (() => Promise<void>)[] = [];
  register(action: () => Promise<void>) {
    this.actions.push(action);
  }
  async close() {
    const errors: unknown[] = [];
    for (const action of this.actions.splice(0).reverse()) {
      try {
        await action();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Owned fixture cleanup failed.');
  }
}
/** Path contract only: Phase09 must perform real login before writing state. */
export function authStatePath(run: string, worker: string, role: string) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(role))
    throw Error('Invalid isolated role');
  return `.local/browser/.auth/${namespace(run, worker)}-${role}.json`;
}
