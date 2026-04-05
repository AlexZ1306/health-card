"use client";

import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { useMemo } from "react";
import { ChartPoint } from "@/types/glucose";
import { formatOptionalNumber } from "@/utils/format";

type GlucoseChartProps = {
  data: ChartPoint[];
  intervalMinutes: number;
  targetMin: number;
  targetMax: number;
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



export const GlucoseChart = ({
  data,
  intervalMinutes,
  targetMin,
  targetMax,
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
  const coloredData = useMemo(
    () =>
      baseData.map((point) => {
        if (point.value === null) {
          return {
            ...point,
            valueVeryLow: null,
            valueLow: null,
            valueInRange: null,
            valueHigh: null,
            valueVeryHigh: null,
            valueColor: null,
          };
        }

        return {
          ...point,
          valueVeryLow: point.value <= 3 ? point.value : null,
          valueLow: point.value < rangeMin && point.value > 3 ? point.value : null,
          valueInRange:
            point.value >= rangeMin && point.value <= rangeMax ? point.value : null,
          valueHigh: point.value > rangeMax && point.value < 13.9 ? point.value : null,
          valueVeryHigh: point.value >= 13.9 ? point.value : null,
          valueColor:
            point.value >= 13.9
              ? COLOR_VERY_HIGH
              : point.value > rangeMax
                ? COLOR_HIGH
                : point.value < 3
                  ? COLOR_VERY_LOW
                  : point.value < rangeMin
                    ? COLOR_LOW
                    : COLOR_IN,
        };
      }),
    [baseData, rangeMin, rangeMax]
  );
  const hasAgp = baseData.some(
    (point) =>
      point.p10 !== undefined &&
      point.p25 !== undefined &&
      point.p50 !== undefined &&
      point.p75 !== undefined &&
      point.p90 !== undefined
  );

  const ticks = useMemo(() => {
    if (!coloredData.length) return [];
    const timestamps = coloredData.map((point) => point.timestamp);
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
        <LineChart data={coloredData}>
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
              stroke="rgba(37, 99, 235, 0.95)"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls={!showGaps}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive={false}
            />
          ) : (
            <>
              <Line
                type="monotone"
                dataKey="valueVeryLow"
                stroke={COLOR_VERY_LOW}
                strokeWidth={2.6}
                dot={false}
                activeDot={false}
                tooltipType="none"
                connectNulls={!showGaps}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="valueLow"
                stroke={COLOR_LOW}
                strokeWidth={2.6}
                dot={false}
                activeDot={false}
                tooltipType="none"
                connectNulls={!showGaps}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="valueInRange"
                stroke={COLOR_IN}
                strokeWidth={2.6}
                dot={false}
                activeDot={false}
                tooltipType="none"
                connectNulls={!showGaps}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="valueHigh"
                stroke={COLOR_HIGH}
                strokeWidth={2.6}
                dot={false}
                activeDot={false}
                tooltipType="none"
                connectNulls={!showGaps}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="valueVeryHigh"
                stroke={COLOR_VERY_HIGH}
                strokeWidth={2.6}
                dot={false}
                activeDot={false}
                tooltipType="none"
                connectNulls={!showGaps}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="rgba(0,0,0,0)"
                strokeWidth={0}
                dot={false}
                activeDot={({ payload }) => ({
                  r: 3,
                  fill: payload?.valueColor ?? "hsl(var(--foreground))",
                  stroke: "#fff",
                  strokeWidth: 1,
                })}
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
