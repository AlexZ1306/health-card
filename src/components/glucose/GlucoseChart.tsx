"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useYAxisDomain,
  XAxis,
  YAxis,
} from "recharts";
import { useId } from "react";
import { format } from "date-fns";
import { useMemo } from "react";
import { ChartPoint, Thresholds } from "@/types/glucose";
import { formatNumber, formatOptionalNumber } from "@/utils/format";
import { DEFAULT_THRESHOLDS } from "@/services/glucose/thresholds";

type GlucoseChartProps = {
  data: ChartPoint[];
  intervalMinutes: number;
  targetMin: number;
  targetMax: number;
  thresholds: Thresholds;
  showGaps: boolean;
  showRange: boolean;
  singleDay?: boolean;
  simplified?: boolean;
};

const getTickFormat = (intervalMinutes: number, singleDay?: boolean) => {
  if (singleDay) return "HH:mm";
  if (intervalMinutes >= 1440) return "dd.MM";
  if (intervalMinutes >= 180) return "dd.MM HH:mm";
  return "HH:mm";
};

const GlucoseTooltip = ({
  active,
  payload,
  intervalMinutes,
}: {
  active?: boolean;
  payload?: any[];
  intervalMinutes: number;
}) => {
  if (!active || !payload?.length) return null;
  const valueItem = payload.find((entry) => entry?.dataKey === "value");
  const item = (valueItem ?? payload[0])?.payload as ChartPoint | undefined;
  if (!item) return null;
  const thresholds = item.thresholds as Thresholds | undefined;
  const valueColor = thresholds ? colorForValue(item.value ?? null, thresholds) : undefined;
  const showAggregates = intervalMinutes > 5;

  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 text-sm shadow-sm">
      <div className="text-xs text-muted-foreground">
        {format(new Date(item.timestamp), "dd.MM.yyyy HH:mm")}
      </div>
      <div className="mt-2 grid gap-1">
        <div className="font-semibold text-foreground" style={valueColor ? { color: valueColor } : undefined}>
          {item.value === null ? "Нет данных" : `${formatOptionalNumber(item.value)} mmol/L`}
        </div>
        {showAggregates && item.value !== null && (
          <div className="text-xs text-muted-foreground">
            avg {formatOptionalNumber(item.avg)} • min {formatOptionalNumber(item.min)} • max{" "}
            {formatOptionalNumber(item.max)}
          </div>
        )}
        {showAggregates && item.count !== null && (
          <div className="text-xs text-muted-foreground">точек: {item.count}</div>
        )}
        {item.hasGap && (
          <div className="text-xs font-medium text-amber-600">Есть разрыв</div>
        )}
      </div>
    </div>
  );
};

const COLOR_HIGH = "#FFB800";
const COLOR_IN = "#3B79FF";
const COLOR_LOW = "#D61B20";

const colorForValue = (value: number | null, thresholds: Thresholds) => {
  if (value === null) return "hsl(var(--foreground))";
  if (value > thresholds.targetHigh) return COLOR_HIGH;
  if (value < thresholds.targetLow) return COLOR_LOW;
  return COLOR_IN;
};

const ActiveDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const thresholds = payload.thresholds as Thresholds | undefined;
  const fill = thresholds ? colorForValue(payload.value ?? null, thresholds) : "hsl(var(--foreground))";
  return <circle cx={cx} cy={cy} r={3} fill={fill} stroke="#fff" strokeWidth={1} />;
};

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clampThreshold = (value: number) => Math.min(50, Math.max(0.1, value));

const ThresholdGradient = ({
  id,
  thresholds,
  fallbackDomain,
}: {
  id: string;
  thresholds: Thresholds;
  fallbackDomain: [number, number];
}) => {
  const plotArea = usePlotArea();
  const domain = useYAxisDomain();
  if (!plotArea) {
    return null;
  }
  const sourceDomain = Array.isArray(domain) && domain.length >= 2 ? domain : fallbackDomain;
  const d0 = Number(sourceDomain[0]);
  const d1 = Number(sourceDomain[1]);
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1) {
    return null;
  }
  const min = Math.min(d0, d1);
  const max = Math.max(d0, d1);
  const chartTop = plotArea.y;
  const chartBottom = plotArea.y + plotArea.height;

  const offset = (value: number) => clamp01((max - value) / (max - min));
  const tHigh = offset(thresholds.targetHigh);
  const tLow = offset(thresholds.targetLow);

  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1={chartTop}
        x2="0"
        y2={chartBottom}
      >
        <stop offset="0" stopColor={COLOR_HIGH} />
        <stop offset={tHigh} stopColor={COLOR_HIGH} />
        <stop offset={tHigh} stopColor={COLOR_IN} />
        <stop offset={tLow} stopColor={COLOR_IN} />
        <stop offset={tLow} stopColor={COLOR_LOW} />
        <stop offset="1" stopColor={COLOR_LOW} />
      </linearGradient>
    </defs>
  );
};

