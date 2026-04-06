"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { GlucoseChart } from "@/components/glucose/GlucoseChart";
import { TimeInRangeDonut } from "@/components/glucose/TimeInRangeDonut";
import { MetricCard } from "@/components/glucose/MetricCard";
import { EventsTrendChart } from "@/components/glucose/EventsTrendChart";
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
  buildEventTrendSeries,
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
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";

const PERIOD_OPTIONS = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "year", label: "Год" },
] as const;

type PeriodMode = (typeof PERIOD_OPTIONS)[number]["key"];
type GapMode = "show" | "smooth";

const MAX_MULTI_BY_PERIOD: Record<PeriodMode, number> = {
  day: 7,
  week: 7,
  month: 1,
  year: 1,
};

type PeriodControlsProps = {
  periodMode: PeriodMode;
  gapMode: GapMode;
  onPeriodChange: (value: PeriodMode) => void;
  onGapChange: (value: GapMode) => void;
};

const PeriodControls = memo(
  ({ periodMode, gapMode, onPeriodChange, onGapChange }: PeriodControlsProps) => {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Период
          </span>
          <Select value={periodMode} onValueChange={(value) => onPeriodChange(value as PeriodMode)}>
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
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Разрывы
          </span>
          <Select value={gapMode} onValueChange={(value) => onGapChange(value as GapMode)}>
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
      </div>
    );
  }
);

PeriodControls.displayName = "PeriodControls";

const MultiSelectIcon = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="8"
    viewBox="0 0 14 8"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M0.75 3.75L3.35 6.75L8.55 0.75M7.55 6.75L10.15 3.75L12.75 0.75"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SCALE_OPTIONS_BY_PERIOD: Record<
  "day" | "week" | "month" | "year",
  string[]
> = {
  day: ["5m", "15m", "30m", "1h", "3h", "6h"],
  week: ["1h", "3h", "6h", "8h", "24h"],
  month: ["8h", "24h", "48h", "72h", "7d"],
  year: ["7d", "14d", "1mo"],
};

const DEFAULT_SCALE_BY_PERIOD: Record<"day" | "week" | "month" | "year", string> = {
  day: "5m",
  week: "3h",
  month: "24h",
  year: "1mo",
};

const SCALE_LABELS: Record<string, string> = {
  "5m": "5м",
  "15m": "15м",
  "30m": "30м",
  "1h": "1ч",
  "3h": "3ч",
  "6h": "6ч",
  "8h": "8ч",
  "24h": "24ч",
  "48h": "48ч",
  "72h": "72ч",
  "7d": "Неделя",
  "14d": "14д",
  "1mo": "Месяц",
};

const PERIOD_COUNT_LABELS: Record<"day" | "week" | "month" | "year", string> = {
  day: "Дни",
  week: "Недели",
  month: "Месяцы",
  year: "Годы",
};

