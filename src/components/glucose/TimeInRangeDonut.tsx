"use client";

import { Pie, PieChart, Cell, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatOptionalNumber } from "@/utils/format";

type DonutSlice = {
  key: string;
  label: string;
  range: string;
  color: string;
  count: number;
  percent: number;
};

type TimeInRangeDonutProps = {
  data: DonutSlice[];
  total: number;
};

export const TimeInRangeDonut = ({ data, total }: TimeInRangeDonutProps) => {
  const tir = data.find((slice) => slice.key === "tir");
  const centerLabel = tir ? `${formatOptionalNumber(tir.percent, 0)}%` : "—";

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Time In Range</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="relative flex h-[260px] items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                innerRadius="62%"
                outerRadius="90%"
                paddingAngle={2}
                stroke="transparent"
              >
                {data.map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">TIR</div>
            <div className="text-3xl font-semibold text-foreground">{centerLabel}</div>
            <div className="text-[11px] text-muted-foreground">
              Цель &gt; 70%
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          {data.map((slice) => (
            <div key={slice.key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-3 w-3 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <div>
                  <div className="text-sm text-foreground">{slice.label}</div>
                  <div className="text-[11px] text-muted-foreground">{slice.range} mmol/L</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-foreground">
                  {total ? formatOptionalNumber(slice.percent, 0) : "—"}%
                </div>
                <div className="text-[11px] text-muted-foreground">{slice.count} точек</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
