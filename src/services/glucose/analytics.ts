import {
  GlucosePoint,
  ChartPoint,
  Thresholds,
  EventTrendPoint,
  EventIntensityPoint,
  EventVelocityPoint,
} from "@/types/glucose";

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

type EventWindow = {
  start: Date;
  end: Date;
  durationMinutes: number;
};

type EventVelocityWindow = {
  start: Date;
  end: Date;
  maxVelocity: number;
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

const formatThreshold = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);

export const computeTimeInRange = (
  points: GlucosePoint[],
  thresholds: Thresholds
): TimeInRangeResult => {
  const total = points.length;
  const veryHighLabel = `> ${formatThreshold(thresholds.veryHigh)}`;
  const highLabel = `${formatThreshold(thresholds.high)} – ${formatThreshold(
    thresholds.veryHigh
  )}`;
  const targetLabel = `${formatThreshold(thresholds.targetLow)} – ${formatThreshold(
    thresholds.targetHigh
  )}`;
  const lowLabel = `${formatThreshold(thresholds.low)} – ${formatThreshold(
    thresholds.targetLow
  )}`;
  const veryLowLabel = `< ${formatThreshold(thresholds.veryLow)}`;

  const buckets: TimeInRangeBucket[] = [
    {
      key: "very-high",
      label: "Очень высокий",
      range: veryHighLabel,
      color: "#FFB800",
      count: 0,
      percent: 0,
    },
    {
      key: "high",
      label: "Высокий",
      range: highLabel,
      color: "#FFDD86",
      count: 0,
      percent: 0,
    },
    {
      key: "tir",
      label: "Целевой диапазон",
      range: targetLabel,
      color: "#3B78FF",
      count: 0,
      percent: 0,
    },
    {
      key: "low",
      label: "Низкий",
      range: lowLabel,
      color: "#FF9090",
      count: 0,
      percent: 0,
    },
    {
      key: "very-low",
      label: "Очень низкий",
      range: veryLowLabel,
      color: "#F12828",
      count: 0,
      percent: 0,
    },
  ];

  for (const point of points) {
    if (point.value > thresholds.veryHigh) {
      buckets[0].count += 1;
    } else if (point.value >= thresholds.high) {
      buckets[1].count += 1;
    } else if (
      point.value >= thresholds.targetLow &&
      point.value <= thresholds.targetHigh
    ) {
      buckets[2].count += 1;
    } else if (point.value >= thresholds.low) {
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

export const computeTitr = (points: GlucosePoint[], thresholds: Thresholds) => {
  if (!points.length) return null;
  const upper = Math.min(7.8, thresholds.targetHigh);
  const count = points.filter(
    (point) => point.value >= thresholds.targetLow && point.value <= upper
  ).length;
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

const extractEventWindows = (
  points: GlucosePoint[],
  comparator: (value: number) => boolean,
  gapMinutes = 10,
  sampleMinutes = 5
): EventWindow[] => {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const windows: EventWindow[] = [];
  let currentStart: Date | null = null;
  let currentCount = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i];
    const prev = sorted[i - 1];

    if (prev) {
      const diff = (point.datetime.getTime() - prev.datetime.getTime()) / 60000;
      if (diff > gapMinutes) {
        if (currentCount > 0 && currentStart) {
          windows.push({
            start: currentStart,
            end: prev.datetime,
            durationMinutes: currentCount * sampleMinutes,
          });
        }
        currentStart = null;
        currentCount = 0;
      }
    }

    if (comparator(point.value)) {
      if (currentCount === 0) {
        currentStart = point.datetime;
      }
      currentCount += 1;
    } else if (currentCount > 0 && currentStart) {
      windows.push({
        start: currentStart,
        end: prev ? prev.datetime : point.datetime,
        durationMinutes: currentCount * sampleMinutes,
      });
      currentStart = null;
      currentCount = 0;
    }
  }

  if (currentCount > 0 && currentStart) {
    const last = sorted[sorted.length - 1];
    windows.push({
      start: currentStart,
      end: last.datetime,
      durationMinutes: currentCount * sampleMinutes,
    });
  }

  return windows;
};

const extractEventVelocityWindows = (
  points: GlucosePoint[],
  comparator: (value: number) => boolean,
  gapMinutes = 10
): EventVelocityWindow[] => {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const windows: EventVelocityWindow[] = [];
  let currentStart: Date | null = null;
  let currentEnd: Date | null = null;
  let currentMax: number | null = null;
  let prevOutside = false;
  let prevTime: number | null = null;
  let prevValue: number | null = null;

  for (const point of sorted) {
    const time = point.datetime.getTime();
    if (prevTime !== null) {
      const diff = (time - prevTime) / 60000;
      if (diff > gapMinutes) {
        if (currentStart && currentEnd && currentMax !== null) {
          windows.push({
            start: currentStart,
            end: currentEnd,
            maxVelocity: currentMax,
          });
        }
        currentStart = null;
        currentEnd = null;
        currentMax = null;
        prevOutside = false;
      }
    }

    const outside = comparator(point.value);
    if (outside) {
      if (!prevOutside) {
        currentStart = point.datetime;
        currentEnd = point.datetime;
        currentMax = null;
      }
      if (prevTime !== null && prevValue !== null) {
        const minutes = (time - prevTime) / 60000;
        if (minutes > 0 && minutes <= gapMinutes) {
          const velocity = Math.abs((point.value - prevValue) / minutes);
          currentMax = currentMax === null ? velocity : Math.max(currentMax, velocity);
        }
      }
      currentEnd = point.datetime;
    } else if (prevOutside) {
      if (currentStart && currentEnd && currentMax !== null) {
        windows.push({
          start: currentStart,
          end: currentEnd,
          maxVelocity: currentMax,
        });
      }
      currentStart = null;
      currentEnd = null;
      currentMax = null;
    }

    prevOutside = outside;
    prevTime = time;
    prevValue = point.value;
  }

  if (currentStart && currentEnd && currentMax !== null) {
    windows.push({ start: currentStart, end: currentEnd, maxVelocity: currentMax });
  }

  return windows;
};


export const buildEventTrendSeries = (
  points: GlucosePoint[],
  comparator: (value: number) => boolean,
  intervalMinutes: number,
  periodStart?: Date | null,
  periodEnd?: Date | null,
  gapMinutes = 10,
  sampleMinutes = 5
): EventTrendPoint[] => {
  if (!points.length || intervalMinutes <= 0) return [];
  const sorted = [...points].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const rangeStart = periodStart ?? sorted[0].datetime;
  const rangeEnd = periodEnd ?? sorted[sorted.length - 1].datetime;
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return [];

  const events = extractEventWindows(sorted, comparator, gapMinutes, sampleMinutes).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const stepMs = intervalMinutes * 60 * 1000;
  const series: EventTrendPoint[] = [];
  let eventIndex = 0;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const bucketEnd = t + stepMs;
    let count = 0;
    let durationSum = 0;

    while (eventIndex < events.length && events[eventIndex].start.getTime() < t) {
      eventIndex += 1;
    }

    let scanIndex = eventIndex;
    while (scanIndex < events.length) {
      const eventStart = events[scanIndex].start.getTime();
      if (eventStart >= bucketEnd) break;
      count += 1;
      durationSum += events[scanIndex].durationMinutes;
      scanIndex += 1;
    }

    eventIndex = scanIndex;

    series.push({
      timestamp: t,
      count,
      avgDuration: count > 0 ? durationSum / count : null,
    });
  }

  return series;
};

export const buildEventIntensitySeries = (
  points: GlucosePoint[],
  mode: "hypo" | "hyper",
  thresholds: Thresholds,
  intervalMinutes: number,
  periodStart?: Date | null,
  periodEnd?: Date | null,
  gapMinutes = 10,
  sampleMinutes = 5
): EventIntensityPoint[] => {
  if (!points.length || intervalMinutes <= 0) return [];
  const sorted = [...points].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const rangeStart = periodStart ?? sorted[0].datetime;
  const rangeEnd = periodEnd ?? sorted[sorted.length - 1].datetime;
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return [];

  const comparator =
    mode === "hypo"
      ? (value: number) => value < thresholds.targetLow
      : (value: number) => value > thresholds.targetHigh;
  const threshold = mode === "hypo" ? thresholds.targetLow : thresholds.targetHigh;
  const stepMs = intervalMinutes * 60 * 1000;
  const bucketCount = Math.floor((endMs - startMs) / stepMs) + 1;
  const auc = new Array<number>(bucketCount).fill(0);
  const sumValue = new Array<number>(bucketCount).fill(0);
  const sampleCount = new Array<number>(bucketCount).fill(0);
  const eventCount = new Array<number>(bucketCount).fill(0);
  const extremeValue = new Array<number>(bucketCount).fill(
    mode === "hyper" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  );
  const weight = sampleMinutes / 5;

  let prevOutside = false;
  let prevTime: number | null = null;

  for (const point of sorted) {
    const time = point.datetime.getTime();
    if (time < startMs || time > endMs) continue;
    if (prevTime !== null) {
      const diff = (time - prevTime) / 60000;
      if (diff > gapMinutes) {
        prevOutside = false;
      }
    }
    const outside = comparator(point.value);
    if (outside) {
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((time - startMs) / stepMs)));
      const delta = mode === "hyper" ? point.value - threshold : threshold - point.value;
      auc[idx] += Math.max(0, delta) * weight;
      sumValue[idx] += point.value;
      sampleCount[idx] += 1;
      extremeValue[idx] =
        mode === "hyper"
          ? Math.max(extremeValue[idx], point.value)
          : Math.min(extremeValue[idx], point.value);
      if (!prevOutside) {
        eventCount[idx] += 1;
      }
    }
    prevOutside = outside;
    prevTime = time;
  }

  const series: EventIntensityPoint[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const hasSamples = sampleCount[i] > 0;
    series.push({
      timestamp: startMs + i * stepMs,
      auc: hasSamples ? auc[i] : null,
      avgValue: hasSamples ? sumValue[i] / sampleCount[i] : null,
      extremeValue: hasSamples ? extremeValue[i] : null,
      eventCount: eventCount[i],
    });
  }

  return series;
};