export const GlucoseDashboard = () => {
  const [excelPoints, setExcelPoints] = useState<GlucosePoint[]>([]);
  const [manualPoints, setManualPoints] = useState<GlucosePoint[]>([]);
  const [scaleKey, setScaleKey] = useState("5m");
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [gapMode, setGapMode] = useState<GapMode>("show");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("day");
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [eventKind, setEventKind] = useState<"hypo" | "hyper">("hypo");
  const scaleGroupRef = useRef<HTMLDivElement | null>(null);
  const scaleButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [scaleIndicator, setScaleIndicator] = useState({ left: 0, width: 0 });
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  });
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

  const normalized = useMemo(
    () => normalizeGlucosePoints([...excelPoints, ...manualPoints]),
    [excelPoints, manualPoints]
  );

  const periodBuckets = useMemo(() => {
    const toDayKey = (date: Date) => `d-${format(date, "yyyy-MM-dd")}`;
    const toWeekKey = (date: Date) =>
      `w-${format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")}`;
    const toMonthKey = (date: Date) => `m-${format(date, "yyyy-MM")}`;

    const now = new Date();
    let baseYear = now.getFullYear();
    let baseMonth = now.getMonth();

    if (monthFilter) {
      const [yearStr, monthStr] = monthFilter.split("-");
      const yearNum = Number(yearStr);
      const monthNum = Number(monthStr) - 1;
      if (Number.isFinite(yearNum)) baseYear = yearNum;
      if (Number.isFinite(monthNum)) baseMonth = monthNum;
    }

    if (periodMode === "year") {
      const years = normalized.points.map((point) => point.datetime.getFullYear());
      let minYear = baseYear;
      let maxYear = baseYear;
      if (years.length) {
        minYear = Math.min(...years);
        maxYear = Math.max(...years);
      }
      const availability = new Set(years.map((year) => `y-${year}`));
      const buckets: Array<{
        key: string;
        start: Date;
        end: Date;
        label: string;
        subLabel: string;
        hasData: boolean;
      }> = [];
      for (let year = minYear; year <= maxYear; year += 1) {
        const start = new Date(year, 0, 1);
        const end = endOfYear(start);
        const key = `y-${year}`;
        buckets.push({
          key,
          start,
          end,
          label: String(year),
          subLabel: "",
          hasData: availability.has(key),
        });
      }
      return buckets;
    }

    if (periodMode === "month") {
      const yearStart = new Date(baseYear, 0, 1);
      const yearEnd = endOfYear(yearStart);
      const availability = new Set(
        normalized.points
          .filter(
            (point) => point.datetime >= yearStart && point.datetime <= yearEnd
          )
          .map((point) => toMonthKey(point.datetime))
      );
      const buckets: Array<{
        key: string;
        start: Date;
        end: Date;
        label: string;
        subLabel: string;
        hasData: boolean;
      }> = [];
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const start = new Date(baseYear, monthIndex, 1);
        const end = endOfMonth(start);
        const key = toMonthKey(start);
        buckets.push({
          key,
          start,
          end,
          label: format(start, "LLLL", { locale: ru }),
          subLabel: "",
          hasData: availability.has(key),
        });
      }
      return buckets;
    }

    const monthStart = new Date(baseYear, baseMonth, 1);
    const monthEnd = endOfMonth(monthStart);
    const pointsInMonth = normalized.points.filter(
      (point) => point.datetime >= monthStart && point.datetime <= monthEnd
    );
    const availability = new Set<string>();
    for (const point of pointsInMonth) {
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
          subLabel: "",
          hasData: availability.has(key),
        });
        current.setDate(current.getDate() + 1);
      }
      return buckets;
    }

    let current = startOfWeek(monthStart, { weekStartsOn: 1 });
    const last = endOfWeek(monthEnd, { weekStartsOn: 1 });
    while (current <= last) {
      const weekStart = startOfWeek(current, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(current, { weekStartsOn: 1 });
      const key = toWeekKey(weekStart);
      const startLabel = format(weekStart, "dd", { locale: ru });
      const endLabel = format(weekEnd, "dd LLL", { locale: ru }).replace(".", "").toLowerCase();
      buckets.push({
        key,
        start: weekStart,
        end: weekEnd,
        label: `${startLabel} - ${endLabel}`,
        subLabel: "",
        hasData: availability.has(key),
      });
      current = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
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

  const shiftYear = (offset: number) => {
    const base = new Date(`${monthFilter}-01`);
    if (Number.isNaN(base.getTime())) return;
    const next = addYears(base, offset);
    const month = String(next.getMonth() + 1).padStart(2, "0");
    setMonthFilter(`${next.getFullYear()}-${month}`);
  };

  const hasAnyData = normalized.points.length > 0;

  const handlePeriodNav = (direction: -1 | 1) => {
    if (!hasAnyData) return;
    if (periodMode === "day" || periodMode === "week") {
      shiftMonth(direction);
      return;
    }
    if (periodMode === "month") {
      shiftYear(direction);
      return;
    }
    if (periodMode === "year") {
      shiftYear(direction);
    }
  };

  const periodMemoryRef = useRef<Record<
    PeriodMode,
    { key: string | null; keys: string[]; monthFilter: string; multi: boolean }
  >>({
    day: { key: null, keys: [], monthFilter, multi: false },
    week: { key: null, keys: [], monthFilter, multi: false },
    month: { key: null, keys: [], monthFilter, multi: false },
    year: { key: null, keys: [], monthFilter, multi: false },
  });

  useEffect(() => {
    periodMemoryRef.current[periodMode] = {
      key: selectedKey,
      keys: selectedKeys,
      monthFilter,
      multi: multiSelect,
    };
  }, [periodMode, selectedKey, selectedKeys, monthFilter, multiSelect]);

  const areKeysEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);

  const firstAvailableKey = useMemo(
    () =>
      periodBuckets.find((bucket) => bucket.hasData)?.key ??
      periodBuckets[0]?.key ??
      null,
    [periodBuckets]
  );

  useEffect(() => {
    const saved = periodMemoryRef.current[periodMode];
    if (!saved) return;
    const multiAllowed = periodMode === "day" || periodMode === "week";

    if (saved.monthFilter && saved.monthFilter !== monthFilter) {
      setMonthFilter(saved.monthFilter);
    }

    const nextMulti = multiAllowed && saved.multi;
    if (nextMulti !== multiSelect) {
      setMultiSelect(nextMulti);
    }

    if (nextMulti) {
      const nextKeys =
        saved.keys.length > 0
          ? saved.keys
          : saved.key
            ? [saved.key]
            : [];
      if (nextKeys.length && !areKeysEqual(nextKeys, selectedKeys)) {
        setSelectedKeys(nextKeys);
      }
      if (saved.key && saved.key !== selectedKey) {
        setSelectedKey(saved.key);
      }
    } else if (saved.key && saved.key !== selectedKey) {
      setSelectedKey(saved.key);
    }
  }, [periodMode]);

  useEffect(() => {
    if (periodMode === "month" || periodMode === "year") {
      if (multiSelect) setMultiSelect(false);
    }
  }, [periodMode, multiSelect]);

  useEffect(() => {
    if (!periodBuckets.length) {
      if (selectedKey !== null) setSelectedKey(null);
      if (selectedKeys.length) setSelectedKeys([]);
      return;
    }

    const validKeys = new Set(periodBuckets.map((bucket) => bucket.key));

    if (multiSelect && (periodMode === "day" || periodMode === "week")) {
      if (!selectedKeys.length && firstAvailableKey) {
        setSelectedKeys([firstAvailableKey]);
        setSelectedKey(firstAvailableKey);
        return;
      }
      if (selectedKey && !validKeys.has(selectedKey) && firstAvailableKey) {
        setSelectedKey(firstAvailableKey);
      }
      return;
    }

    if (selectedKey && validKeys.has(selectedKey)) {
      return;
    }

    if (firstAvailableKey !== selectedKey) {
      setSelectedKey(firstAvailableKey);
    }
  }, [periodBuckets, selectedKey, selectedKeys, multiSelect, periodMode, firstAvailableKey]);

  const handlePeriodChange = useCallback((value: PeriodMode) => {
    setPeriodMode(value);
  }, []);

  const handleGapChange = useCallback((value: GapMode) => {
    setGapMode(value);
  }, []);

  const multiAllowed = periodMode === "day" || periodMode === "week";
  const multiActive = multiAllowed && multiSelect;
  const maxMulti = MAX_MULTI_BY_PERIOD[periodMode];
  const multiCount = multiActive ? Math.max(1, selectedKeys.length) : 0;

  const handleMultiToggle = useCallback(() => {
    if (!multiAllowed) return;
    if (!multiSelect) {
      const initialKey = selectedKey ?? firstAvailableKey;
      if (initialKey) {
        setSelectedKeys([initialKey]);
        setSelectedKey(initialKey);
      }
      setMultiSelect(true);
      return;
    }
    setMultiSelect(false);
    if (selectedKeys.length) {
      setSelectedKey(selectedKeys[selectedKeys.length - 1]);
    }
  }, [multiAllowed, multiSelect, selectedKey, firstAvailableKey, selectedKeys]);

  const handleBucketSelect = useCallback(
    (bucketKey: string, isDisabled: boolean) => {
      if (dragMovedRef.current || isDisabled) return;

      if (!multiActive) {
        setSelectedKey(bucketKey);
        return;
      }

      setSelectedKey(bucketKey);
      setSelectedKeys((prev) => {
        if (prev.includes(bucketKey)) {
          if (prev.length === 1) return prev;
          return prev.filter((key) => key !== bucketKey);
        }
        if (prev.length >= maxMulti) return prev;
        return [...prev, bucketKey];
      });
    },
    [multiActive, maxMulti]
  );

  const activeBucket = useMemo(() => {
    if (!periodBuckets.length) return null;
    const map = new Map(periodBuckets.map((bucket) => [bucket.key, bucket]));
    if (selectedKey && map.has(selectedKey)) {
      return map.get(selectedKey) ?? null;
    }
    const firstKey = firstAvailableKey;
    return firstKey ? map.get(firstKey) ?? null : null;
  }, [selectedKey, periodBuckets, firstAvailableKey]);

  const timelineLabel = useMemo(() => {
    const base = new Date(`${monthFilter}-01`);
    const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;

    if (periodMode === "day" || periodMode === "week") {
      return format(safeBase, "LLLL yyyy", { locale: ru });
    }
    if (periodMode === "month") {
      return `${format(safeBase, "yyyy")} г.`;
    }
    if (periodMode === "year" && activeBucket) {
      return `${format(activeBucket.start, "yyyy")} г.`;
    }
    return `${safeBase.getFullYear()} г.`;
  }, [periodMode, monthFilter, activeBucket]);

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

  const selectedBuckets = useMemo(() => {
    if (!periodBuckets.length) return [];

    const parseKeyDate = (key: string) => {
      const parts = key.slice(2).split("-");
      if (parts.length < 3) return null;
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
      }
      return new Date(year, month, day);
    };

    if (multiSelect && (periodMode === "day" || periodMode === "week")) {
      return selectedKeys
        .map((key) => {
          if (periodMode === "day" && key.startsWith("d-")) {
            const date = parseKeyDate(key);
            if (!date) return null;
            const start = startOfDay(date);
            const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
            return { key, start, end };
          }
          if (periodMode === "week" && key.startsWith("w-")) {
            const date = parseKeyDate(key);
            if (!date) return null;
            const start = startOfWeek(date, { weekStartsOn: 1 });
            const end = endOfWeek(start, { weekStartsOn: 1 });
            return { key, start, end };
          }
          return null;
        })
        .filter((bucket): bucket is { key: string; start: Date; end: Date } => bucket !== null);
    }

    return activeBucket ? [activeBucket] : [];
  }, [periodBuckets, multiSelect, periodMode, selectedKeys, activeBucket]);

  const filteredPoints = useMemo(() => {
    if (!selectedBuckets.length) {
      return normalized.points;
    }
    return normalized.points.filter((point) => {
      const time = point.datetime.getTime();
      return selectedBuckets.some(
        (bucket) => time >= bucket.start.getTime() && time <= bucket.end.getTime()
      );
    });
  }, [normalized.points, selectedBuckets]);

  const gaps = useMemo(() => detectGaps(filteredPoints), [filteredPoints]);

  const scaleOptions = SCALE_OPTIONS_BY_PERIOD[periodMode];
  const fallbackScaleKey = DEFAULT_SCALE_BY_PERIOD[periodMode];
  const fallbackScale =
    AGGREGATION_OPTIONS.find((option) => option.key === fallbackScaleKey) ??
    AGGREGATION_OPTIONS[0];
  const selectedScale =
    AGGREGATION_OPTIONS.find((option) => option.key === scaleKey) ?? fallbackScale;

  useEffect(() => {
    setScaleKey(DEFAULT_SCALE_BY_PERIOD[periodMode]);
  }, [periodMode]);

  useEffect(() => {
    const updateIndicator = () => {
      const container = scaleGroupRef.current;
      const activeButton = scaleButtonRefs.current[scaleKey];
      if (!container || !activeButton) return;
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      setScaleIndicator({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    };

    const raf = requestAnimationFrame(updateIndicator);
    window.addEventListener("resize", updateIndicator);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateIndicator);
    };
  }, [scaleKey, scaleOptions]);

  const aggregated = useMemo(
    () => aggregateGlucosePoints(filteredPoints, selectedScale.minutes, gaps),
    [filteredPoints, selectedScale.minutes, gaps]
  );

  const chartSeries = useMemo(
    () => buildChartSeries(aggregated, gaps, gapMode === "show"),
    [aggregated, gaps, gapMode]
  );

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

  const trendRange = useMemo(() => {
    if (!selectedBuckets.length) {
      return { start: activeBucket?.start ?? null, end: activeBucket?.end ?? null };
    }
    const starts = selectedBuckets.map((bucket) => bucket.start.getTime());
    const ends = selectedBuckets.map((bucket) => bucket.end.getTime());
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    return {
      start: new Date(minStart),
      end: new Date(maxEnd),
    };
  }, [selectedBuckets, activeBucket]);

  const eventTrendSeries = useMemo(() => {
    const comparator =
      eventKind === "hypo"
        ? (value: number) => value < thresholds.targetLow
        : (value: number) => value > thresholds.targetHigh;
    return buildEventTrendSeries(
      filteredPoints,
      comparator,
      selectedScale.minutes,
      trendRange.start,
      trendRange.end
    );
  }, [
    filteredPoints,
    eventKind,
    thresholds.targetLow,
    thresholds.targetHigh,
    selectedScale.minutes,
    trendRange,
  ]);

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
    if (!selectedBuckets.length) {
      return { percent: null, missingLabel: "—" };
    }
    const durationMinutes = selectedBuckets.reduce((acc, bucket) => {
      const minutes = (bucket.end.getTime() - bucket.start.getTime()) / 60000;
      return acc + Math.max(0, minutes);
    }, 0);
    const expectedPoints = Math.max(1, Math.round(durationMinutes / 5));
    const actualPoints = filteredPoints.length;
    const missingPoints = Math.max(0, expectedPoints - actualPoints);
    const percent = (actualPoints / expectedPoints) * 100;
    const missingMinutes = missingPoints * 5;
    return {
      percent,
      missingLabel: `Нет данных: ${formatMissingDuration(missingMinutes)}`,
    };
  }, [selectedBuckets, filteredPoints.length]);

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
              <PeriodControls
                periodMode={periodMode}
                gapMode={gapMode}
                onPeriodChange={handlePeriodChange}
                onGapChange={handleGapChange}
              />
              <div className="ml-auto flex flex-col gap-1 text-right">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {PERIOD_COUNT_LABELS[periodMode]}
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {periodBuckets.length}
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="shadow-sm">
              <CardContent className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-4">
                  <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePeriodNav(-1)}
                          disabled={!hasAnyData}
                          className={`flex h-8 w-8 items-center justify-center text-lg text-muted-foreground transition ${
                            hasAnyData
                              ? "cursor-pointer hover:text-foreground"
                              : "cursor-not-allowed opacity-40"
                          }`}
                          aria-label="Предыдущий период"
                        >
                          ‹
                        </button>
                        <div
                          className={`flex h-9 items-center justify-center gap-2 rounded-full border border-[#E5E5E5] bg-background px-3 text-sm font-semibold text-foreground whitespace-nowrap ${
                            periodMode === "day" || periodMode === "week"
                              ? "w-[180px]"
                              : periodMode === "month"
                                ? "w-[130px]"
                                : "w-[96px]"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="3" y="4" width="18" height="18" rx="3" />
                            <path d="M16 2v4M8 2v4M3 10h18" />
                          </svg>
                          <span className={periodMode === "day" || periodMode === "week" ? "capitalize" : ""}>
                            {timelineLabel}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePeriodNav(1)}
                          disabled={!hasAnyData}
                          className={`flex h-8 w-8 items-center justify-center text-lg text-muted-foreground transition ${
                            hasAnyData
                              ? "cursor-pointer hover:text-foreground"
                              : "cursor-not-allowed opacity-40"
                          }`}
                          aria-label="Следующий период"
                        >
                          ›
                        </button>
                  </div>
                  <div className="relative ml-auto flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleMultiToggle}
                      disabled={!multiAllowed}
                      className={`absolute right-full mr-2 flex h-9 items-center overflow-hidden rounded-full bg-[#F3F4F6] transition-[width] duration-200 ${
                        multiActive ? "w-[140px]" : "w-11"
                      } ${
                        multiAllowed
                          ? "cursor-pointer text-muted-foreground hover:text-foreground"
                          : "cursor-not-allowed text-muted-foreground/40"
                      }`}
                      aria-label="Мультивыбор"
                    >
                      <span
                        className={`whitespace-nowrap pl-3 pr-12 text-xs transition-opacity duration-200 ${
                          multiActive ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        Выбрано: {multiCount} / {maxMulti}
                      </span>
                      <span
                        className={`absolute right-1 flex h-7 w-9 items-center justify-center rounded-full ${
                          multiActive ? "bg-foreground text-background shadow-sm" : "text-muted-foreground"
                        }`}
                      >
                        <MultiSelectIcon className="h-2.5 w-4" />
                      </span>
                    </button>
                    <div
                      ref={scaleGroupRef}
                      className="relative flex h-9 items-center rounded-full bg-[#F3F4F6] p-1 text-xs font-medium text-muted-foreground"
                    >
                      <span
                        className="pointer-events-none absolute top-1 bottom-1 rounded-full bg-foreground transition-[left,width] duration-200 ease-out"
                        style={{
                          left: scaleIndicator.left,
                          width: scaleIndicator.width,
                        }}
                      />
                      {scaleOptions.map((optionKey) => (
                        <button
                          key={optionKey}
                          type="button"
                          onClick={() => setScaleKey(optionKey)}
                          ref={(el) => {
                            scaleButtonRefs.current[optionKey] = el;
                          }}
                          className={`relative z-10 rounded-full px-3 py-1 transition ${
                            scaleKey === optionKey
                              ? "text-background"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {SCALE_LABELS[optionKey] ?? optionKey}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  ref={scrollRef}
                  className="w-full overflow-x-auto overflow-y-hidden no-scrollbar cursor-grab"
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
                  <div className="flex w-max min-w-full flex-nowrap justify-start gap-3 py-2">
                    {periodBuckets.map((bucket) => {
                      const isSelected = multiActive
                        ? selectedKeys.includes(bucket.key)
                        : activeBucket?.key === bucket.key;
                      const limitReached = multiActive && selectedKeys.length >= maxMulti;
                      const isDisabled =
                        (!bucket.hasData && !isSelected) || (limitReached && !isSelected);
                      return (
                        <button
                          key={bucket.key}
                          type="button"
                          disabled={isDisabled}
                          data-period-key={bucket.key}
                          onClick={() => {
                            if (periodMode === "month") {
                              setMonthFilter(format(bucket.start, "yyyy-MM"));
                            }
                            if (periodMode === "year") {
                              setMonthFilter(`${format(bucket.start, "yyyy")}-01`);
                            }
                            handleBucketSelect(bucket.key, isDisabled);
                          }}
                          className={`relative flex flex-col items-center justify-center overflow-visible rounded-full text-xs font-semibold transition ${
                            periodMode === "day"
                              ? "h-9 w-9 px-0"
                              : periodMode === "week"
                                ? "h-9 min-w-[96px] px-3"
                                : periodMode === "month"
                                  ? "h-9 min-w-[92px] px-3"
                                  : "h-9 min-w-[64px] px-3"
                          } ${
                            isSelected
                              ? "bg-foreground text-background shadow-sm"
                              : isDisabled
                                ? "cursor-not-allowed text-muted-foreground/40"
                                : "cursor-pointer text-foreground hover:text-foreground"
                          }`}
                        >
                          <span
                            className={`leading-none whitespace-nowrap ${
                              isSelected ? "text-sm font-semibold" : "text-sm font-medium"
                            }`}
                          >
                            {bucket.label}
                          </span>
                          {bucket.subLabel ? (
                            <span
                              className={`text-[10px] uppercase ${
                                isSelected
                                  ? "text-background/80"
                                  : isDisabled
                                    ? "text-muted-foreground/40"
                                    : "text-muted-foreground/70"
                              }`}
                            >
                              {bucket.subLabel}
                            </span>
                          ) : null}
                          {multiActive && isSelected ? (
                            <span className="absolute -bottom-2 h-0.5 w-2 rounded-full bg-foreground" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Динамика глюкозы</CardTitle>
              </CardHeader>
              <CardContent>
                <GlucoseChart
                  data={chartSeries}
                  intervalMinutes={selectedScale.minutes}
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

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-base">Динамика гипо/гипер событий</CardTitle>
                <div className="flex items-center rounded-full bg-[#F3F4F6] p-1 text-xs font-medium text-muted-foreground">
                  {(["hypo", "hyper"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setEventKind(kind)}
                      className={`rounded-full px-3 py-1 transition ${
                        eventKind === kind
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {kind === "hypo" ? "Гипо" : "Гипер"}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <EventsTrendChart
                  data={eventTrendSeries}
                  intervalMinutes={selectedScale.minutes}
                  singleDay={periodMode === "day" && !!activeBucket}
                  metric="count"
                  barColor={eventKind === "hypo" ? "#D61B20" : "#FFB800"}
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Динамика продолжительности гипо/гипер</CardTitle>
              </CardHeader>
              <CardContent>
                <EventsTrendChart
                  data={eventTrendSeries}
                  intervalMinutes={selectedScale.minutes}
                  singleDay={periodMode === "day" && !!activeBucket}
                  metric="avgDuration"
                  barColor={eventKind === "hypo" ? "#D61B20" : "#FFB800"}
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
