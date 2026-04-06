export type GlucoseSource = "excel" | "manual";

export type GlucosePoint = {
  id: string;
  datetime: Date;
  value: number;
  source: GlucoseSource;
};

export type Thresholds = {
  veryHigh: number;
  high: number;
  targetLow: number;
  targetHigh: number;
  low: number;
  veryLow: number;
};

export type NormalizedResult = {
  points: GlucosePoint[];
  invalidCount: number;
  duplicateCount: number;
};

export type Gap = {
  start: Date;
  end: Date;
  minutes: number;
};

export type AggregatedPoint = {
  id: string;
  start: Date;
  end: Date;
  avg: number;
  min: number;
  max: number;
  count: number;
  hasGap: boolean;
};

export type ChartPoint = {
  timestamp: number;
  value: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number | null;
  hasGap: boolean;
  valueInRange?: number | null;
  valueLow?: number | null;
  valueHigh?: number | null;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  bandIqr?: number;
  bandIdr?: number;
};

export type EventTrendPoint = {
  timestamp: number;
  count: number;
  avgDuration: number | null;
};
