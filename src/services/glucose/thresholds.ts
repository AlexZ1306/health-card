import type { Thresholds } from "@/types/glucose";

export const DEFAULT_THRESHOLDS: Thresholds = {
  veryHigh: 13.9,
  high: 10.1,
  targetLow: 3.9,
  targetHigh: 10.0,
  low: 3.0,
  veryLow: 3.0,
};

const STORAGE_KEY = "glucose_thresholds";
const MIN_ALLOWED = 0.1;
const MAX_ALLOWED = 50;

const sanitizeValue = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < MIN_ALLOWED || parsed > MAX_ALLOWED) return fallback;
  return parsed;
};

export const loadThresholds = (): Thresholds => {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_THRESHOLDS;
  try {
    const parsed = JSON.parse(stored) as Partial<Thresholds>;
    return {
      veryHigh: sanitizeValue(parsed.veryHigh, DEFAULT_THRESHOLDS.veryHigh),
      high: sanitizeValue(parsed.high, DEFAULT_THRESHOLDS.high),
      targetLow: sanitizeValue(parsed.targetLow, DEFAULT_THRESHOLDS.targetLow),
      targetHigh: sanitizeValue(parsed.targetHigh, DEFAULT_THRESHOLDS.targetHigh),
      low: sanitizeValue(parsed.low, DEFAULT_THRESHOLDS.low),
      veryLow: sanitizeValue(parsed.veryLow, DEFAULT_THRESHOLDS.veryLow),
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
};

export const saveThresholds = (thresholds: Thresholds) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
};

export const validateThresholds = (thresholds: Thresholds) => {
  const values = Object.values(thresholds);
  if (values.some((value) => !Number.isFinite(value))) {
    return "Все значения должны быть числами.";
  }
  if (values.some((value) => value < MIN_ALLOWED || value > MAX_ALLOWED)) {
    return "Пороговые значения должны быть в диапазоне 0.1–50 ммоль/л.";
  }
  if (thresholds.veryLow > thresholds.low) {
    return "Очень низкий не может быть выше низкого.";
  }
  if (thresholds.low > thresholds.targetLow) {
    return "Низкий не может быть выше целевого диапазона.";
  }
  if (thresholds.targetLow >= thresholds.targetHigh) {
    return "Нижняя граница цели должна быть ниже верхней.";
  }
  if (thresholds.targetHigh > thresholds.high) {
    return "Верхняя граница цели не может быть выше высокого уровня.";
  }
  if (thresholds.high > thresholds.veryHigh) {
    return "Высокий не может быть выше очень высокого.";
  }
  return null;
};
