import { GlucosePoint, NormalizedResult } from "@/types/glucose";

const isValidValue = (value: number) => Number.isFinite(value) && value > 0 && value <= 50;

export const normalizeGlucosePoints = (points: GlucosePoint[]): NormalizedResult => {
  let invalidCount = 0;
  let duplicateCount = 0;

  const filtered = points.filter((point) => {
    const isValidDate = point.datetime instanceof Date && !Number.isNaN(point.datetime.getTime());
    const isValid = isValidDate && isValidValue(point.value);
    if (!isValid) invalidCount += 1;
    return isValid;
  });

  const seen = new Set<string>();
  const deduped: GlucosePoint[] = [];

  for (const point of filtered) {
    const key = `${point.datetime.getTime()}|${point.value}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    deduped.push(point);
  }

  deduped.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

  return { points: deduped, invalidCount, duplicateCount };
};
