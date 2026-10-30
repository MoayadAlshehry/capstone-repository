import '../../external-reviews/studio.css';
import { AccountDrafts } from '../../account-entry/drafts';
import { SemesterMemory } from '../../semester/memory';
import '../../semester/semester.css';
import '../../academic/academic.css';
import '../../assessment-studio/studio.css';
import '../../partner-studio/studio.css';
import '../../onboarding/onboarding.css';
import '../../project-onboarding/project-onboarding.css';
import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AccountDrafts>
      <SemesterMemory>{children}</SemesterMemory>
    </AccountDrafts>
  );
}
