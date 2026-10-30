import 'server-only';
import pg from 'pg';
/** Bounded anonymous operational data retention, independent of evaluation jobs. */
export function createPublicViewsMaintenance(url: string) {
  if (new URL(url).username !== 'capstone_jobs')
    throw Error('INVALID_JOB_ROLE');
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 3000,
  });
  pool.on('error', () => {});
  let running = false;
  async function expire() {
    if (running) return;
    running = true;
    try {
      await pool.query('SELECT app.public_views_expire()');
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => {
    void expire().catch(() => {});
  }, 3600000);
  timer.unref();
  void expire().catch(() => {});
  return {
    async ready() {
      return (
        (
          await pool.query(
            "SELECT to_regprocedure('app.public_views_expire()') IS NOT NULL ready",
          )
        ).rows[0].ready === true
      );
    },
    async close() {
      clearInterval(timer);
      await pool.end();
    },
  };
}
