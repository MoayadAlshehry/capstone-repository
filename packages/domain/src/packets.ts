import { submissionUuid } from './submissions.js';
export const packetAreas = [
  'method',
  'contribution',
  'validation',
  'impact',
] as const;
export const packetLocatorKinds = [
  'page',
  'section',
  'figure',
  'test',
  'lines',
] as const;
export interface PacketLocator {
  area: (typeof packetAreas)[number];
  file: string;
  kind: (typeof packetLocatorKinds)[number];
  reference: string;
}
export interface PacketDraft {
  files: string[];
  reports: string[];
  locators: PacketLocator[];
  languages: string[];
  attestation: boolean;
}
export interface PacketEntry {
  id: string;
  path: string;
  sha256: string;
  size: number;
  mime: string;
  report: boolean;
}
export interface PacketManifest {
  schema: 'ACADEMIC_PACKET_V1';
  case: string;
  project: string;
  version: string;
  submission: string;
  entries: PacketEntry[];
  locators: PacketLocator[];
  languages: string[];
  attestation: { version: 'SCORE_FREE_V1'; acknowledged: boolean };
}
export interface PacketRecord {
  id: string;
  manifest: PacketManifest;
  hash: string;
  authorizedBy: string;
  authorizedAt: string;
  supersedes: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}
export interface PacketState {
  project: string;
  version: string;
  case: string;
  submission: string;
  versionNumber: number;
  currentPublished: boolean;
  canEdit: boolean;
  assignmentRevision: number;
  revision: number;
  draft: PacketDraft;
  draftHash: string;
  files: Omit<PacketEntry, 'report'>[];
  packets: PacketRecord[];
  current: string | null;
  readiness: {
    state:
      | 'ready'
      | 'revoked'
      | 'not-authorized'
      | 'invalid-case'
      | 'invalid-manifest'
      | 'evidence-unavailable';
    assignmentReady: boolean;
  };
}
const safe = (s: unknown, min: number, max: number): s is string =>
  typeof s === 'string' &&
  [...s.trim()].length >= min &&
  [...s.trim()].length <= max &&
  !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(s);
export function packetDraftIssues(value: unknown, complete = false): string[] {
  const issues: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return ['SHAPE'];
  const b = value as Record<string, unknown>;
  if (
    Object.keys(b).length !== 5 ||
    Object.keys(b).some(
      (k) =>
        !['files', 'reports', 'locators', 'languages', 'attestation'].includes(
          k,
        ),
    )
  )
    return ['SHAPE'];
  for (const k of ['files', 'reports'])
    if (
      !Array.isArray(b[k]) ||
      (b[k] as unknown[]).length > 10000 ||
      (b[k] as unknown[]).some((x) => !submissionUuid(x)) ||
      new Set(b[k] as string[]).size !== (b[k] as unknown[]).length
    )
      issues.push(k.toUpperCase());
  if (
    !Array.isArray(b['languages']) ||
    (b['languages'] as unknown[]).length > 2 ||
    (b['languages'] as unknown[]).some(
      (x) => !['en', 'ar'].includes(String(x)),
    ) ||
    new Set(b['languages'] as string[]).size !==
      (b['languages'] as unknown[]).length
  )
    issues.push('LANGUAGES');
  if (typeof b['attestation'] !== 'boolean') issues.push('ATTESTATION');
  if (!Array.isArray(b['locators']) || b['locators'].length > 80)
    issues.push('LOCATORS');
  else
    for (const item of b['locators']) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        issues.push('LOCATOR');
        continue;
      }
      const l = item as Record<string, unknown>;
      if (
        Object.keys(l).length !== 4 ||
        Object.keys(l).some(
          (k) => !['area', 'file', 'kind', 'reference'].includes(k),
        ) ||
        !(packetAreas as readonly unknown[]).includes(l['area']) ||
        !submissionUuid(l['file']) ||
        !(packetLocatorKinds as readonly unknown[]).includes(l['kind']) ||
        !safe(l['reference'], 1, 200)
      )
        issues.push('LOCATOR');
      else if (['page', 'lines'].includes(String(l['kind']))) {
        const m = /^([1-9]\d*)(?:-([1-9]\d*))?$/.exec(
          String(l['reference']).trim(),
        );
        if (
          !m ||
          Number(m[1]) > 10000000 ||
          Number(m[2] ?? m[1]) < Number(m[1]) ||
          Number(m[2] ?? m[1]) > 10000000
        )
          issues.push('LOCATOR_RANGE');
      }
      if (Array.isArray(b['files']) && !b['files'].includes(l['file']))
        issues.push('LOCATOR_FILE');
    }
  if (
    Array.isArray(b['reports']) &&
    Array.isArray(b['files']) &&
    b['reports'].some((x) => !(b['files'] as unknown[]).includes(x))
  )
    issues.push('REPORT_FILE');
  if (complete) {
    if (!Array.isArray(b['files']) || !b['files'].length)
      issues.push('FILES_REQUIRED');
    if (!Array.isArray(b['reports']) || !b['reports'].length)
      issues.push('REPORT_REQUIRED');
    if (!Array.isArray(b['languages']) || !b['languages'].length)
      issues.push('LANGUAGE_REQUIRED');
    if (b['attestation'] !== true) issues.push('ATTESTATION_REQUIRED');
    for (const area of packetAreas)
      if (
        !Array.isArray(b['locators']) ||
        !b['locators'].some(
          (l) =>
            l &&
            typeof l === 'object' &&
            (l as Record<string, unknown>)['area'] === area,
        )
      )
        issues.push('AREA_' + area.toUpperCase());
  }
  return [...new Set(issues)];
}
export function normalizedPacketDraft(b: PacketDraft): PacketDraft {
  return {
    files: b.files.map((x) => x.toLowerCase()).sort(),
    reports: b.reports.map((x) => x.toLowerCase()).sort(),
    locators: b.locators
      .map((l) => ({
        ...l,
        file: l.file.toLowerCase(),
        reference: l.reference.normalize('NFC').trim(),
      }))
      .sort((a, b) =>
        [a.area, a.file, a.kind, a.reference].join('\0') <
        [b.area, b.file, b.kind, b.reference].join('\0')
          ? -1
          : 1,
      ),
    languages: [...b.languages].sort(),
    attestation: b.attestation,
  };
}
export function canonicalPacket(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(canonicalPacket).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            canonicalPacket((value as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
