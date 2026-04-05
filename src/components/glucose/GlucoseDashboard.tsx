"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { GlucoseChart } from "@/components/glucose/GlucoseChart";
import { TimeInRangeDonut } from "@/components/glucose/TimeInRangeDonut";
import { MetricCard } from "@/components/glucose/MetricCard";
import { normalizeGlucosePoints } from "@/services/glucose/normalize";
import { detectGaps } from "@/services/glucose/gaps";
import {
  AGGREGATION_OPTIONS,
  aggregateGlucosePoints,
  buildChartSeries,
} from "@/services/glucose/aggregation";
import {
  computeEhbA1c,
  computeEvents,
  computeGmi,
  computeMean,
  computeStdDev,
  computeTimeInRange,
  computeTitr,
} from "@/services/glucose/analytics";
import {
  DEFAULT_THRESHOLDS,
  loadThresholds,
} from "@/services/glucose/thresholds";
import { createDemoGlucoseData } from "@/services/glucose/demo";
import { formatOptionalNumber } from "@/utils/format";
import type { GlucosePoint, Thresholds } from "@/types/glucose";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";

export const GlucoseDashboard = () => {
  const [excelPoints, setExcelPoints] = useState<GlucosePoint[]>([]);
  const [manualPoints, setManualPoints] = useState<GlucosePoint[]>([]);
  const [scaleKey, setScaleKey] = useState("5m");
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [gapMode, setGapMode] = useState<"show" | "smooth">("show");
  const [periodMode, setPeriodMode] = useState<"day" | "week" | "month" | "year">("day");
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  });
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(() => {
    const [yearStr] = monthFilter.split("-");
    return Number(yearStr) || new Date().getFullYear();
  });
  const monthPickerRef = useRef<HTMLDivElement | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isPanningRef = useRef(false);
  const isDraggingRef = useRef(false);
  const panStartXRef = useRef(0);
  const panScrollLeftRef = useRef(0);
  const dragMovedRef = useRef(false);

  useEffect(() => {
    const storedExcel = localStorage.getItem("glucose_excel_points");
    const storedManual = localStorage.getItem("glucose_manual_points");

    const parsePoints = (value: string | null) => {
      if (!value) return [];
      try {
        return (JSON.parse(value) as GlucosePoint[]).map((point) => ({
          ...point,
          datetime: new Date(point.datetime),
        }));
      } catch {
        return [];
      }
    };

    const excel = parsePoints(storedExcel);
    const manual = parsePoints(storedManual);
    const storedThresholds = loadThresholds();

    if (excel.length || manual.length) {
      setExcelPoints(excel);
      setManualPoints(manual);
    } else {
      setExcelPoints(createDemoGlucoseData());
    }
    setThresholds(storedThresholds);
  }, []);

  useEffect(() => {
    const [yearStr] = monthFilter.split("-");
    const year = Number(yearStr);
    if (Number.isFinite(year)) {
      setMonthPickerYear(year);
    }
  }, [monthFilter]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!monthPickerRef.current) return;
      if (!monthPickerRef.current.contains(event.target as Node)) {
        setMonthPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [monthPickerOpen]);

  const normalized = useMemo(
    () => normalizeGlucosePoints([...excelPoints, ...manualPoints]),
    [excelPoints, manualPoints]
  );

  const periodBuckets = useMemo(() => {
    const dayShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const toDayKey = (date: Date) => `d-${format(date, "yyyy-MM-dd")}`;
    const toWeekKey = (date: Date) =>
      `w-${format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")}`;

    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (monthFilter) {
      const [yearStr, monthStr] = monthFilter.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr) - 1;
      if (Number.isFinite(year)) {
        if (periodMode === "year") {
          rangeStart = new Date(year, 0, 1);
          rangeEnd = new Date(year, 11, 31, 23, 59, 59, 999);
        } else if (Number.isFinite(month)) {
          rangeStart = new Date(year, month, 1);
          rangeEnd = endOfMonth(rangeStart);
        }
      }
    }

    const monthStart = rangeStart;
    const monthEnd = rangeEnd;

    const pointsInScope =
      rangeStart && rangeEnd
        ? normalized.points.filter(
            (point) => point.datetime >= rangeStart && point.datetime <= rangeEnd
          )
        : normalized.points;

    if (periodMode === "month" && rangeStart && rangeEnd) {
      return [
        {
          key: `m-${format(rangeStart, "yyyy-MM")}`,
          start: rangeStart,
          end: rangeEnd,
          label: format(rangeStart, "LLL", { locale: ru }),
          subLabel: format(rangeStart, "yyyy", { locale: ru }),
          hasData: pointsInScope.length > 0,
        },
      ];
    }

    if (periodMode === "year" && rangeStart && rangeEnd) {
      return [
        {
          key: `y-${format(rangeStart, "yyyy")}`,
          start: rangeStart,
          end: rangeEnd,
          label: format(rangeStart, "yyyy", { locale: ru }),
          subLabel: "год",
          hasData: pointsInScope.length > 0,
        },
      ];
    }

    const availability = new Set<string>();
    for (const point of pointsInScope) {
      if (periodMode === "day") {
        availability.add(toDayKey(point.datetime));
      } else {
        availability.add(toWeekKey(point.datetime));
      }
    }

    const buckets: Array<{
      key: string;
      start: Date;
      end: Date;
      label: string;
      subLabel: string;
      hasData: boolean;
    }> = [];

    if (periodMode === "day") {
      if (monthStart && monthEnd) {
        const current = new Date(monthStart);
        while (current <= monthEnd) {
          const dayStart = startOfDay(current);
          const dayEnd = new Date(
            dayStart.getFullYear(),
            dayStart.getMonth(),
            dayStart.getDate(),
            23,
            59,
            59,
            999
          );
          const key = toDayKey(dayStart);
          buckets.push({
            key,
            start: dayStart,
            end: dayEnd,
            label: format(dayStart, "dd", { locale: ru }),
            subLabel: dayShort[dayStart.getDay()],
            hasData: availability.has(key),
          });
          current.setDate(current.getDate() + 1);
        }
        return buckets;
      }

      const uniqueDays = Array.from(availability).sort();
      for (const key of uniqueDays) {
        const date = new Date(key.replace("d-", ""));
        const dayStart = startOfDay(date);
        const dayEnd = new Date(
          dayStart.getFullYear(),
          dayStart.getMonth(),
          dayStart.getDate(),
          23,
          59,
          59,
          999
        );
        buckets.push({
          key,
          start: dayStart,
          end: dayEnd,
          label: format(dayStart, "dd", { locale: ru }),
          subLabel: dayShort[dayStart.getDay()],
          hasData: availability.has(key),
        });
      }

      return buckets.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    if (periodMode === "week") {
      if (monthStart && monthEnd) {
        let current = startOfWeek(monthStart, { weekStartsOn: 1 });
        const last = endOfWeek(monthEnd, { weekStartsOn: 1 });
        while (current <= last) {
          const weekStart = startOfWeek(current, { weekStartsOn: 1 });
          const weekEnd = endOfWeek(current, { weekStartsOn: 1 });
          const key = toWeekKey(weekStart);
          buckets.push({
            key,
            start: weekStart,
            end: weekEnd,
            label: format(weekStart, "dd MMM", { locale: ru }),
            subLabel: `${format(weekStart, "dd", { locale: ru })}–${format(
              weekEnd,
              "dd MMM",
              { locale: ru }
            )}`,
            hasData: availability.has(key),
          });
          current = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        }
        return buckets;
      }

      const uniqueWeeks = Array.from(availability).sort();
      for (const key of uniqueWeeks) {
        const raw = key.replace("w-", "");
        const weekStart = startOfWeek(new Date(raw), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        buckets.push({
          key,
          start: weekStart,
          end: weekEnd,
          label: format(weekStart, "dd MMM", { locale: ru }),
          subLabel: `${format(weekStart, "dd", { locale: ru })}–${format(
            weekEnd,
            "dd MMM",
            { locale: ru }
          )}`,
          hasData: availability.has(key),
        });
      }

      return buckets.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    return buckets;
  }, [normalized.points, periodMode, monthFilter]);

  const shiftMonth = (offset: number) => {
    const base = new Date(`${monthFilter}-01`);
    if (Number.isNaN(base.getTime())) return;
    const next = addMonths(base, offset);
    const month = String(next.getMonth() + 1).padStart(2, "0");
    setMonthFilter(`${next.getFullYear()}-${month}`);
  };

  const hasAnyData = normalized.points.length > 0;

  const handleMonthNav = (direction: -1 | 1) => {
    if (!hasAnyData) return;
    const scroller = scrollRef.current;
    if (!scroller) {
      shiftMonth(direction);
      return;
    }
    const items = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-period-key]")
    );
    if (!items.length) {
      shiftMonth(direction);
      return;
    }
    const scrollLeft = scroller.scrollLeft;
    const viewRight = scrollLeft + scroller.clientWidth;
    const pad = 4;
    let leftmost = 0;
    let rightmost = items.length - 1;

    for (let i = 0; i < items.length; i += 1) {
      const itemLeft = items[i].offsetLeft;
      const itemRight = itemLeft + items[i].offsetWidth;
      if (itemRight > scrollLeft + pad) {
        leftmost = i;
        break;
      }
    }

    for (let i = items.length - 1; i >= 0; i -= 1) {
      const itemLeft = items[i].offsetLeft;
      if (itemLeft < viewRight - pad) {
        rightmost = i;
        break;
      }
    }

    const visibleCount = Math.max(1, rightmost - leftmost + 1);

    if (direction > 0) {
      const targetIndex = rightmost + 1;
      if (targetIndex >= items.length) {
        shiftMonth(1);
        return;
      }
      const target = items[targetIndex];
      scroller.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
      return;
    }

    if (leftmost === 0) {
      shiftMonth(-1);
      return;
    }
    const targetIndex = leftmost - visibleCount;
    if (targetIndex < 0) {
      scroller.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    const target = items[targetIndex];
    scroller.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
  };

  const lastWithData = useMemo(() => {
    if (!periodBuckets.length) return null;
    return (
      [...periodBuckets].reverse().find((bucket) => bucket.hasData) ??
      periodBuckets[periodBuckets.length - 1]
    );
  }, [periodBuckets]);

  const prevMonthRef = useRef(monthFilter);

  useEffect(() => {
    if (!lastWithData) {
      setSelectedKey(null);
      return;
    }
    if (prevMonthRef.current !== monthFilter) {
      prevMonthRef.current = monthFilter;
      setSelectedKey(periodBuckets[0]?.key ?? lastWithData.key);
      return;
    }
    setSelectedKey((prev) => (prev === lastWithData.key ? prev : lastWithData.key));
  }, [lastWithData, periodMode, monthFilter, periodBuckets]);

  const activeBucket = useMemo(() => {
    if (!periodBuckets.length) return null;
    const map = new Map(periodBuckets.map((bucket) => [bucket.key, bucket]));
    if (selectedKey && map.has(selectedKey)) {
      return map.get(selectedKey) ?? null;
    }
    return lastWithData ?? null;
  }, [selectedKey, periodBuckets, lastWithData]);

  const selectedLabel = useMemo(() => {
    if (periodMode === "day" && activeBucket) {
      return format(activeBucket.start, "d MMMM yyyy 'г.'", { locale: ru });
    }
    if (periodMode === "week" && activeBucket) {
      const startLabel = format(activeBucket.start, "d MMM", { locale: ru });
      const endLabel = format(activeBucket.end, "d MMM yyyy 'г.'", { locale: ru });
      return `${startLabel} — ${endLabel}`;
    }
    if (periodMode === "month") {
      const date = new Date(`${monthFilter}-01`);
      if (!Number.isNaN(date.getTime())) {
        return format(date, "LLLL yyyy 'г.'", { locale: ru });
      }
    }
    if (periodMode === "year") {
      const [yearStr] = monthFilter.split("-");
      if (yearStr) return `${yearStr} г.`;
    }
    return "";
  }, [periodMode, activeBucket, monthFilter]);

  useEffect(() => {
    if (!scrollRef.current || !activeBucket) return;
    const key = activeBucket.key;
    const target = scrollRef.current.querySelector<HTMLElement>(
      `[data-period-key="${key}"]`
    );
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  }, [activeBucket, periodBuckets]);

  const filteredPoints = useMemo(() => {
    if (!activeBucket) {
      return normalized.points;
    }
    return normalized.points.filter((point) => {
      const time = point.datetime.getTime();
      return time >= activeBucket.start.getTime() && time <= activeBucket.end.getTime();
    });
  }, [normalized.points, activeBucket]);

  const gaps = useMemo(() => detectGaps(filteredPoints), [filteredPoints]);

  const selectedScale =
    AGGREGATION_OPTIONS.find((option) => option.key === scaleKey) ??
    AGGREGATION_OPTIONS[0];

  const requiredMinutes = useMemo(() => {
    let requiredMinutes = selectedScale.minutes;

    if (periodMode === "day") {
      return 1;
    }

    if (periodMode === "week") {
      return 30;
    }

    if (periodMode === "month") {
      return 1440;
    }

    if (periodMode === "year") {
      return 10080;
    }

    if (filteredPoints.length >= 2) {
      const minTime = filteredPoints[0].datetime.getTime();
      const maxTime = filteredPoints[filteredPoints.length - 1].datetime.getTime();
      const durationMinutes = Math.max(1, (maxTime - minTime) / 60000);
      const maxPoints = 800;
      const autoMinutes = Math.ceil(durationMinutes / maxPoints);
      requiredMinutes = Math.max(requiredMinutes, autoMinutes);
    }

    return requiredMinutes;
  }, [filteredPoints, periodMode, selectedScale.minutes, activeBucket]);

  const allowedScaleKeys = useMemo(() => {
    if (periodMode === "month") {
      return new Set(["1d", "3d", "7d"]);
    }
    if (periodMode === "year") {
      return new Set(["7d", "14d", "1mo"]);
    }
    return null;
  }, [periodMode]);

  const effectiveScale = useMemo(() => {
    const sorted = [...AGGREGATION_OPTIONS].sort((a, b) => a.minutes - b.minutes);
    const chosen =
      sorted.find((option) => option.minutes >= requiredMinutes) ??
      sorted[sorted.length - 1];

    return selectedScale.minutes >= chosen.minutes ? selectedScale : chosen;
  }, [requiredMinutes, selectedScale]);

  useEffect(() => {
    if (periodMode === "day") return;
    if (effectiveScale.key !== selectedScale.key) {
      setScaleKey(effectiveScale.key);
    }
  }, [effectiveScale.key, selectedScale.key, periodMode]);

  useEffect(() => {
    if (periodMode === "day") {
      setScaleKey("5m");
      return;
    }
    if (periodMode === "week") {
      setScaleKey("3h");
      return;
    }
    if (periodMode === "month") {
      setScaleKey("7d");
      return;
    }
    if (periodMode === "year") {
      setScaleKey("1mo");
    }
  }, [periodMode]);

  const aggregated = useMemo(
    () => aggregateGlucosePoints(filteredPoints, effectiveScale.minutes, gaps),
    [filteredPoints, effectiveScale.minutes, gaps]
  );

  const chartSeries = useMemo(
    () => buildChartSeries(aggregated, gaps, gapMode === "show"),
    [aggregated, gaps, gapMode]
  );
  const chartSeriesWithAgp = chartSeries;

  const meanValue = useMemo(() => computeMean(filteredPoints), [filteredPoints]);
  const stdDev = useMemo(() => computeStdDev(filteredPoints, meanValue), [filteredPoints, meanValue]);
  const cv = useMemo(() => {
    if (meanValue === null || stdDev === null || meanValue === 0) return null;
    return (stdDev / meanValue) * 100;
  }, [meanValue, stdDev]);

  const ehbA1c = useMemo(() => computeEhbA1c(meanValue), [meanValue]);
  const gmi = useMemo(() => computeGmi(meanValue), [meanValue]);
  const titr = useMemo(() => computeTitr(filteredPoints, thresholds), [filteredPoints, thresholds]);

  const timeInRange = useMemo(
    () => computeTimeInRange(filteredPoints, thresholds),
    [filteredPoints, thresholds]
  );

  const hypoStats = useMemo(
    () => computeEvents(filteredPoints, (value) => value < thresholds.targetLow),
    [filteredPoints, thresholds]
  );
  const hyperStats = useMemo(
    () => computeEvents(filteredPoints, (value) => value > thresholds.targetHigh),
    [filteredPoints, thresholds]
  );

  const formatMissingDuration = (minutesTotal: number) => {
    if (!Number.isFinite(minutesTotal) || minutesTotal <= 0) {
      return "0м";
    }
    const total = Math.round(minutesTotal);
    const days = Math.floor(total / (24 * 60));
    const hours = Math.floor((total % (24 * 60)) / 60);
    const minutes = total % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}д`);
    if (hours > 0) parts.push(`${hours}ч`);
    if (!parts.length || minutes > 0) parts.push(`${minutes}м`);
    return parts.join(" ");
  };

  const periodCompleteness = useMemo(() => {
    if (!activeBucket) {
      return { percent: null, missingLabel: "—" };
    }
    const durationMinutes = Math.max(
      0,
      (activeBucket.end.getTime() - activeBucket.start.getTime()) / 60000
    );
    const expectedPoints = Math.max(1, Math.round(durationMinutes / 5));
    const actualPoints = filteredPoints.length;
    const missingPoints = Math.max(0, expectedPoints - actualPoints);
    const percent = (actualPoints / expectedPoints) * 100;
    const missingMinutes = missingPoints * 5;
    return {
      percent,
      missingLabel: `Нет данных: ${formatMissingDuration(missingMinutes)}`,
    };
  }, [activeBucket, filteredPoints.length]);

  useEffect(() => {
    const handleStorage = () => {
      const storedExcel = localStorage.getItem("glucose_excel_points");
      const storedManual = localStorage.getItem("glucose_manual_points");
      const storedThresholds = loadThresholds();

      const parsePoints = (value: string | null) => {
        if (!value) return [];
        try {
          return (JSON.parse(value) as GlucosePoint[]).map((point) => ({
            ...point,
            datetime: new Date(point.datetime),
          }));
        } catch {
          return [];
        }
      };

      setExcelPoints(parsePoints(storedExcel));
      setManualPoints(parsePoints(storedManual));
      setThresholds(storedThresholds);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#ffffff_45%,_#ecfeff)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Логотип" width={140} height={36} priority />
          </div>
          <Button asChild>
            <Link href="/manage">Управление данными</Link>
          </Button>
        </header>

        <div className="flex flex-col gap-6">
          <Card className="shadow-sm overflow-visible">
            <CardContent className="flex flex-wrap items-center gap-4 p-4 overflow-visible">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Масштаб
                  </span>
                  <Select value={scaleKey} onValueChange={setScaleKey}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      sideOffset={6}
                      align="start"
                      avoidCollisions={false}
                      collisionPadding={0}
                    >
                      {AGGREGATION_OPTIONS.map((option) => {
                        const isAllowed = !allowedScaleKeys || allowedScaleKeys.has(option.key);
                        const isDisabled = !isAllowed || option.minutes < requiredMinutes;
                        return (
                          <SelectItem key={option.key} value={option.key} disabled={isDisabled}>
                            {option.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Месяц
                </span>
                <div className="relative" ref={monthPickerRef}>
                  <button
                    type="button"
                    onClick={() => setMonthPickerOpen((prev) => !prev)}
                    className="flex w-[180px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition hover:bg-muted/30"
                  >
                    <span className="capitalize">
                      {format(new Date(`${monthFilter}-01`), "LLLL yyyy", { locale: ru })}
                    </span>
                    <span className="text-xs text-muted-foreground">▾</span>
                  </button>
                  {monthPickerOpen ? (
                    <div className="absolute left-0 top-full z-50 mt-2 w-[220px] rounded-xl border border-border bg-background p-3 shadow-lg">
                      <div className="mb-3 flex items-center justify-between">
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm text-muted-foreground hover:bg-muted/30"
                          onClick={() => setMonthPickerYear((prev) => prev - 1)}
                        >
                          ‹
                        </button>
                        <div className="text-sm font-semibold text-foreground">
                          {monthPickerYear}
                        </div>
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm text-muted-foreground hover:bg-muted/30"
                          onClick={() => setMonthPickerYear((prev) => prev + 1)}
                        >
                          ›
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          "янв",
                          "фев",
                          "мар",
                          "апр",
                          "май",
                          "июн",
                          "июл",
                          "авг",
                          "сен",
                          "окт",
                          "ноя",
                          "дек",
                        ].map((label, index) => {
                          const monthValue = String(index + 1).padStart(2, "0");
                          const key = `${monthPickerYear}-${monthValue}`;
                          const isActive = key === monthFilter;
                          return (
                            <button
                              key={label}
                              type="button"
                              className={`rounded-lg px-2 py-2 text-xs font-medium uppercase transition ${
                                isActive
                                  ? "bg-foreground text-background"
                                  : "border border-border text-foreground hover:bg-muted/40"
                              }`}
                              onClick={() => {
                                setMonthFilter(key);
                                setMonthPickerOpen(false);
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Разрывы
                  </span>
                  <Select value={gapMode} onValueChange={(value) => setGapMode(value as "show" | "smooth")}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                  <SelectContent
                    position="popper"
                    side="bottom"
                    sideOffset={6}
                    align="start"
                    avoidCollisions={false}
                    collisionPadding={0}
                  >
                      <SelectItem value="show">Показывать</SelectItem>
                      <SelectItem value="smooth">Сглаживать</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="ml-auto flex flex-col gap-1 text-right">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Дни
                  </span>
                  <span className="text-lg font-semibold text-foreground">
                    {periodBuckets.length}
                  </span>
                </div>
              </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  {(periodMode === "day" || periodMode === "week") && (
                    <div className="relative w-full px-12">
                    <button
                      type="button"
                      onClick={() => handleMonthNav(-1)}
                      disabled={!hasAnyData}
                      className={`absolute left-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-sm text-muted-foreground shadow-sm transition ${
                        hasAnyData ? "hover:bg-muted/40" : "cursor-not-allowed opacity-40"
                      }`}
                      aria-label="Предыдущий месяц"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMonthNav(1)}
                      disabled={!hasAnyData}
                      className={`absolute right-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-sm text-muted-foreground shadow-sm transition ${
                        hasAnyData ? "hover:bg-muted/40" : "cursor-not-allowed opacity-40"
                      }`}
                      aria-label="Следующий месяц"
                    >
                      ›
                    </button>
                    <div
                      ref={scrollRef}
                      className="w-full overflow-x-auto overflow-y-hidden no-scrollbar cursor-default"
                    onWheel={(event) => {
                      if (!scrollRef.current) return;
                      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                        scrollRef.current.scrollLeft += event.deltaY;
                        event.preventDefault();
                      }
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || !scrollRef.current) return;
                      isPanningRef.current = true;
                      isDraggingRef.current = false;
                      dragMovedRef.current = false;
                      panStartXRef.current = event.clientX;
                      panScrollLeftRef.current = scrollRef.current.scrollLeft;
                    }}
                    onPointerMove={(event) => {
                      if (!isPanningRef.current || !scrollRef.current) return;
                      const dx = event.clientX - panStartXRef.current;
                      if (!isDraggingRef.current && Math.abs(dx) > 8) {
                        isDraggingRef.current = true;
                        dragMovedRef.current = true;
                        scrollRef.current.setPointerCapture(event.pointerId);
                      }
                      if (isDraggingRef.current) {
                        scrollRef.current.scrollLeft = panScrollLeftRef.current - dx;
                      }
                    }}
                    onPointerUp={(event) => {
                      if (!scrollRef.current) return;
                      isPanningRef.current = false;
                      if (isDraggingRef.current) {
                        scrollRef.current.releasePointerCapture(event.pointerId);
                      }
                      isDraggingRef.current = false;
                      setTimeout(() => {
                        dragMovedRef.current = false;
                      }, 0);
                    }}
                    onPointerCancel={(event) => {
                      if (!scrollRef.current) return;
                      isPanningRef.current = false;
                      if (isDraggingRef.current) {
                        scrollRef.current.releasePointerCapture(event.pointerId);
                      }
                      isDraggingRef.current = false;
                      dragMovedRef.current = false;
                    }}
                    onPointerLeave={(event) => {
                      if (!scrollRef.current) return;
                      isPanningRef.current = false;
                      if (isDraggingRef.current) {
                        scrollRef.current.releasePointerCapture(event.pointerId);
                      }
                      isDraggingRef.current = false;
                      setTimeout(() => {
                        dragMovedRef.current = false;
                      }, 0);
                    }}
                    >
                      <div className="flex w-max min-w-full flex-nowrap justify-center gap-2 py-1">
                        {periodBuckets.map((bucket) => {
                          const isSelected = activeBucket?.key === bucket.key;
                          const isDisabled = !bucket.hasData;
                          return (
                            <button
                              key={bucket.key}
                              type="button"
                              disabled={isDisabled}
                              data-period-key={bucket.key}
                              onClick={() => {
                                if (dragMovedRef.current || isDisabled) return;
                                setSelectedKey(bucket.key);
                              }}
                              className={`flex min-w-[64px] cursor-default flex-col items-center justify-center rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                                isSelected
                                  ? "border-transparent bg-foreground text-background shadow-sm"
                                  : isDisabled
                                    ? "border-border bg-muted/30 text-muted-foreground opacity-50"
                                    : "border-border bg-background text-foreground hover:bg-muted/40"
                              }`}
                            >
                              <span className="text-base font-semibold">{bucket.label}</span>
                              <span
                                className={`text-[10px] uppercase ${
                                  isSelected
                                    ? "text-background/80"
                                    : isDisabled
                                      ? "text-muted-foreground/60"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {bucket.subLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                  )}
                  <div className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
                    <div className="text-sm font-semibold text-foreground">
                      {selectedLabel || "—"}
                    </div>
                    <div className="flex items-center rounded-full border border-border bg-muted/40 p-1 text-xs font-medium text-muted-foreground">
                      {[
                        { key: "day", label: "День" },
                        { key: "week", label: "Неделя" },
                        { key: "month", label: "Месяц" },
                        { key: "year", label: "Год" },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setPeriodMode(item.key as typeof periodMode)}
                          className={`rounded-full px-3 py-1 transition ${
                            periodMode === item.key
                              ? "bg-foreground text-background shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Динамика глюкозы</CardTitle>
              </CardHeader>
              <CardContent>
                <GlucoseChart
                  data={chartSeriesWithAgp}
                  intervalMinutes={effectiveScale.minutes}
                  targetMin={thresholds.targetLow}
                  targetMax={thresholds.targetHigh}
                  thresholds={thresholds}
                  showGaps={gapMode === "show"}
                  showRange={true}
                  singleDay={periodMode === "day" && !!activeBucket}
                  simplified={false}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <TimeInRangeDonut data={timeInRange.buckets} total={timeInRange.total} />
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="eHbA1c"
                value={ehbA1c === null ? "—" : `${formatOptionalNumber(ehbA1c, 1)}%`}
                tooltip="Оценка среднего уровня сахара в крови, рассчитанная по данным мониторинга. Рекомендуемый уровень: ниже 7%"
              />
              <MetricCard
                label="TITR"
                value={titr === null ? "—" : `${formatOptionalNumber(titr, 0)}%`}
                tooltip="Более строгий показатель контроля. Показывает время, когда сахар максимально близок к значениям здорового человека"
              />
              <MetricCard
                label="CV"
                value={cv === null ? "—" : `${formatOptionalNumber(cv, 1)}%`}
                tooltip="Показатель изменчивости сахара. Чем ниже процент, тем меньше резких скачков и стабильнее ваше состояние"
              />
              <MetricCard
                label="GMI"
                value={gmi === null ? "—" : `${formatOptionalNumber(gmi, 1)}%`}
                tooltip="Индекс управления глюкозой: аналог eHbA1c для данных CGM"
              />
              <MetricCard
                label="Средний сахар"
                value={meanValue === null ? "—" : `${formatOptionalNumber(meanValue, 1)} mmol/L`}
                tooltip="Среднее арифметическое всех значений глюкозы за выбранный период"
              />
                <MetricCard
                  label="Данные за период"
                  value={
                    periodCompleteness.percent === null
                      ? "—"
                      : `${formatOptionalNumber(periodCompleteness.percent, 0)}%`
                  }
                  hint={periodCompleteness.missingLabel}
                  tooltip="Показывает полноту данных за выбранный период и длительность отсутствующих измерений"
                />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-sm overflow-visible">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle className="text-base">События гипо/гипер</CardTitle>
                  <div className="group relative">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
                      i
                    </span>
                    <div className="pointer-events-none absolute right-0 top-6 z-20 w-72 rounded-lg border border-border bg-background p-2 text-xs text-muted-foreground opacity-0 shadow-md transition group-hover:opacity-100">
                      <div className="space-y-1">
                        <p>
                          <span className="font-semibold text-foreground">Статистика эпизодов:</span>{" "}
                          выход глюкозы за установленные границы нормы.
                        </p>
                        <p>
                          <span className="font-semibold text-foreground">События</span>: количество
                          отдельных случаев (раз), когда уровень сахара опускался слишком низко или
                          поднимался слишком высоко.
                        </p>
                        <p>
                          <span className="font-semibold text-foreground">Ср. длительность</span>:
                          среднее время, в течение которого сахар оставался за пределами нормы в
                          рамках одного такого случая.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm text-muted-foreground">
                  <div className="flex items-start justify-between gap-4">
                    <span>Гипогликемии (&lt; {formatOptionalNumber(thresholds.targetLow, 1)})</span>
                    <div className="text-right">
                      <div className="text-foreground">{hypoStats.count} событий</div>
                      <div className="text-xs text-muted-foreground">
                        ср. {formatOptionalNumber(hypoStats.avgMinutes, 0)} мин
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span>Гипергликемии (&gt; {formatOptionalNumber(thresholds.targetHigh, 1)})</span>
                    <div className="text-right">
                      <div className="text-foreground">{hyperStats.count} событий</div>
                      <div className="text-xs text-muted-foreground">
                        ср. {formatOptionalNumber(hyperStats.avgMinutes, 0)} мин
                      </div>
                    </div>
                  </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Сводка по еде</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3">
                  Нет данных о приемах пищи. Если появятся отметки, здесь будут рассчитаны
                  показатели до еды, пик после еды и амплитуда.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
