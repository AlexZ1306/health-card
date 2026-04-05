"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseExcelFile, parseManualText } from "@/services/glucose/parsers";
import { normalizeGlucosePoints } from "@/services/glucose/normalize";
import type { GlucosePoint } from "@/types/glucose";

const STORAGE_KEYS = {
  excel: "glucose_excel_points",
  manual: "glucose_manual_points",
  fileName: "glucose_file_name",
};

const serializePoints = (points: GlucosePoint[]) =>
  JSON.stringify(
    points.map((point) => ({
      ...point,
      datetime: point.datetime.toISOString(),
    }))
  );

const deserializePoints = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<{
      id: string;
      datetime: string;
      value: number;
      source: "excel" | "manual";
    }>;
    return parsed.map((point) => ({
      ...point,
      datetime: new Date(point.datetime),
    }));
  } catch {
    return [];
  }
};

export const GlucoseDataManager = () => {
  const isDemo = process.env.NEXT_PUBLIC_DEMO === "true";
  const [excelPoints, setExcelPoints] = useState<GlucosePoint[]>([]);
  const [manualPoints, setManualPoints] = useState<GlucosePoint[]>([]);
  const [manualText, setManualText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const normalized = useMemo(
    () => normalizeGlucosePoints([...excelPoints, ...manualPoints]),
    [excelPoints, manualPoints]
  );

  useEffect(() => {
    setExcelPoints(deserializePoints(localStorage.getItem(STORAGE_KEYS.excel)));
    setManualPoints(deserializePoints(localStorage.getItem(STORAGE_KEYS.manual)));
    setFileName(localStorage.getItem(STORAGE_KEYS.fileName));
  }, []);

  const saveToStorage = (excel: GlucosePoint[], manual: GlucosePoint[], name: string | null) => {
    localStorage.setItem(STORAGE_KEYS.excel, serializePoints(excel));
    localStorage.setItem(STORAGE_KEYS.manual, serializePoints(manual));
    if (name) {
      localStorage.setItem(STORAGE_KEYS.fileName, name);
    } else {
      localStorage.removeItem(STORAGE_KEYS.fileName);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length) return;
    setIsParsing(true);
    try {
      const parsed = await Promise.all(files.map((file) => parseExcelFile(file)));
      const nextExcel = parsed.flat();
      setExcelPoints(nextExcel);
      setFileName(`Файлов: ${files.length}`);
      saveToStorage(nextExcel, manualPoints, `Файлов: ${files.length}`);
      setImportError(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleManualParse = () => {
    const parsed = parseManualText(manualText);
    setManualPoints(parsed);
    saveToStorage(excelPoints, parsed, fileName);
  };

  const handleFolderImport = async () => {
    if (isDemo) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const response = await fetch("/api/glucose/import");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось прочитать папку.");
      }
      const parsed = (payload.points ?? []).map(
        (point: { id: string; datetime: string; value: number; source: "excel" }) => ({
          ...point,
          datetime: new Date(point.datetime),
        })
      );
      setExcelPoints(parsed);
      const name = `Папка данных (${payload.filesCount ?? 0} файлов)`;
      setFileName(name);
      saveToStorage(parsed, manualPoints, name);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Ошибка импорта.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#ffffff_45%,_#ecfeff)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Image src="/logo.svg" alt="Логотип" width={140} height={36} priority />
              <h1 className="text-2xl font-semibold text-foreground">Управление данными</h1>
              {fileName ? (
                <Badge variant="secondary" className="rounded-full">
                  {fileName}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Импортируйте Excel или вставляйте строки вручную. Данные сохраняются для
              дашборда.
            </p>
          </div>
          <Button asChild>
            <Link href="/">К дашборду</Link>
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Загрузка Excel</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              {!isDemo ? (
                <Button variant="secondary" onClick={handleFolderImport} disabled={isImporting}>
                  Импортировать все файлы из папки
                </Button>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Импорт папки доступен в локальной версии.
                </div>
              )}
              <Input
                type="file"
                accept=".xlsx"
                multiple
                onChange={handleFileChange}
                disabled={isParsing}
              />
              <div>
                Формат: столбцы с временем и значением глюкозы. Поддерживаются заголовки
                Time / Glucose.
              </div>
              {importError ? <div className="text-xs text-red-500">{importError}</div> : null}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Вставка вручную</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <Textarea
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                placeholder={`Time | Glucose mmol/L\n2026-04-04 12:00 | 20.6`}
                className="min-h-[160px] resize-none"
              />
              <Button variant="secondary" onClick={handleManualParse}>
                Обработать строки
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Сводка данных</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-5">
            <div className="flex items-center justify-between">
              <span>Excel</span>
              <span className="text-foreground">{excelPoints.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Вручную</span>
              <span className="text-foreground">{manualPoints.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>После очистки</span>
              <span className="text-foreground">{normalized.points.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Дубликаты</span>
              <span className="text-foreground">{normalized.duplicateCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Невалидные</span>
              <span className="text-foreground">{normalized.invalidCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
