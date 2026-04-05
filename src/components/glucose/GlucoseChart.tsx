"use client";

import {
  Area,
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { curveMonotoneX, line as d3Line } from "d3-shape";
import { useId } from "react";
import { format } from "date-fns";
import { useMemo } from "react";
import { ChartPoint, Thresholds } from "@/types/glucose";
import { formatOptionalNumber } from "@/utils/format";

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

const GlucoseTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const valueItem = payload.find((entry) => entry?.dataKey === "value");
  const item = (valueItem ?? payload[0])?.payload as ChartPoint | undefined;
  if (!item) return null;

  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 text-sm shadow-sm">
      <div className="text-xs text-muted-foreground">
        {format(new Date(item.timestamp), "dd.MM.yyyy HH:mm")}
      </div>
      <div className="mt-2 grid gap-1">
        <div className="font-semibold text-foreground">
          {item.value === null ? "Нет данных" : `${formatOptionalNumber(item.value)} mmol/L`}
        </div>
        {item.value !== null && (
          <div className="text-xs text-muted-foreground">
            avg {formatOptionalNumber(item.avg)} • min {formatOptionalNumber(item.min)} • max{" "}
            {formatOptionalNumber(item.max)}
          </div>
        )}
        {item.count !== null && (
          <div className="text-xs text-muted-foreground">точек: {item.count}</div>
        )}
        {item.hasGap && (
          <div className="text-xs font-medium text-amber-600">Есть разрыв</div>
        )}
      </div>
    </div>
  );
};

const COLOR_VERY_HIGH = "#FFB800";
const COLOR_HIGH = "#FFDD86";
const COLOR_IN = "#3B78FF";
const COLOR_LOW = "#FF9090";
const COLOR_VERY_LOW = "#F12828";

const colorForValue = (value: number | null, thresholds: Thresholds) => {
  if (value === null) return "hsl(var(--foreground))";
  const highStart = Math.min(thresholds.high, thresholds.targetHigh);
  if (value >= thresholds.veryHigh) return COLOR_VERY_HIGH;
  if (value >= highStart) return COLOR_HIGH;
  if (value >= thresholds.targetLow) return COLOR_IN;
  if (value < thresholds.veryLow) return COLOR_VERY_LOW;
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

const ColoredSegments = ({
  chunks,
  thresholds,
  xAxisMap,
  yAxisMap,
}: {
  chunks: { timestamp: number; value: number }[][];
  thresholds: Thresholds;
  xAxisMap?: Record<string, any>;
  yAxisMap?: Record<string, any>;
}) => {
  const clipId = useId();
  const xAxis = xAxisMap ? Object.values(xAxisMap)[0] : null;
  const yAxis = yAxisMap ? Object.values(yAxisMap)[0] : null;
  if (!xAxis || !yAxis) return null;
  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  if (!xScale || !yScale) return null;

  const xRange = xScale.range ? xScale.range() : [0, 0];
  const chartLeft = Math.min(xRange[0], xRange[1]);
  const chartRight = Math.max(xRange[0], xRange[1]);
  const chartWidth = chartRight - chartLeft;

  const yRange = yScale.range ? yScale.range() : [0, 0];
  const chartTop = Math.min(yRange[0], yRange[1]);
  const chartBottom = Math.max(yRange[0], yRange[1]);

  const bandRect = (min: number, max: number) => {
    const top = max === Infinity ? chartTop : yScale(max);
    const bottom = min === -Infinity ? chartBottom : yScale(min);
    const y = Math.min(top, bottom);
    const height = Math.abs(bottom - top);
    return { y, height };
  };

  const highStart = Math.min(thresholds.high, thresholds.targetHigh);

  const bands = [
    {
      key: "very-high",
      color: COLOR_VERY_HIGH,
      min: thresholds.veryHigh,
      max: Infinity,
    },
    {
      key: "high",
      color: COLOR_HIGH,
      min: highStart,
      max: thresholds.veryHigh,
    },
    {
      key: "in-range",
      color: COLOR_IN,
      min: thresholds.targetLow,
      max: thresholds.targetHigh,
    },
    {
      key: "low",
      color: COLOR_LOW,
      min: thresholds.veryLow,
      max: thresholds.targetLow,
    },
    {
      key: "very-low",
      color: COLOR_VERY_LOW,
      min: -Infinity,
      max: thresholds.veryLow,
    },
  ];

  const basePathBuilder = d3Line<{ timestamp: number; value: number }>()
    .x((d) => xScale(d.timestamp))
    .y((d) => yScale(d.value))
    .curve(curveMonotoneX);

  return (
    <g>
      <defs>
        {bands.map((band) => {
          const rect = bandRect(band.min, band.max);
          return (
            <clipPath key={band.key} id={`${clipId}-${band.key}`}>
              <rect x={chartLeft} y={rect.y} width={chartWidth} height={rect.height} />
            </clipPath>
          );
        })}
      </defs>
      {bands.map((band) => (
        <g key={band.key} clipPath={`url(#${clipId}-${band.key})`}>
          {chunks.map((chunk, index) => {
            const path = basePathBuilder(chunk);
            if (!path) return null;
            return (
              <path
                key={`${band.key}-${index}`}
                d={path}
                fill="none"
                stroke={band.color}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </g>
      ))}
    </g>
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
  const rangeMin = Math.min(targetMin, targetMax);
  const rangeMax = Math.max(targetMin, targetMax);
  const baseData = showGaps ? data : data.filter((point) => point.value !== null);
  const lineChunks = useMemo(() => {
    const chunks: { timestamp: number; value: number }[][] = [];
    let current: { timestamp: number; value: number }[] = [];
    for (const point of baseData) {
      if (point.value === null) {
        if (showGaps && current.length) {
          chunks.push(current);
          current = [];
        }
        continue;
      }
      current.push({ timestamp: point.timestamp, value: point.value });
    }
    if (current.length) chunks.push(current);
    return chunks;
  }, [baseData, showGaps]);
  const hasAgp = baseData.some(
    (point) =>
      point.p10 !== undefined &&
      point.p25 !== undefined &&
      point.p50 !== undefined &&
      point.p75 !== undefined &&
      point.p90 !== undefined
  );

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
        <LineChart data={baseData.map((point) => ({ ...point, thresholds }))}>
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
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<GlucoseTooltip />} shared={true} isAnimationActive={false} />
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
          {hasAgp ? (
            <>
              <Area
                type="monotone"
                dataKey="p10"
                stackId="idr"
                tooltipType="none"
                stroke="none"
                fill="transparent"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="bandIdr"
                stackId="idr"
                tooltipType="none"
                stroke="none"
                fill="rgba(37, 99, 235, 0.08)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="p25"
                stackId="iqr"
                tooltipType="none"
                stroke="none"
                fill="transparent"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="bandIqr"
                stackId="iqr"
                tooltipType="none"
                stroke="none"
                fill="rgba(37, 99, 235, 0.16)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="p50"
                tooltipType="none"
                stroke="rgba(37, 99, 235, 0.7)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </>
          ) : null}
          {simplified ? (
            <Line
              type="monotone"
              dataKey="value"
              stroke={COLOR_IN}
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
              <Customized component={<ColoredSegments chunks={lineChunks} thresholds={thresholds} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="rgba(0,0,0,0)"
                strokeWidth={0}
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
