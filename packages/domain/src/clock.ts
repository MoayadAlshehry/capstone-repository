/** Inject into time-dependent domain services; Date values are UTC instants. */
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
