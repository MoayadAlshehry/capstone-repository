import { z } from 'zod';
const safeText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]*$/u);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u);
export const universityIdentitySchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
    name_en: safeText(120),
    name_ar: safeText(120),
  })
  .strict();
export const administratorInvitationSchema = z
  .object({
    university: z.uuid(),
    name: safeText(200),
    email,
    locale: z.enum(['en', 'ar']),
  })
  .strict();
export const personInvitationSchema = z
  .object({
    name: safeText(200),
    email,
    role: z.enum(['student', 'faculty_supervisor']),
    department: z.uuid(),
    locale: z.enum(['en', 'ar']),
  })
  .strict();
export const institutionStatusSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['active', 'suspended']),
    revision: z.string().min(1).max(60),
    reason: safeText(400, 3).refine(
      (s) => !/password|token|cookie|postgres(?:ql)?:/i.test(s),
    ),
  })
  .strict();
export const onboardingSchemas = {
  'university.create': universityIdentitySchema,
  'administrator.invite': administratorInvitationSchema,
  'person.invite': personInvitationSchema,
  'university.status': institutionStatusSchema,
  'person.status': institutionStatusSchema,
};
export const canonicalDepartments = [
  { code: 'CS', name: 'Computer Science', nameAr: 'علوم الحاسب' },
  { code: 'IS', name: 'Information Systems', nameAr: 'نظم المعلومات' },
  { code: 'CE', name: 'Computer Engineering', nameAr: 'هندسة الحاسب' },
] as const;
export interface DepartmentOption {
  id: string;
  code: string;
  name: string;
  nameAr: string;
}
export interface OnboardingRow {
  id: string;
  name: string;
  nameAr?: string;
  code?: string;
  email?: string;
  role?: string;
  department?: string;
  status: string;
}
export interface OnboardingList {
  rows: OnboardingRow[];
  total: number;
  page: number;
  pageSize: number;
}
export interface InstitutionRecord extends OnboardingRow {
  code: string;
  nameAr: string;
  revision: string;
  createdAt: string;
  departments: DepartmentOption[];
  administrators: PersonRecord[];
  history: { action: string; reason: string; at: string }[];
}
export interface PersonRecord extends OnboardingRow {
  email: string;
  role: string;
  revision: string;
  department?: string;
  departmentName?: string;
  departmentNameAr?: string;
  university: string;
  universityName?: string;
  universityNameAr?: string;
}
export interface OnboardingResult {
  id: string;
  university: string;
  reused: boolean;
}
