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
import { EventVelocityPoint } from "@/types/glucose";
import { formatOptionalNumber } from "@/utils/format";

type EventVelocityChartProps = {
  data: EventVelocityPoint[];
  intervalMinutes: number;
  singleDay?: boolean;
  mode: "hypo" | "hyper";
};

const VELOCITY_BANDS = {
  gentle: 0.06,
  moderate: 0.11,
};

const VELOCITY_COLORS = {
  hyper: {
    gentle: "#FFE1A6",
    moderate: "#FFB800",
    critical: "#C97A00",
  },
  hypo: {
    gentle: "#FFC9C9",
    moderate: "#D61B20",
    critical: "#8B0E12",
  },
};

const getTickFormat = (intervalMinutes: number, singleDay?: boolean) => {
  if (singleDay) return "HH:mm";
  if (intervalMinutes >= 1440) return "dd.MM";
  if (intervalMinutes >= 180) return "dd.MM HH:mm";
  return "HH:mm";
};

const getVelocityBand = (value: number) => {
  if (value <= VELOCITY_BANDS.gentle) return "gentle";
  if (value <= VELOCITY_BANDS.moderate) return "moderate";
  return "critical";
};

const getStatusLabel = (mode: "hypo" | "hyper", value: number) => {
  const band = getVelocityBand(value);
  if (band === "gentle") return "Плавная динамика";
  if (band === "moderate") {
    return mode === "hyper" ? "Умеренно резкий подъем" : "Умеренно резкое падение";
  }
  return mode === "hyper" ? "Критически резкий подъем" : "Критически резкое падение";
};

const getRecommendation = (mode: "hypo" | "hyper", value: number) => {
  const band = getVelocityBand(value);
  if (band === "gentle") {
    return "Скорость в пределах физиологической реакции.";
  }
  if (band === "moderate") {
    return mode === "hyper"
      ? "Следите за составом углеводов и временем введения инсулина."
      : "Падение ускорено — проверьте баланс инсулина и питания.";
  }
  return mode === "hyper"
    ? "Высокая скорость может указывать на избыток быстрых углеводов или задержку введения инсулина."
    : "Слишком быстрое падение может говорить о переизбытке инсулина или пропуске приема пищи.";
};

export const EventVelocityChart = ({
  data,
  intervalMinutes,
  singleDay,
  mode,
}: EventVelocityChartProps) => {
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
      .map((point) => point.maxVelocity)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return values.length ? Math.max(...values) : 0;
  }, [data]);

  const colors = useMemo(() => {
    const palette = VELOCITY_COLORS[mode];
    return data.map((point) => {
      const value = point.maxVelocity;
      if (typeof value !== "number" || value <= 0) return "transparent";
      const band = getVelocityBand(value);
      return palette[band];
    });
  }, [data, mode]);

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
            domain={[0, Math.max(0.2, Math.ceil(maxValue * 1.2 * 100) / 100)]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0]?.payload as EventVelocityPoint | undefined;
              if (!item || typeof item.maxVelocity !== "number" || item.maxVelocity <= 0) return null;
              const typeLabel = mode === "hyper" ? "Гипергликемия" : "Гипогликемия";
              const status = getStatusLabel(mode, item.maxVelocity);
              const recommendation = getRecommendation(mode, item.maxVelocity);
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
                      Макс. скорость:{" "}
                      <span className="font-semibold">
                        {formatOptionalNumber(item.maxVelocity, 2)} ммоль/л в мин.
                      </span>
                    </div>
                    <div className="text-sm text-foreground">
                      Статус: <span className="font-semibold">{status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{recommendation}</div>
                  </div>
                </div>
              );
            }}
            shared={true}
            isAnimationActive={false}
            cursor={false}
          />
          <Bar dataKey="maxVelocity" radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={`cell-${entry.timestamp}`} fill={colors[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
