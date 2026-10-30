export interface EvaluationSummary {
  internal: { numerator: number; denominator: 20 } | null;
  n: number;
  external: {
    numerator: number;
    denominator: number;
    rangeQuarterPoints: number;
  } | null;
  coreRubric: string;
  externalRubric: string;
  policy: string;
  aggregateAt: string | null;
  pausedQuality: boolean;
  distinction: boolean;
  corrected: boolean;
  aggregateChanged: boolean;
}
