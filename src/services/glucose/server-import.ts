import "server-only";
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs/promises";
import { createId } from "@/utils/id";

export type GlucosePointDto = {
  id: string;
  datetime: string;
  value: number;
  source: "excel";
};

const DATA_FOLDER =
  "C:\\Users\\zinal\\Desktop\\Family diabetes dashboard\\Данные о глюкозе excel";

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

export const importGlucoseFromFolder = async () => {
  const files = await fs.readdir(DATA_FOLDER);
  const excelFiles = files.filter((file) => file.toLowerCase().endsWith(".xlsx"));

  const points: GlucosePointDto[] = [];

  for (const file of excelFiles) {
    const filePath = path.join(DATA_FOLDER, file);
    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = extractRows(worksheet);
    const { headerIndex, timeIndex, valueIndex } = detectColumnIndexes(rows);

    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      const datetime = parseDateValue(row[timeIndex]);
      const value = parseNumber(row[valueIndex]);
      if (!datetime || value === null) continue;
      points.push({
        id: createId(),
        datetime: datetime.toISOString(),
        value,
        source: "excel",
      });
    }
  }

  return { points, filesCount: excelFiles.length };
};