export const GlucoseChart = ({
  data,
  intervalMinutes,
  targetMin,
  targetMax,
  thresholds,
  showGaps,
  showRange,
  singleDay,
  simplified = false,
}: GlucoseChartProps) => {
  if (!data.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        Нет данных для отображения
      </div>
    );
  }

  const tickFormat = getTickFormat(intervalMinutes, singleDay);
  const baseData = showGaps ? data : data.filter((point) => point.value !== null);
  const gradientId = `glucose-gradient-${useId().replace(/:/g, "")}`;
  const safeThresholds = useMemo(() => {
    const values = Object.values(thresholds);
    if (values.some((value) => !Number.isFinite(value))) {
      return DEFAULT_THRESHOLDS;
    }
    return {
      veryHigh: clampThreshold(thresholds.veryHigh),
      high: clampThreshold(thresholds.high),
      targetLow: clampThreshold(thresholds.targetLow),
      targetHigh: clampThreshold(thresholds.targetHigh),
      low: clampThreshold(thresholds.low),
      veryLow: clampThreshold(thresholds.veryLow),
    };
  }, [thresholds]);
  const rangeMin = Math.min(safeThresholds.targetLow, safeThresholds.targetHigh);
  const rangeMax = Math.max(safeThresholds.targetLow, safeThresholds.targetHigh);
  const [domainMin, domainMax] = useMemo(() => {
    const values: number[] = [];
    for (const point of baseData) {
      if (isFiniteNumber(point.value)) values.push(point.value);
      if (isFiniteNumber(point.min)) values.push(point.min);
      if (isFiniteNumber(point.max)) values.push(point.max);
    }
    const fallbackMin = thresholds.veryLow ?? 0;
    const fallbackMax = thresholds.veryHigh ?? 1;
    const minValue = values.length ? Math.min(...values) : fallbackMin;
    const maxValue = values.length ? Math.max(...values) : fallbackMax;
    const withThresholdsMin = Math.min(
      minValue,
      safeThresholds.veryLow,
      safeThresholds.low,
      safeThresholds.targetLow
    );
    const withThresholdsMax = Math.max(
      maxValue,
      safeThresholds.veryHigh,
      safeThresholds.high,
      safeThresholds.targetHigh
    );
    const pad = Math.max(0.5, (withThresholdsMax - withThresholdsMin) * 0.05);
    return [withThresholdsMin - pad, withThresholdsMax + pad];
  }, [baseData, safeThresholds]);

  const ticks = useMemo(() => {
    if (!baseData.length) return [];
    const timestamps = baseData.map((point) => point.timestamp);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    if (min === max) return [min];

    const totalMinutes = (max - min) / 60000;
    const candidates = Array.from(
      new Set([intervalMinutes, 10, 15, 30, 60, 120, 180, 360, 720, 1440].filter((v) => v > 0))
    ).sort((a, b) => a - b);

    let step = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      if (totalMinutes / candidate <= 10) {
        step = candidate;
        break;
      }
    }

    if (totalMinutes / step > 10) {
      step = Math.ceil(totalMinutes / 10);
    }

    const stepMs = step * 60 * 1000;
    const firstTick = Math.ceil(min / stepMs) * stepMs;
    const ticks: number[] = [];
    for (let t = firstTick; t <= max; t += stepMs) {
      ticks.push(t);
    }
    return Array.from(new Set(ticks));
  }, [baseData, intervalMinutes]);

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={baseData.map((point) => ({ ...point, thresholds: safeThresholds }))}>
          <ThresholdGradient
            id={gradientId}
            thresholds={safeThresholds}
            fallbackDomain={[domainMin, domainMax]}
          />
          <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={(value) => format(new Date(value), tickFormat)}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            scale="time"
            minTickGap={18}
            interval={0}
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickFormatter={(value) => formatNumber(value, 1)}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={[domainMin, domainMax]}
            allowDataOverflow
          />
          <Tooltip
            content={<GlucoseTooltip intervalMinutes={intervalMinutes} />}
            shared={true}
            isAnimationActive={false}
          />
          {showRange ? (
            <>
              <ReferenceArea
                y1={rangeMin}
                y2={rangeMax}
                fill="rgba(16, 185, 129, 0.04)"
                strokeOpacity={0}
              />
              <ReferenceLine
                y={rangeMin}
                stroke="rgba(16, 185, 129, 0.4)"
                strokeDasharray="4 4"
              />
              <ReferenceLine
                y={rangeMax}
                stroke="rgba(16, 185, 129, 0.4)"
                strokeDasharray="4 4"
              />
            </>
          ) : null}
          {simplified ? (
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${gradientId})`}
              strokeWidth={2.4}
              dot={false}
              activeDot={<ActiveDot />}
              connectNulls={!showGaps}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive={false}
            />
          ) : (
            <>
              <Line
                type="monotone"
                dataKey="value"
                stroke={`url(#${gradientId})`}
                strokeWidth={2.6}
                dot={false}
                activeDot={<ActiveDot />}
                connectNulls={!showGaps}
                isAnimationActive={false}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
