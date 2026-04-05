import * as XLSX from "xlsx";
import { GlucosePoint, GlucoseSource } from "@/types/glucose";
import { createId } from "@/utils/id";

const TIME_HEADER_MATCHERS = [/time/i, /дата/i, /date/i];
const VALUE_HEADER_MATCHERS = [/glucose/i, /глюкоз/i, /mmol/i, /сахар/i];

const isHeaderMatch = (value: unknown, matchers: RegExp[]) => {
  if (typeof value !== "string") return false;
  return matchers.some((matcher) => matcher.test(value.toLowerCase()));
};

const parseNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/\s/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const parseDateValue = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const extractRows = (worksheet: XLSX.WorkSheet) =>
  XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

const detectColumnIndexes = (rows: unknown[][]) => {
  let headerIndex = 0;
  let timeIndex = 0;
  let valueIndex = 1;

  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i];
    if (!row) continue;
    const timeCandidate = row.findIndex((cell) =>
      isHeaderMatch(cell, TIME_HEADER_MATCHERS)
    );
    const valueCandidate = row.findIndex((cell) =>
      isHeaderMatch(cell, VALUE_HEADER_MATCHERS)
    );
    if (timeCandidate !== -1 && valueCandidate !== -1) {
      headerIndex = i;
      timeIndex = timeCandidate;
      valueIndex = valueCandidate;
      return { headerIndex, timeIndex, valueIndex };
    }
  }

  return { headerIndex, timeIndex, valueIndex };
};

const buildPoint = (
  datetime: Date,
  value: number,
  source: GlucoseSource
): GlucosePoint => ({
  id: createId(),
  datetime,
  value,
  source,
});

export const parseExcelFile = async (file: File): Promise<GlucosePoint[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  const rows = extractRows(worksheet);
  const { headerIndex, timeIndex, valueIndex } = detectColumnIndexes(rows);

  const points: GlucosePoint[] = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const datetime = parseDateValue(row[timeIndex]);
    const value = parseNumber(row[valueIndex]);
    if (!datetime || value === null) continue;
    points.push(buildPoint(datetime, value, "excel"));
  }

  return points;
};

export const parseManualText = (text: string): GlucosePoint[] => {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const points: GlucosePoint[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (line.toLowerCase().includes("time") || line.toLowerCase().includes("глюк")) {
      continue;
    }

    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 2) {
      const tabParts = line.split("\t").map((part) => part.trim());
      if (tabParts.length >= 2) {
        parts.splice(0, parts.length, ...tabParts);
      }
    }

    if (parts.length < 2) continue;

    const datetime = parseDateValue(parts[0]);
    const value = parseNumber(parts[1]);

    if (!datetime || value === null) continue;
    points.push(buildPoint(datetime, value, "manual"));
  }

  return points;
};
