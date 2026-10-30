export const reviewerDomains = ['software', 'data', 'hardware'] as const;
export const readingLanguages = ['en', 'ar'] as const;
export interface ReviewerFields {
  qualification: string;
  domains: string[];
  tags: string[];
  languages: string[];
  available: boolean;
}
export interface ReviewerProfile extends ReviewerFields {
  id: string;
  name: string;
  institution: string;
  institutionEn: string;
  institutionAr: string;
  status: 'pending' | 'approved' | 'suspended';
  revision: number;
  reason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  calibrationAt: string | null;
  calibrationVersion: string | null;
  history: {
    revision: number;
    from: string | null;
    to: string;
    action: string;
    reason: string;
    at: string;
  }[];
}
export interface ReviewerContext {
  role: string;
  name: string;
  institution: string | null;
  institutionEn: string | null;
  institutionAr: string | null;
  profiles: ReviewerProfile[];
}
const unsafe = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
export const normalizeExpertise = (s: string) =>
  s.normalize('NFC').trim().toLowerCase();
export function reviewerValidation(v: unknown): ReviewerFields | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (
    Object.keys(b).length !== 5 ||
    Object.keys(b).some(
      (k) =>
        ![
          'qualification',
          'domains',
          'tags',
          'languages',
          'available',
        ].includes(k),
    )
  )
    return null;
  if (
    typeof b['qualification'] !== 'string' ||
    typeof b['available'] !== 'boolean'
  )
    return null;
  const qualification = b['qualification'].normalize('NFC').trim();
  if (
    [...qualification].length < 50 ||
    [...qualification].length > 2000 ||
    unsafe.test(qualification)
  )
    return null;
  for (const k of ['domains', 'tags', 'languages'])
    if (
      !Array.isArray(b[k]) ||
      (b[k] as unknown[]).some((x) => typeof x !== 'string')
    )
      return null;
  const domains = b['domains'] as string[],
    languages = b['languages'] as string[],
    raw = b['tags'] as string[];
  if (
    domains.length < 1 ||
    domains.length > 3 ||
    new Set(domains).size !== domains.length ||
    domains.some((x) => !(reviewerDomains as readonly string[]).includes(x))
  )
    return null;
  if (
    languages.length < 1 ||
    languages.length > 2 ||
    new Set(languages).size !== languages.length ||
    languages.some((x) => !(readingLanguages as readonly string[]).includes(x))
  )
    return null;
  if (
    raw.length > 20 ||
    raw.some(
      (x) =>
        [...x.normalize('NFC').trim()].length < 2 ||
        [...x.normalize('NFC').trim()].length > 50 ||
        unsafe.test(x),
    )
  )
    return null;
  const seen = new Set<string>(),
    tags = raw
      .map((x) => x.normalize('NFC').trim())
      .filter((x) => {
        const key = normalizeExpertise(x);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  return {
    qualification,
    domains: [...domains].sort(),
    tags,
    languages: [...languages].sort(),
    available: b['available'],
  };
}
export interface ReviewerCandidate {
  activeFaculty: boolean;
  approved: boolean;
  institution: string | null;
  available: boolean;
  domains: readonly string[];
  languages: readonly string[];
  calibrated: boolean;
  activeTasks: number;
}
export interface ReviewerCaseGates {
  university: string;
  domain: string;
  languages: readonly string[];
  author: boolean;
  supervisor: boolean;
  formerSupervisor: boolean;
  committeeMember: boolean;
  declaredConflict: boolean;
  committeeNameMatch: boolean;
  packetAuthorized: boolean;
}
export function reviewerEligibility(
  p: ReviewerCandidate,
  c: ReviewerCaseGates,
) {
  const reasons: string[] = [];
  if (!p.activeFaculty) reasons.push('ACCOUNT');
  if (!p.approved) reasons.push('APPROVAL');
  if (!p.institution) reasons.push('INSTITUTION');
  if (!p.available) reasons.push('UNAVAILABLE');
  if (p.institution === c.university) reasons.push('SAME_UNIVERSITY');
  if (!p.domains.includes(c.domain)) reasons.push('DOMAIN');
  if (!c.languages.length || !c.languages.every((x) => p.languages.includes(x)))
    reasons.push('LANGUAGE');
  if (!p.calibrated) reasons.push('CALIBRATION');
  if (
    !Number.isInteger(p.activeTasks) ||
    p.activeTasks < 0 ||
    p.activeTasks >= 2
  )
    reasons.push('CAPACITY');
  if (
    c.author ||
    c.supervisor ||
    c.formerSupervisor ||
    c.committeeMember ||
    c.declaredConflict
  )
    reasons.push('CONFLICT');
  if (c.committeeNameMatch) reasons.push('NAME_VERIFICATION');
  if (!c.packetAuthorized) reasons.push('PACKET');
  return {
    eligible: reasons.length === 0,
    reasons,
    verificationRequired: c.committeeNameMatch,
  };
}
export const expertiseOverlap = (
  tags: readonly string[],
  keywords: readonly string[],
) => {
  const frozen = new Set(keywords.map(normalizeExpertise));
  return new Set(tags.map(normalizeExpertise).filter((x) => frozen.has(x)))
    .size;
};
