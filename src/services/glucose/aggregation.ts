import { AggregatedPoint, ChartPoint, Gap, GlucosePoint } from "@/types/glucose";
import { createId } from "@/utils/id";

export type AggregationOption = {
  key: string;
  label: string;
  minutes: number;
};

export const AGGREGATION_OPTIONS: AggregationOption[] = [
  { key: "5m", label: "5 минут", minutes: 5 },
  { key: "10m", label: "10 минут", minutes: 10 },
  { key: "15m", label: "15 минут", minutes: 15 },
  { key: "30m", label: "30 минут", minutes: 30 },
  { key: "1h", label: "1 час", minutes: 60 },
  { key: "3h", label: "3 часа", minutes: 180 },
  { key: "6h", label: "6 часов", minutes: 360 },
  { key: "1d", label: "1 день", minutes: 1440 },
];

const getBucketStart = (time: Date, minutes: number) => {
  const ms = minutes * 60 * 1000;
  return Math.floor(time.getTime() / ms) * ms;
};

export const aggregateGlucosePoints = (
  points: GlucosePoint[],
  intervalMinutes: number,
  gaps: Gap[]
): AggregatedPoint[] => {
  if (!points.length) return [];
  if (intervalMinutes <= 5) {
    return points.map((point) => ({
      id: point.id,
      start: point.datetime,
      end: point.datetime,
      avg: point.value,
      min: point.value,
      max: point.value,
      count: 1,
      hasGap: false,
    }));
  }

  const bucketMap = new Map<number, AggregatedPoint>();
  const gapBucketKeys = new Set<number>();
  const intervalMs = intervalMinutes * 60 * 1000;

  for (const gap of gaps) {
    gapBucketKeys.add(getBucketStart(gap.start, intervalMinutes));
  }

  for (const point of points) {
    const bucketStart = getBucketStart(point.datetime, intervalMinutes);
    const bucketEnd = new Date(bucketStart + intervalMs);
    const existing = bucketMap.get(bucketStart);

    if (!existing) {
      bucketMap.set(bucketStart, {
        id: createId(),
        start: new Date(bucketStart),
        end: bucketEnd,
        avg: point.value,
        min: point.value,
        max: point.value,
        count: 1,
        hasGap: gapBucketKeys.has(bucketStart),
      });
      continue;
    }

    existing.min = Math.min(existing.min, point.value);
    existing.max = Math.max(existing.max, point.value);
    existing.avg = existing.avg + point.value;
    existing.count += 1;
  }

  const aggregated = Array.from(bucketMap.values()).map((bucket) => ({
    ...bucket,
    avg: bucket.avg / bucket.count,
  }));

  aggregated.sort((a, b) => a.start.getTime() - b.start.getTime());
  return aggregated;
};

export const buildChartSeries = (
  aggregated: AggregatedPoint[],
  gaps: Gap[],
  showGaps = true
): ChartPoint[] => {
  if (!aggregated.length) return [];

  const baseSeries: ChartPoint[] = aggregated.map((item) => ({
    timestamp: item.start.getTime(),
    value: item.avg,
    avg: item.avg,
    min: item.min,
    max: item.max,
    count: item.count,
    hasGap: item.hasGap,
  }));

  if (!gaps.length || !showGaps) return baseSeries;

  const seriesWithGaps: ChartPoint[] = [];
  let gapIndex = 0;

  for (let i = 0; i < baseSeries.length; i += 1) {
    const current = baseSeries[i];
    const next = baseSeries[i + 1];
    seriesWithGaps.push(current);

    while (gapIndex < gaps.length) {
      const gapStart = gaps[gapIndex].start.getTime();
      if (gapStart <= current.timestamp) {
        gapIndex += 1;
        continue;
      }
      if (next && gapStart < next.timestamp) {
        seriesWithGaps.push({
          timestamp: gapStart,
          value: null,
          avg: null,
          min: null,
          max: null,
          count: null,
          hasGap: true,
        });
        gapIndex += 1;
        continue;
      }
      break;
    }
  }

  return seriesWithGaps;
};
