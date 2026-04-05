import { GlucosePoint, ChartPoint } from "@/types/glucose";

export type TimeInRangeBucket = {
  key: string;
  label: string;
  range: string;
  color: string;
  count: number;
  percent: number;
};

export type TimeInRangeResult = {
  total: number;
  buckets: TimeInRangeBucket[];
};

export type EventStats = {
  count: number;
  avgMinutes: number;
};

export type AgpStats = {
  minute: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
};

export const computeMean = (points: GlucosePoint[]) => {
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => acc + point.value, 0);
  return sum / points.length;
};

export const computeStdDev = (points: GlucosePoint[], mean: number | null) => {
  if (!points.length || mean === null) return null;
  const variance =
    points.reduce((acc, point) => acc + (point.value - mean) ** 2, 0) / points.length;
  return Math.sqrt(variance);
};

export const computeEhbA1c = (mean: number | null) => {
  if (mean === null) return null;
  return (mean * 18 + 46.7) / 28.7;
};

export const computeGmi = (mean: number | null) => {
  if (mean === null) return null;
  return 3.31 + 0.02392 * mean * 18;
};

export const computeTimeInRange = (points: GlucosePoint[]): TimeInRangeResult => {
  const total = points.length;
  const buckets: TimeInRangeBucket[] = [
    {
      key: "very-high",
      label: "Очень высокий",
      range: "> 13.9",
      color: "rgba(194, 65, 12, 0.95)",
      count: 0,
      percent: 0,
    },
    {
      key: "high",
      label: "Высокий",
      range: "10.1 – 13.9",
      color: "rgba(245, 158, 11, 0.9)",
      count: 0,
      percent: 0,
    },
    {
      key: "tir",
      label: "Целевой диапазон",
      range: "3.9 – 10.0",
      color: "rgba(16, 185, 129, 0.95)",
      count: 0,
      percent: 0,
    },
    {
      key: "low",
      label: "Низкий",
      range: "3.0 – 3.8",
      color: "rgba(239, 68, 68, 0.9)",
      count: 0,
      percent: 0,
    },
    {
      key: "very-low",
      label: "Очень низкий",
      range: "< 3.0",
      color: "rgba(185, 28, 28, 0.95)",
      count: 0,
      percent: 0,
    },
  ];

  for (const point of points) {
    if (point.value > 13.9) {
      buckets[0].count += 1;
    } else if (point.value > 10) {
      buckets[1].count += 1;
    } else if (point.value >= 3.9) {
      buckets[2].count += 1;
    } else if (point.value >= 3) {
      buckets[3].count += 1;
    } else {
      buckets[4].count += 1;
    }
  }

  for (const bucket of buckets) {
    bucket.percent = total ? (bucket.count / total) * 100 : 0;
  }

  return { total, buckets };
};

export const computeTitr = (points: GlucosePoint[]) => {
  if (!points.length) return null;
  const count = points.filter((point) => point.value >= 3.9 && point.value <= 7.8).length;
  return (count / points.length) * 100;
};

export const computeEvents = (
  points: GlucosePoint[],
  comparator: (value: number) => boolean,
  gapMinutes = 10,
  sampleMinutes = 5
): EventStats => {
  if (!points.length) return { count: 0, avgMinutes: 0 };
  const sorted = [...points].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const events: number[] = [];
  let current = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i];
    const prev = sorted[i - 1];
    if (prev) {
      const diff = (point.datetime.getTime() - prev.datetime.getTime()) / 60000;
      if (diff > gapMinutes) {
        if (current > 0) events.push(current * sampleMinutes);
        current = 0;
      }
    }

    if (comparator(point.value)) {
      current += 1;
    } else if (current > 0) {
      events.push(current * sampleMinutes);
      current = 0;
    }
  }

  if (current > 0) events.push(current * sampleMinutes);

  if (!events.length) return { count: 0, avgMinutes: 0 };
  const total = events.reduce((acc, minutes) => acc + minutes, 0);
  return { count: events.length, avgMinutes: total / events.length };
};

export const computeAgpStats = (points: GlucosePoint[], bucketMinutes = 5) => {
  const bucketMap = new Map<number, number[]>();
  for (const point of points) {
    const date = point.datetime;
    const minuteOfDay = date.getHours() * 60 + date.getMinutes();
    const bucket = Math.floor(minuteOfDay / bucketMinutes) * bucketMinutes;
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
    bucketMap.get(bucket)?.push(point.value);
  }

  const statsMap = new Map<number, AgpStats>();
  bucketMap.forEach((values, minute) => {
    const p10 = percentile(values, 0.1);
    const p25 = percentile(values, 0.25);
    const p50 = percentile(values, 0.5);
    const p75 = percentile(values, 0.75);
    const p90 = percentile(values, 0.9);
    if (
      p10 === null ||
      p25 === null ||
      p50 === null ||
      p75 === null ||
      p90 === null
    ) {
      return;
    }
    statsMap.set(minute, { minute, p10, p25, p50, p75, p90 });
  });

  return statsMap;
};

export const mergeAgpIntoSeries = (
  series: ChartPoint[],
  statsMap: Map<number, AgpStats>,
  bucketMinutes = 5
): ChartPoint[] =>
  series.map((point) => {
    const date = new Date(point.timestamp);
    const minuteOfDay = date.getHours() * 60 + date.getMinutes();
    const bucket = Math.floor(minuteOfDay / bucketMinutes) * bucketMinutes;
    const stats = statsMap.get(bucket);
    if (!stats) return point;
    return {
      ...point,
      p10: stats.p10,
      p25: stats.p25,
      p50: stats.p50,
      p75: stats.p75,
      p90: stats.p90,
      bandIdr: stats.p90 - stats.p10,
      bandIqr: stats.p75 - stats.p25,
    };
  });
