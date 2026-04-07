"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { memo, useMemo } from "react";
import { EventTrendPoint } from "@/types/glucose";
import { formatOptionalNumber } from "@/utils/format";

type EventsTrendChartProps = {
  data: EventTrendPoint[];
  intervalMinutes: number;
  singleDay?: boolean;
  metric: "count" | "avgDuration";
  barColor: string;
};

const getTickFormat = (intervalMinutes: number, singleDay?: boolean) => {
  if (singleDay) return "HH:mm";
  if (intervalMinutes >= 1440) return "dd.MM";
  if (intervalMinutes >= 180) return "dd.MM HH:mm";
  return "HH:mm";
};

export const EventsTrendChart = memo(({
  data,
  intervalMinutes,
  singleDay,
  metric,
  barColor,
}: EventsTrendChartProps) => {
  if (!data.length) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        Нет данных для отображения
      </div>
    );
  }

  const tickFormat = getTickFormat(intervalMinutes, singleDay);
  const chartData = useMemo(
    () =>
      data.map((point) => {
        const rawValue =
          metric === "count" ? point.count : point.avgDuration ?? 0;
        return {
          ...point,
          value: rawValue,
        };
      }),
    [data, metric]
  );

  const maxValue = useMemo(() => {
    const values = chartData
      .map((point) => point.value)
      .filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value)
      );
    return values.length ? Math.max(...values) : 0;
  }, [chartData]);

  const ticks = useMemo(() => {
    if (!data.length) return [];
    const timestamps = data.map((point) => point.timestamp);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    if (min === max) return [min];

    const totalMinutes = (max - min) / 60000;
    const candidates = Array.from(
      new Set(
        [intervalMinutes, 10, 15, 30, 60, 120, 180, 360, 720, 1440].filter(
          (v) => v > 0
        )
      )
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
    const result: number[] = [];
    for (let t = firstTick; t <= max; t += stepMs) {
      result.push(t);
    }
    return Array.from(new Set(result));
  }, [data, intervalMinutes]);

  return (
    <div className="relative h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
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
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={[0, Math.max(5, Math.ceil(maxValue * 1.2))]}
            allowDecimals={metric !== "count"}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0]?.payload as EventTrendPoint | undefined;
              if (!item) return null;
              const value = metric === "count" ? item.count : item.avgDuration ?? 0;
              const hasValue = value > 0;
              return (
                <div className="rounded-lg border border-border bg-background/95 p-3 text-sm shadow-sm">
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(item.timestamp), "dd.MM.yyyy HH:mm")}
                  </div>
                  <div className="mt-2 grid gap-1">
                    {metric === "count" ? (
                      <div className="text-sm text-foreground">
                        События:{" "}
                        <span className="font-semibold">
                          {hasValue ? item.count : "Нет"}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-foreground">
                        Ср. длительность:{" "}
                        <span className="font-semibold">
                          {hasValue
                            ? `${formatOptionalNumber(item.avgDuration, 0)} мин`
                            : "Нет"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
            shared={true}
            isAnimationActive={false}
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
          />
          <Bar
            dataKey="value"
            fill={barColor}
            radius={[6, 6, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

EventsTrendChart.displayName = "EventsTrendChart";
