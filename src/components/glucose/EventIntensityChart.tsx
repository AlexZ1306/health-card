"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { useMemo } from "react";
import { EventIntensityPoint } from "@/types/glucose";
import { formatOptionalNumber } from "@/utils/format";

type EventIntensityChartProps = {
  data: EventIntensityPoint[];
  intervalMinutes: number;
  singleDay?: boolean;
  mode: "hypo" | "hyper";
  baseColor: string;
};

const getTickFormat = (intervalMinutes: number, singleDay?: boolean) => {
  if (singleDay) return "HH:mm";
  if (intervalMinutes >= 1440) return "dd.MM";
  if (intervalMinutes >= 180) return "dd.MM HH:mm";
  return "HH:mm";
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const number = parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((val) => Math.max(0, Math.min(255, Math.round(val))).toString(16).padStart(2, "0"))
    .join("")}`;

const mixRgb = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
) => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

const getIntensityColor = (baseHex: string, ratio: number) => {
  const base = hexToRgb(baseHex);
  const light = mixRgb(base, { r: 255, g: 255, b: 255 }, 0.65);
  const dark = mixRgb(base, { r: 0, g: 0, b: 0 }, 0.2);
  const t = clamp01(ratio);
  if (t <= 0.6) {
    const local = t / 0.6;
    const mixed = mixRgb(light, base, local);
    return rgbToHex(mixed.r, mixed.g, mixed.b);
  }
  const local = (t - 0.6) / 0.4;
  const mixed = mixRgb(base, dark, local);
  return rgbToHex(mixed.r, mixed.g, mixed.b);
};

export const EventIntensityChart = ({
  data,
  intervalMinutes,
  singleDay,
  mode,
  baseColor,
}: EventIntensityChartProps) => {
  if (!data.length) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        Нет данных для отображения
      </div>
    );
  }

  const tickFormat = getTickFormat(intervalMinutes, singleDay);

  const maxValue = useMemo(() => {
    const values = data
      .map((point) => point.auc)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return values.length ? Math.max(...values) : 0;
  }, [data]);

  const colors = useMemo(() => {
    if (maxValue <= 0) {
      return data.map(() => "transparent");
    }
    return data.map((point) => {
      const value = point.auc;
      if (typeof value !== "number" || value <= 0) return "transparent";
      return getIntensityColor(baseColor, value / maxValue);
    });
  }, [data, baseColor, maxValue]);

  const ticks = useMemo(() => {
    if (!data.length) return [];
    const timestamps = data.map((point) => point.timestamp);
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
    const result: number[] = [];
    for (let t = firstTick; t <= max; t += stepMs) {
      result.push(t);
    }
    return Array.from(new Set(result));
  }, [data, intervalMinutes]);

  return (
    <div className="relative h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
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
            width={52}
            domain={[0, Math.max(5, Math.ceil(maxValue * 1.2))]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0]?.payload as EventIntensityPoint | undefined;
              if (!item || typeof item.auc !== "number" || item.auc <= 0) return null;
              const typeLabel = mode === "hyper" ? "Гипергликемия" : "Гипогликемия";
              const extremeLabel =
                mode === "hyper" ? "Максимальный пик" : "Глубокий минимум";
              return (
                <div className="rounded-lg border border-border bg-background/95 p-3 text-sm shadow-sm">
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(item.timestamp), "dd.MM.yyyy HH:mm")}
                  </div>
                  <div className="mt-2 grid gap-1">
                    <div className="text-sm text-foreground">
                      Тип события: <span className="font-semibold">{typeLabel}</span>
                    </div>
                    <div className="text-sm text-foreground">
                      Суммарная сила:{" "}
                      <span className="font-semibold">
                        {formatOptionalNumber(item.auc, 1)} усл. ед.
                      </span>
                    </div>
                    <div className="text-sm text-foreground">
                      Средний сахар в событиях:{" "}
                      <span className="font-semibold">
                        {formatOptionalNumber(item.avgValue, 1)} mmol/L
                      </span>
                    </div>
                    <div className="text-sm text-foreground">
                      {extremeLabel}:{" "}
                      <span className="font-semibold">
                        {formatOptionalNumber(item.extremeValue, 1)} mmol/L
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
            shared={true}
            isAnimationActive={false}
            cursor={false}
          />
          <Bar dataKey="auc" radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={`cell-${entry.timestamp}`} fill={colors[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
