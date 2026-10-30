/** Exact quarter-point progression; no rounding can cross a threshold. */
export function progressionDecision(
  quarterPoints: readonly number[],
  paused = false,
) {
  if (
    quarterPoints.some((q) => !Number.isInteger(q) || q < 0 || q > 400) ||
    quarterPoints.length > 10
  )
    throw Error('INVALID_EXTERNAL_COVERAGE');
  const n = quarterPoints.length,
    sum = quarterPoints.reduce((a, b) => a + b, 0),
    minimum = n ? Math.min(...quarterPoints) : null,
    maximum = n ? Math.max(...quarterPoints) : null,
    range = minimum === null ? null : maximum! - minimum;
  const threshold = n >= 2 && n < 10 ? 80 + 2 * (n - 2) : null;
  const reasons: string[] = [];
  if (n < 2) reasons.push('initial_pair_incomplete');
  else if (n === 10) reasons.push('completed_limit');
  else {
    if (paused) reasons.push('quality_pause_latched');
    if (sum < n * threshold! * 4) reasons.push('mean_below_threshold');
    if (minimum! < 280) reasons.push('external_score_floor');
    if (range! > 80) reasons.push('external_range_exceeded');
  }
  return {
    n,
    sumQuarterPoints: sum,
    mean: n ? { numerator: sum, denominator: 4 * n } : null,
    rangeQuarterPoints: range,
    threshold,
    state:
      n < 2
        ? 'queued_initial'
        : n === 10
          ? 'completed_limit'
          : reasons.length
            ? 'paused_quality'
            : 'queued_expansion',
    reasons,
  };
}
