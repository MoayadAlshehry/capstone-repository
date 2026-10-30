import type { CriterionInput } from '@capstone/domain';
type Bilingual = { en: string; ar: string };
export interface EvaluationView {
  submission: string;
  rubric: {
    code: string;
    hash: string;
    levels: { en: string[]; ar: string[] };
    calibration: Bilingual;
    criteria: {
      code: string;
      weight: number;
      label: Bilingual;
      description: Bilingual;
      anchors: { level: number; en: string; ar: string }[];
    }[];
  };
  assessments: {
    id: string;
    layer: string;
    total: number;
    recorded_by: string;
    recorded_at: string;
    finalized_at: string;
    overall_comment: string;
    member_names: string[];
    assessed_on: string | null;
    criteria: CriterionInput[];
  }[];
  supervisor: number | null;
  committee: number | null;
  internal: number | null;
  disagreement: boolean;
}