export const buildEventVelocitySeries = (
  points: GlucosePoint[],
  mode: "hypo" | "hyper",
  thresholds: Thresholds,
  intervalMinutes: number,
  periodStart?: Date | null,
  periodEnd?: Date | null,
  gapMinutes = 10
): EventVelocityPoint[] => {
  if (!points.length || intervalMinutes <= 0) return [];
  const sorted = [...points].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const rangeStart = periodStart ?? sorted[0].datetime;
  const rangeEnd = periodEnd ?? sorted[sorted.length - 1].datetime;
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return [];

  const comparator =
    mode === "hypo"
      ? (value: number) => value < thresholds.targetLow
      : (value: number) => value > thresholds.targetHigh;
  const events = extractEventVelocityWindows(sorted, comparator, gapMinutes).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const stepMs = intervalMinutes * 60 * 1000;
  const series: EventVelocityPoint[] = [];
  let eventIndex = 0;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const bucketEnd = t + stepMs;
    let maxVelocity: number | null = null;
    let eventCount = 0;

    while (eventIndex < events.length && events[eventIndex].start.getTime() < t) {
      eventIndex += 1;
    }

    let scanIndex = eventIndex;
    while (scanIndex < events.length) {
      const eventStart = events[scanIndex].start.getTime();
      if (eventStart >= bucketEnd) break;
      const velocity = events[scanIndex].maxVelocity;
      if (Number.isFinite(velocity)) {
        maxVelocity = maxVelocity === null ? velocity : Math.max(maxVelocity, velocity);
        eventCount += 1;
      }
      scanIndex += 1;
    }

    eventIndex = scanIndex;

    series.push({
      timestamp: t,
      maxVelocity,
      eventCount,
    });
  }

  return series;
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
