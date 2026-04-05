import { Gap, GlucosePoint } from "@/types/glucose";

export const detectGaps = (
  points: GlucosePoint[],
  gapThresholdMinutes = 10
): Gap[] => {
  if (points.length < 2) return [];
  const gaps: Gap[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const diffMinutes = (next.datetime.getTime() - current.datetime.getTime()) / 60000;
    if (diffMinutes > gapThresholdMinutes) {
      gaps.push({
        start: current.datetime,
        end: next.datetime,
        minutes: Math.round(diffMinutes),
      });
    }
  }

  return gaps;
};
