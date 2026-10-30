import type { PartnerProfile } from '../../partners/types.js';
import type { ReviewerProfile } from '@capstone/domain/reviewer-types';
export type { PartnerProfile, ReviewerProfile };
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface Filters {
  q: string;
  status: string;
  page: number;
}
export function filterValues(p: URLSearchParams): Filters {
  const q = p.get('q') ?? '',
    status = p.get('status') ?? 'all',
    page = Number(p.get('page') ?? 1);
  if (
    q.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(q) ||
    ![
      'all',
      'active',
      'suspended',
      'pending',
      'approved',
      'rejected',
      'unavailable',
      'reapproval',
    ].includes(status) ||
    !Number.isSafeInteger(page) ||
    page < 1
  )
    throw Error('INVALID_FILTER');
  return { q, status, page };
}
export function safeFrom(
  value: unknown,
  locale: 'en' | 'ar',
  family = 'institutions',
) {
  const fallback = '/' + locale + '/admin/platform/' + family;
  if (
    typeof value !== 'string' ||
    value.length > 12000 ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const u = new URL(value, 'http://platform-return.invalid');
    if (
      u.origin !== 'http://platform-return.invalid' ||
      u.hash ||
      !/^\/(en|ar)\/admin\/platform(?:\/(institutions|partners|reviewers))?$/.test(
        u.pathname,
      ) ||
      [...u.searchParams.keys()].some(
        (k) =>
          !['q', 'status', 'page'].includes(k) ||
          u.searchParams.getAll(k).length !== 1,
      )
    )
      return fallback;
    filterValues(u.searchParams);
    return u.pathname.replace(/^\/(en|ar)/, '/' + locale) + u.search;
  } catch {
    return fallback;
  }
}
export function partnerActions(p: PartnerProfile) {
  return p.accountStatus !== 'active'
    ? []
    : p.status === 'pending'
      ? ['approve', 'reject']
      : p.status === 'approved'
        ? ['suspend']
        : p.status === 'suspended'
          ? ['reapprove']
          : [];
}
export function reviewerActions(p: ReviewerProfile) {
  return p.status === 'approved' ? ['suspend'] : ['approve'];
}
export function reapproval(p: ReviewerProfile) {
  return (
    p.status === 'pending' &&
    p.history.some((h) => h.from === 'approved' && h.to === 'pending')
  );
}
export function reasonValid(s: string, required = true) {
  return (
    (!required && !s.trim()) ||
    (s.trim().length >= 3 &&
      s.length <= 400 &&
      !/[\u0000-\u001f\u007f]|password|secret|token|cookie|postgres(?:ql)?:/i.test(
        s,
      ))
  );
}
