import { database, digest } from './ownership.js';
import { privateJson, type DemoIdentity } from './store.js';
import type { MadeProject } from './projects.js';
/** Semantic fixture checks omit regenerated deadlines/nonces/sessions. They do
 * not turn factory preparation into browser journey evidence. */
export async function verifyClosure(url: string, required = false) {
  if (!required) return null;
  const actors = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => {
        throw Error('CLOSURE_IDENTITIES_REQUIRED');
      },
    ),
    scenarios = await privateJson<Record<string, MadeProject>>(
      'scenarios.json',
      () => {
        throw Error('CLOSURE_SCENARIOS_REQUIRED');
      },
    );
  return database(url, async (c) => {
    await c.query('BEGIN READ ONLY');
    try {
      const require = (ok: unknown, key: string) => {
          if (!ok) throw Error('CLOSURE_VERIFY_' + key);
        },
        facts: Record<string, unknown> = {};
      for (const key of [
        'closure-new-student',
        'closure-new-author-2',
        'closure-new-author-3',
        'closure-new-partner',
        'closure-new-faculty',
        'closure-new-admin',
      ]) {
        require(actors[key], key);
        const rows = (
          await c.query(
            'SELECT id FROM app.users WHERE lower(email)=lower($1)',
            [actors[key]!.email],
          )
        ).rows;
        require(rows.length === 0, key + '_MUST_START_UNREGISTERED');
        facts[key] = 'unregistered';
      }
      for (const key of [
        'closure-invited-student',
        'closure-invited-faculty',
      ]) {
        require(actors[key], key);
        const rows = (
          await c.query(
            "SELECT u.role_code,u.account_status,(SELECT count(*)::int FROM app.auth_accounts a WHERE a.user_id=u.id AND a.provider_id='credential') credentials FROM app.users u WHERE email=$1",
            [actors[key]!.email],
          )
        ).rows;
        require(rows.length === 1 &&
          rows[0].role_code === actors[key]!.role &&
          rows[0].account_status === 'inactive' &&
          rows[0].credentials === 0, key + '_SETUP_MUST_REMAIN_INCOMPLETE');
        facts[key] = {
          role: rows[0].role_code,
          state: 'invited; no credential',
        };
      }
      const published = scenarios['S09']!;
      for (const [key, state] of [
        ['closure-partner-rejected', 'rejected'],
        ['closure-partner-suspended', 'suspended'],
        ['closure-partner-active', 'approved'],
        ['closure-partner-revoked', 'approved'],
        ['closure-partner-denied', 'approved'],
        ['partner-approved', 'approved'],
      ] as const) {
        require(actors[key], key);
        const u = (
          await c.query(
            "SELECT id,partner_status FROM app.users WHERE email=$1 AND role_code='partner'",
            [actors[key]!.email],
          )
        ).rows[0];
        require(u?.partner_status === state, key + '_ELIGIBILITY');
        let access = 'none';
        if (state === 'approved') {
          const r = (
            await c.query(
              'SELECT status FROM app.access_requests WHERE requester_id=$1 AND project_id=$2 AND version_id=$3',
              [u.id, published.project, published.version],
            )
          ).rows;
          const g = (
            await c.query(
              "SELECT CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN expires_at<=clock_timestamp() THEN 'expired' ELSE 'active' END state FROM app.access_grants WHERE granted_to=$1 AND project_id=$2 AND version_id=$3",
              [u.id, published.project, published.version],
            )
          ).rows;
          access = g[0]?.state ?? r[0]?.status ?? 'none';
          require(access ===
            (key === 'closure-partner-active'
              ? 'active'
              : key === 'closure-partner-revoked'
                ? 'revoked'
                : key === 'closure-partner-denied'
                  ? 'denied'
                  : 'pending'), key + '_ACCESS');
        }
        facts[key] = { eligibility: state, access };
      }
      for (const [key, status] of [
        ['S01', 'draft'],
        ['S02', 'draft'],
        ['S03', 'pending_review'],
        ['S04', 'pending_review'],
        ['S05', 'pending_review'],
        ['S06', 'pending_review'],
        ['S07', 'revision_required'],
        ['S08', 'rejected'],
        ['S09', 'archived'],
        ['S10', 'pending_review'],
      ] as const) {
        const p = scenarios[key];
        require(p, key);
        const v = (
          await c.query(
            'SELECT status FROM app.project_versions WHERE id=$1 AND project_id=$2',
            [p!.version, p!.project],
          )
        ).rows[0];
        require(v?.status === status, key + '_START_STATE');
        facts[key] = status;
      }
      const partial = (
        await c.query(
          'SELECT count(*)::int invited,count(*) FILTER(WHERE i.submitted_at IS NOT NULL)::int submitted FROM app.committee_invitations i JOIN app.committee_rounds r ON r.case_id=i.case_id WHERE r.submission_id=$1 AND i.revoked_at IS NULL',
          [scenarios['S10']!.submission],
        )
      ).rows[0];
      require(partial.invited === 2 &&
        partial.submitted === 1, 'PARTIAL_COMMITTEE');
      facts['S10-committee'] = partial;
      const pending = (
        await c.query(
          "SELECT (SELECT count(*) FROM app.account_email_outbox WHERE ciphertext IS NOT NULL AND state IN('queued','sending','failed','unknown'))+(SELECT count(*) FROM app.committee_mail_outbox WHERE ciphertext IS NOT NULL AND state IN('queued','sending','failed','unknown')) n",
        )
      ).rows[0];
      require(Number(pending.n) === 0, 'NO_REPLAYABLE_MAIL');
      await c.query('COMMIT');
      return {
        passed: true,
        slots: 14,
        facts,
        semanticDigest: digest(JSON.stringify(facts)),
        noReplayableMail: true,
      };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  });
}
