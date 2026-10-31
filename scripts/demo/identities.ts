import { randomUUID } from 'node:crypto';
import { demoContext } from './context.js';
import {
  credential,
  privateJson,
  savePrivate,
  type DemoIdentity,
} from './store.js';
import {
  factoryVersion,
  personName,
  universities,
  projectSpecs,
} from './scenarios.js';

export async function buildIdentities(
  x: Awaited<ReturnType<typeof demoContext>>,
) {
  const platform = await x.bootstrap();
  const tenants: Record<
    string,
    {
      id: string;
      admin: string;
      departments: Record<string, string>;
      reviewers: string[];
    }
  > = {};
  async function remember(person: DemoIdentity, id: string) {
    const all = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
    all[person.key] = { ...person, id };
    await savePrivate('identities.json', all);
  }
  for (const [n, u] of universities.entries()) {
    let uni = (
      await x.sql('SELECT id FROM app.universities WHERE code=$1', [u.code])
    )[0]?.id as string | undefined;
    uni ??= (
      await x.on.command(platform, randomUUID(), 'university.create', {
        code: u.code,
        name_en: u.en,
        name_ar: u.ar,
      })
    ).id;
    const person = await credential(
      'admin-' + u.code.toLowerCase(),
      personName(700 + n),
      'university_admin',
      u.code,
    );
    let id = (
      await x.sql('SELECT id FROM app.users WHERE email=$1', [person.email])
    )[0]?.id as string | undefined;
    id ??= (
      await x.on.command(platform, randomUUID(), 'administrator.invite', {
        university: uni,
        name: person.name,
        email: person.email,
        locale: 'en',
      })
    ).id;
    const admin = await x.activate(person, id);
    await remember(person, id);
    const deps = await x.on.read<{ id: string; code: string }[]>(
      admin,
      'departments',
    );
    const departments = Object.fromEntries(deps.map((d) => [d.code, d.id]));
    const reviewers: string[] = [];
    for (let j = 0; j < 12; j++) {
      const role = await credential(
        `reviewer-${u.code.toLowerCase()}-${String(j + 1).padStart(2, '0')}`,
        personName(800 + n * 12 + j),
        'faculty_supervisor',
        u.code,
      );
      let rid = (
        await x.sql('SELECT id FROM app.users WHERE email=$1', [role.email])
      )[0]?.id as string | undefined;
      rid ??= (
        await x.on.command(admin, randomUUID(), 'person.invite', {
          department: departments[['CS', 'IS', 'CE'][j % 3]!]!,
          role: 'faculty_supervisor',
          name: role.name,
          email: role.email,
          locale: 'en',
        })
      ).id;
      const actor = await x.activate(role, rid);
      await remember(role, rid);
      let profile = (await x.profiles.view(actor)).profiles[0];
      const domain = ['software', 'data', 'hardware'][j % 3]!;
      if (!profile) {
        await x.profiles.command(actor, {
          operation: 'save',
          target: rid,
          revision: 0,
          command: randomUUID(),
          body: {
            qualification: `P53 fictional academic reviewer with a scenario-defined ${domain} research specialty. This seeded profile exists only for the demonstration and claims no real degree, employment verification or university endorsement.`,
            domains: [domain],
            tags: [
              ...new Set(
                projectSpecs
                  .filter((p) => p.domain === domain)
                  .map((p) => p.topic),
              ),
            ].slice(0, 20),
            languages: ['en', 'ar'],
            available: true,
          },
        });
        profile = (await x.profiles.view(actor)).profiles[0]!;
      }
      if (profile.status !== 'approved') {
        await x.profiles.command(platform, {
          operation: 'approve',
          target: rid,
          revision: profile.revision,
          command: randomUUID(),
          body: {
            reason:
              'P53 auditable fictional reviewer profile approved for demonstration-only expertise and independence scenarios; no real academic accreditation is asserted.',
          },
        });
        profile = (await x.profiles.view(actor)).profiles[0]!;
      }
      if (!profile.calibrationAt)
        await x.profiles.command(actor, {
          operation: 'calibrate',
          target: rid,
          revision: profile.revision,
          command: randomUUID(),
          body: { version: 'EXTERNAL_V1', acknowledged: true },
        });
      reviewers.push(rid);
    }
    tenants[u.code] = { id: uni, admin: id, departments, reviewers };
    console.log(
      JSON.stringify({
        stage: 'identities',
        university: u.code,
        approvedReviewers: reviewers.length,
      }),
    );
  }
  const count = (
    await x.sql(
      "SELECT count(*)::int n FROM app.reviewer_profiles WHERE status='approved' AND availability",
    )
  )[0]!.n;
  if (count !== 60) throw Error('SIXTY_APPROVED_REVIEWERS_REQUIRED');
  await savePrivate('tenants.json', { factoryVersion, tenants });
  return { platform, tenants };
}

