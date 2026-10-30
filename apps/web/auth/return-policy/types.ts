// Client-safe display projections of existing service DTOs; no database runtime imports.
export interface ManagedAccountRow {
  id: string;
  full_name: string;
  email: string;
  role_code: string;
  account_status: string;
  student_id: string | null;
  department_id: string | null;
  university_id: string | null;
  lifecycle?: {
    purpose: string;
    state: string;
    issuedAt: string;
    expiresAt: string;
  }[];
}

interface AssignmentPerson {
  id: string;
  name: string;
  department?: string;
  status?: string;
  order?: number;
  lead?: boolean;
}
interface AssignmentGroup {
  id: string;
  code: string;
  department: string;
  used: boolean;
  members: AssignmentPerson[];
}
export interface ProjectShell {
  id: string;
  group: string;
  department: string;
  university: string;
  universityAr: string;
  row_version: number;
  status: string;
  version: string;
  locked: boolean;
  authored: boolean;
  lead: boolean;
  supervised: boolean;
  supervisor: AssignmentPerson;
  authors: AssignmentPerson[];
}
export interface AssignmentView {
  groups: AssignmentGroup[];
  students: AssignmentPerson[];
  faculty: AssignmentPerson[];
  projects: ProjectShell[];
}
