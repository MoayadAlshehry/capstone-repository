/** Per-key subscriber ownership. Never wrap a job in the inference queue twice. */
export class SharedWork<T> {
  private jobs = new Map<
    string,
    { controller: AbortController; promise: Promise<T>; subscribers: number }
  >();
  run(
    key: string,
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
    joined?: () => void,
  ): Promise<T> {
    if (signal.aborted)
      return Promise.reject(signal.reason ?? new Error('CANCELLED'));
    let job = this.jobs.get(key);
    if (!job) {
      const controller = new AbortController();
      const entry: {
        controller: AbortController;
        promise: Promise<T>;
        subscribers: number;
      } = {
        controller,
        promise: Promise.resolve(null as T),
        subscribers: 0,
      };
      entry.promise = Promise.resolve()
        .then(() => work(controller.signal))
        .finally(() => {
          if (this.jobs.get(key) === entry) this.jobs.delete(key);
        });
      job = entry;
      this.jobs.set(key, entry);
    } else joined?.();
    job.subscribers++;
    const current = job;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const release = () => {
        if (settled) return false;
        settled = true;
        signal.removeEventListener('abort', abort);
        if (--current.subscribers === 0 && this.jobs.get(key) === current) {
          this.jobs.delete(key);
          current.controller.abort();
        }
        return true;
      };
      const abort = () => {
        if (release()) reject(signal.reason ?? new Error('CANCELLED'));
      };
      signal.addEventListener('abort', abort, { once: true });
      current.promise.then(
        (value) => {
          if (release()) resolve(value);
        },
        (error) => {
          if (release()) reject(error);
        },
      );
    });
  }
}
