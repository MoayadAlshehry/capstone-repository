import { describe, it, expect } from 'vitest';
import {
  authorize,
  roleCodes,
  roleCode,
  grantState,
  versionTransition,
  requestTransition,
  auditValues,
  publicMetadata,
  type ActorContext,
} from './authorization.js';
const university = 'tenant-a';
describe('deny-by-default authoritative role/resource matrix', () => {
  for (const role of roleCodes) {
    const actor: ActorContext = {
      userId: 'technical',
      role,
      universityId:
        role === 'partner' || role === 'platform_admin' ? null : university,
      active: true,
      partnerApproved: false,
      correlationId: 'server-generated',
    };
    it(role + ' own governance boundary', () => {
      expect(
        authorize(actor, 'department.rename', {
          kind: 'department',
          universityId: university,
          visible: true,
        }),
      ).toBe(
        role === 'university_admin'
          ? 'allow'
          : role === 'platform_admin' || role === 'partner'
            ? 'not_found'
            : 'forbidden',
      );
      expect(
        authorize(actor, 'unregistered.new_action', {
          kind: 'department',
          universityId: university,
          visible: true,
        }),
      ).toBe('forbidden');
      for (const action of [
        'project.publish',
        'grant.approve',
        'identity.impersonate',
        'role.elevate',
      ])
        expect(
          authorize(actor, action, { universityId: university, visible: true }),
        ).toBe('forbidden');
    });
    it(role + ' private cross-tenant and inactive denies', () => {
      expect(
        authorize(actor, 'file.read', {
          kind: 'file',
          universityId: 'tenant-b',
          visible: false,
        }),
      ).not.toBe('allow');
      expect(
        authorize({ ...actor, active: false }, 'department.rename', {
          kind: 'department',
          universityId: university,
          visible: true,
        }),
      ).toBe('forbidden');
    });
  }
  it('visitor receives only explicitly public resources', () => {
    expect(
      authorize(null, 'foundation.read', {
        kind: 'foundation',
        universityId: null,
        visible: true,
      }),
    ).toBe('allow');
    expect(
      authorize(null, 'foundation.read', {
        kind: 'file',
        universityId: university,
        visible: false,
      }),
    ).toBe('forbidden');
    expect(
      authorize(null, 'department.rename', {
        kind: 'department',
        universityId: university,
        visible: true,
      }),
    ).toBe('unauthenticated');
    expect(
      authorize(null, 'file.read', {
        kind: 'file',
        universityId: university,
        visible: true,
        archived: true,
        publicFile: true,
      }),
    ).toBe('allow');
    expect(
      authorize(null, 'file.read', {
        kind: 'file',
        universityId: university,
        visible: true,
        archived: false,
        publicFile: true,
      }),
    ).not.toBe('allow');
  });
  it('membership alone never grants unrelated private files; assigned scope is explicit', () => {
    const a: ActorContext = {
      userId: 'id',
      role: 'student',
      universityId: university,
      active: true,
      partnerApproved: false,
      correlationId: 'id',
    };
    expect(
      authorize(a, 'file.read', {
        kind: 'file',
        universityId: university,
        visible: false,
        authored: false,
      }),
    ).toBe('not_found');
    expect(
      authorize(a, 'file.read', {
        kind: 'file',
        universityId: university,
        visible: true,
        authored: true,
      }),
    ).toBe('allow');
    expect(
      authorize({ ...a, role: 'faculty_supervisor' }, 'file.read', {
        kind: 'file',
        universityId: university,
        visible: true,
        supervised: false,
      }),
    ).toBe('forbidden');
    expect(
      authorize({ ...a, role: 'faculty_supervisor' }, 'reviewer.packet.read', {
        kind: 'file',
        universityId: 'other',
        visible: true,
      }),
    ).toBe('forbidden');
  });
  it('partner requires approval, archive and exact active grant; platform is no universal bypass', () => {
    const a: ActorContext = {
      userId: 'id',
      role: 'partner',
      universityId: null,
      active: true,
      partnerApproved: true,
      correlationId: 'id',
    };
    for (const archived of [true, false])
      for (const exactActiveGrant of [true, false])
        expect(
          authorize(a, 'file.read', {
            kind: 'file',
            universityId: university,
            visible: true,
            archived,
            exactActiveGrant,
          }),
        ).toBe(archived && exactActiveGrant ? 'allow' : 'not_found');
    expect(
      authorize({ ...a, role: 'platform_admin' }, 'audit.platform.read', {
        kind: 'audit',
        universityId: null,
        visible: true,
      }),
    ).toBe('allow');
    expect(
      authorize({ ...a, role: 'platform_admin' }, 'file.read', {
        kind: 'file',
        universityId: university,
        visible: true,
        authored: true,
      }),
    ).toBe('forbidden');
  });
});
it('fixed role codes exclude lead/reviewer and unknown client strings', () => {
  expect(roleCode('team_lead')).toBeUndefined();
  expect(roleCode('reviewer')).toBeUndefined();
  expect(roleCode('PLATFORM_ADMIN')).toBeUndefined();
  expect(roleCodes).toHaveLength(5);
});
it('edition/request states independent; exact grant expiry equality with controlled time', () => {
  expect(versionTransition('draft', 'archived')).toBe(false);
  expect(versionTransition('pending_review', 'archived')).toBe(true);
  expect(versionTransition('archived', 'draft')).toBe(false);
  expect(requestTransition('approved', 'pending')).toBe(false);
  const end = new Date('2026-10-04T12:00:00Z');
  expect(grantState(end, null, new Date(end.getTime() - 1))).toBe('active');
  expect(grantState(end, null, end)).toBe('expired');
  expect(grantState(end, end, end)).toBe('revoked');
});
it('audit values are narrow and reject credentials/raw paths and source blobs', () => {
  for (const item of [
    { password: 'secret' },
    { name_en: 'postgresql://user:password@host/db' },
    { name_en: 'password=private' },
    { contents: 'full file' },
    { name_ar: 'C:\\private\\file' },
  ])
    expect(() => auditValues(item)).toThrow();
  expect(auditValues({ name_en: 'Engineering', row_version: 2 })).toEqual({
    name_en: 'Engineering',
    row_version: 2,
  });
});
it('public projection cannot disclose internal/draft identities or storage paths', () => {
  const row = {
    title: 'Title',
    abstract: 'Abstract',
    email: 'private@example.test',
    student_id: 'private',
    storage_path: 'C:/private',
    status: 'archived',
  };
  expect(publicMetadata(row)).toEqual({ title: 'Title', abstract: 'Abstract' });
  expect(publicMetadata({ ...row, status: 'rejected' })).toBeNull();
});
