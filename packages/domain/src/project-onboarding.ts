import { z } from 'zod';
const text = (maximum: number, minimum = 1) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .regex(/^[^\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]*$/u);
export const projectPersonSchema = z
  .object({
    name: text(200),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u),
    existingId: z.uuid().optional(),
  })
  .strict();
export const projectStudentSchema = projectPersonSchema.extend({
  lead: z.boolean(),
});
export const projectYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}[-–]\d{4}$/)
  .transform((s) => s.replace('-', '–'))
  .refine((s) => Number(s.slice(5)) === Number(s.slice(0, 4)) + 1);
const team = {
  supervisor: projectPersonSchema,
  students: z.array(projectStudentSchema).min(1).max(1000),
  locale: z.enum(['en', 'ar']),
};
function uniqueTeam(
  value: {
    supervisor: { email: string };
    students: { email: string; lead: boolean }[];
  },
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  value.students.forEach((p, i) => {
    if (seen.has(p.email) || p.email === value.supervisor.email)
      ctx.addIssue({
        code: 'custom',
        path: ['students', i, 'email'],
        message: 'DUPLICATE_PERSON',
      });
    seen.add(p.email);
  });
  if (value.students.filter((p) => p.lead).length !== 1)
    ctx.addIssue({
      code: 'custom',
      path: ['students'],
      message: 'ONE_LEAD_REQUIRED',
    });
}
export const projectCreationSchema = z
  .object({
    title: text(200),
    department: z.uuid(),
    year: projectYearSchema,
    ...team,
  })
  .strict()
  .superRefine(uniqueTeam);
export const projectTeamSchema = z
  .object({
    project: z.uuid(),
    revision: z.number().int().nonnegative(),
    reason: text(400, 3).refine(
      (s) => !/(password|secret|token|cookie)\s*[:=]/i.test(s),
    ),
    ...team,
  })
  .strict()
  .superRefine(uniqueTeam);
export type ProjectCreation = z.infer<typeof projectCreationSchema>;
export type ProjectTeamChange = z.infer<typeof projectTeamSchema>;
export type ProjectPersonInput = z.infer<typeof projectPersonSchema>;
export interface ResolvedProjectPerson {
  id: string | null;
  name: string;
  email: string;
  role: 'student' | 'faculty_supervisor';
  department: string;
  status: 'active' | 'inactive';
  identity: 'existing-active' | 'existing-invitation' | 'new-invitation';
  nameMatches: boolean;
}
export interface ProjectTeamPerson {
  id: string;
  name: string;
  email: string | null;
  department: string;
  role: string;
  status: string;
  order?: number;
  lead?: boolean;
  setupComplete: boolean;
  mail: { id: string; state: string; canRetry: boolean } | null;
}
export interface GuidedProjectRecord {
  id: string;
  title: string;
  department: string;
  departmentId: string;
  year: string;
  status: string;
  revision: number;
  version: string;
  university: string;
  universityAr: string;
  locked: boolean;
  canManage: boolean;
  isLead: boolean;
  isSupervisor: boolean;
  supervisor: ProjectTeamPerson;
  authors: ProjectTeamPerson[];
  history: { action: string; reason: string; at: string }[];
}
export interface GuidedProjectList {
  rows: {
    canManage?: boolean;
    id: string;
    title: string;
    department: string;
    year: string;
    status: string;
    authorCount: number;
    supervisor: string;
  }[];
  total: number;
  page: number;
  departments: string[];
  years: string[];
}
