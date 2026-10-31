import { randomUUID } from 'node:crypto';
import { createPartners } from '@capstone/db/partners';
import { createPartnerAccess } from '@capstone/db/grants';
import { demoContext } from './context.js';
import {
  credential,
  privateJson,
  savePrivate,
  type DemoIdentity,
} from './store.js';
import { personName, factoryVersion } from './scenarios.js';
import type { MadeProject } from './projects.js';

export async function buildClosureExamples(x: Awaited<ReturnType<typeof demoContext>>) {
const partners = createPartners(process.env['DATABASE_URL']!), access = createPartnerAccess(process.env['DATABASE_URL']!);
try {
  await x.events.close();
  let all = await privateJson<Record<string, DemoIdentity>>(
    'identities.json',
    () => {
      throw Error('IDENTITIES_REQUIRED');
    },
  );
  const slots: Record<string, unknown> = {};
  for (const [n, key, role] of [
    [3700, 'closure-new-student', 'student'],
    [3701, 'closure-new-author-2', 'student'],
    [3702, 'closure-new-author-3', 'student'],
    [3703, 'closure-new-partner', 'partner'],
    [3704, 'closure-new-faculty', 'faculty_supervisor'],
    [3705, 'closure-new-admin', 'university_admin'],
  ] as const) {
    let person = await credential(
      key,
      personName(n),
      role,
      role === 'partner' ? undefined : 'KKU',
    );
    if (
      (
        await x.sql('SELECT id FROM app.users WHERE lower(email)=lower($1)', [
          person.email,
        ])
      ).length
    )
      throw Error('FRESH_ENTRY_SLOT_ALREADY_REGISTERED_' + key);
    slots[key] = {
      state: 'UNREGISTERED',
      role: person.role,
      passwordState:
        'Prescribed; set through actual setup/registration step, not a verified existing login',
    };
  }
  all = await privateJson('identities.json', () => all);
  const { tenants } = await privateJson<{
    tenants: Record<string, { departments: Record<string, string> }>;
  }>('tenants.json', () => {
    throw Error('TENANTS_REQUIRED');
  });
  const admin = await x.login(all['admin-kku']!),
    platform = await x.bootstrap();
  for (const [n, key, role] of [
    [3710, 'closure-invited-student', 'student'],
    [3711, 'closure-invited-faculty', 'faculty_supervisor'],
  ] as const) {
    const person = await credential(key, personName(n), role, 'KKU');
    let id = (
      await x.sql('SELECT id FROM app.users WHERE email=$1', [person.email])
    )[0]?.id as string | undefined;
    id ??= (
      await x.on.command(admin, randomUUID(), 'person.invite', {
        department: tenants['KKU']!.departments['CS']!,
        role,
        name: person.name,
        email: person.email,
        locale: 'en',
      })
    ).id;
    all = await privateJson('identities.json', () => all);
    all[key] = { ...person, id };
    await savePrivate('identities.json', all);
    slots[key] = {
      state: 'INVITED_SETUP_REQUIRED',
      id,
      role,
      resend:
        'Administrator must issue a fresh setup link after reset; no old capability is restored',
    };
  }
  const scenarios = await privateJson<Record<string, MadeProject>>(
      'scenarios.json',
      () => {
        throw Error('SCENARIOS_REQUIRED');
      },
    ),
    project = scenarios['S09'];
  if (!project?.published) throw Error('SEPARATE_PUBLISHED_WORKFLOW_REQUIRED');
  const core = await privateJson<Record<string, MadeProject>>(
    'projects.json',
    () => {
      throw Error('CORE_MAP_REQUIRED');
    },
  );
  if (Object.values(core).some((p) => p.project === project.project))
    throw Error('NEVER_MUTATE_CORE');
  const lead = await x.login(
    Object.values(all).find((a) => a.id === project.lead)!,
  );
  for (const [n, key, end] of [
    [3720, 'closure-partner-rejected', 'rejected'],
    [3721, 'closure-partner-suspended', 'suspended'],
    [3722, 'closure-partner-active', 'active'],
    [3723, 'closure-partner-revoked', 'revoked'],
    [3724, 'closure-partner-denied', 'denied'],
  ] as const) {
    const person = await credential(key, personName(n), 'partner');
    if (
      !(await x.sql('SELECT id FROM app.users WHERE email=$1', [person.email]))
        .length
    )
      await partners.register({
        name: person.name,
        email: person.email,
        organization: 'Fictional closure demonstration research studio',
        password: person.password,
        confirmation: person.password,
        locale: 'en',
      });
    const actor = await x.login(person);
    all = await privateJson('identities.json', () => all);
    all[key] = { ...person, id: actor.id };
    await savePrivate('identities.json', all);
    let profile = (await partners.view(platform)).find(
      (p) => p.id === actor.id,
    )!;
    if (profile.status === 'pending')
      await partners.command(platform, {
        command: end === 'rejected' ? 'reject' : 'approve',
        commandId: randomUUID(),
        target: actor.id,
        revision: profile.revision,
        reason:
          'Controlled fictional closure scenario; current eligibility policy and original attribution retained.',
      });
    profile = (await partners.view(platform)).find((p) => p.id === actor.id)!;
    if (end === 'suspended' && profile.status === 'approved')
      await partners.command(platform, {
        command: 'suspend',
        commandId: randomUUID(),
        target: actor.id,
        revision: profile.revision,
        reason:
          'Controlled suspended-eligibility presentation state; no actual partnership is asserted.',
      });
    if (['active', 'revoked', 'denied'].includes(end)) {
      let view = await access.view(actor),
        request = view.requests.find(
          (r) => r.project === project.project && r.version === project.version,
        );
      if (!request) {
        await access.command(actor, {
          operation: 'request',
          commandId: randomUUID(),
          project: project.project,
          version: project.version,
          text: 'Controlled research access to the restricted annex of this separate fictional workflow edition.',
        });
        view = await access.view(actor);
        request = view.requests.find(
          (r) => r.project === project.project && r.version === project.version,
        )!;
      }
      if (request.status === 'pending')
        await access.command(lead, {
          operation: end === 'denied' ? 'deny' : 'approve',
          commandId: randomUUID(),
          project: project.project,
          version: project.version,
          target: request.id,
          revision: request.revision,
          text: 'Current team lead decision for the controlled exact-edition demonstration.',
        });
      view = await access.view(actor);
      const grant = view.grants.find((g) => g.request === request.id);
      if (end === 'revoked' && grant?.state === 'active')
        await access.command(lead, {
          operation: 'revoke',
          commandId: randomUUID(),
          project: project.project,
          version: project.version,
          target: grant.id,
          revision: grant.revision,
          text: 'Controlled access revocation scenario; original files and audit attribution remain intact.',
        });
    }
    slots[key] = {
      state: end,
      actor: actor.id,
      project: project.project,
      version: project.version,
    };
  }
  const approved = await x.login(all['partner-approved']!),
    current = await access.view(approved);
  if (
    !current.requests.some(
      (r) => r.project === project.project && r.version === project.version,
    )
  )
    await access.command(approved, {
      operation: 'request',
      commandId: randomUUID(),
      project: project.project,
      version: project.version,
      text: 'Pending exact-edition access decision for the controlled closure presentation.',
    });
  slots['partner-approved'] = {
    state: 'PENDING_ACCESS_DECISION',
    project: project.project,
    version: project.version,
  };
  await savePrivate('closure-scenarios.json', { factoryVersion, slots, mail: 'Synthetic local capture only; no real mailbox dependency or private reset.' });
  console.log(
    JSON.stringify({
      factoryVersion,
      slots: Object.keys(slots).length,
      protectedCoreUnchanged: true,
      protectedStorageUnchanged: true,
    }),
  );
} finally {
  await access.close();
  await partners.close();
  await x.close();
}

}
