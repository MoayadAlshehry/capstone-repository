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
interface ProjectTeamPerson {
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
