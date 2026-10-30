import { expect, it } from 'vitest';
import { routeScope } from './registry';

it('retires the Operations screen and its platform allocation alias without removing university scheduling or governance routes', () => {
  expect(routeScope('/admin/platform/operations')).toBeNull();
  expect(routeScope('/admin/platform/operations/')).toBeNull();
  expect(routeScope('/evaluation/allocation')?.roles).toEqual([
    'university_admin',
  ]);
  for (const path of [
    '/admin/platform',
    '/admin/platform/approvals',
    '/admin/platform/drafts',
    '/notifications',
    '/audit',
  ])
    expect(routeScope(path)?.roles).toContain('platform_admin');
});

it('admits original faculty issue details while keeping allocation administrative', () => {
  expect(routeScope('/evaluation/issues')?.roles).toContain(
    'faculty_supervisor',
  );
  expect(routeScope('/evaluation/allocation')?.roles).not.toContain(
    'faculty_supervisor',
  );
  expect(
    routeScope('/evaluation/corrections/11111111-1111-4111-8111-111111111111')
      ?.roles,
  ).toEqual(['faculty_supervisor']);
  expect(routeScope('/evaluation/issues')?.roles).not.toContain('student');
  expect(routeScope('/evaluation/issues')?.roles).not.toContain('partner');
});
