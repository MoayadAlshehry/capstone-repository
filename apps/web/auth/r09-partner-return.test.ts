import { describe, expect, it } from 'vitest';
import {
  allowedOwnReturn,
  parsedIntent,
  type OwnAccountView,
} from './r3-context';

const project = '12ba3bc4-6457-4815-9d71-aab8ec97df03';
const partner: Pick<OwnAccountView, 'role' | 'contexts' | 'canLead'> = {
  role: 'partner',
  contexts: [],
  canLead: false,
};

describe('current partner access collection return after authentication', () => {
  it.each(['active', 'pending', 'history'])(
    'retains the approved %s tab and its exact collection filters across locale rebasing',
    (tab) => {
      const query = new URLSearchParams({
        tab,
        q: 'Fictional project · مشروع',
        status: tab === 'pending' ? 'awaiting_lead' : 'active',
        page: '2',
        project,
      });
      const path = '/en/partner/access?' + query;
      expect(parsedIntent(path)?.pathname).toBe('/en/partner/access');
      expect(allowedOwnReturn(path, partner, 'ar')).toBe(
        '/ar/partner/access?' + query,
      );
    },
  );

  it('retains a current history selection and compatible earlier access filters', () => {
    expect(
      allowedOwnReturn('/ar/partner/access?tab=history', partner, 'ar'),
    ).toBe('/ar/partner/access?tab=history');
    expect(
      allowedOwnReturn(
        '/en/partner/access?filter=cancelled&request=' + project,
        partner,
        'en',
      ),
    ).toBe('/en/partner/access?filter=cancelled&request=' + project);
    expect(
      allowedOwnReturn('/en/partner/access?status=pending', partner, 'en'),
    ).toBe('/en/partner/access?status=pending');
  });

  it.each([
    'tab=foreign',
    'tab=history&tab=active',
    'q=one&q=two',
    'q=' + 'a'.repeat(201),
    'q=%00',
    'status=admin',
    'status=active&status=revoked',
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1e2',
    'page=9007199254740992',
    'project=' + '-'.repeat(36),
    'project=' + project + '&project=' + project,
    'password=private',
    'role=platform_admin',
  ])('rejects malformed or unrelated collection query %s', (query) => {
    expect(parsedIntent('/en/partner/access?' + query)).toBeNull();
    expect(
      allowedOwnReturn('/en/partner/access?' + query, partner, 'en'),
    ).toBeNull();
  });

  it('keeps the new query keys on the current hub and preserves role boundaries', () => {
    const hub = '/en/partner/access?tab=history&project=' + project;
    for (const role of [
      'student',
      'faculty_supervisor',
      'university_admin',
      'platform_admin',
    ])
      expect(
        allowedOwnReturn(hub, { ...partner, role, canLead: true }, 'en'),
      ).toBeNull();
    expect(parsedIntent('/en/partner/eligibility?tab=history')).toBeNull();
    expect(parsedIntent('/en/partner?project=' + project)).toBeNull();
    expect(
      allowedOwnReturn('https://foreign.test' + hub, partner, 'en'),
    ).toBeNull();
    expect(allowedOwnReturn('//foreign.test' + hub, partner, 'en')).toBeNull();
    expect(allowedOwnReturn(hub + '#foreign', partner, 'en')).toBeNull();
  });
});
