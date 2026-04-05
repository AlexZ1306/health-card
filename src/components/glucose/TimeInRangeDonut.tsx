"use client";

import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
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
      <CardContent className="flex flex-col gap-2">
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
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0]?.payload as DonutSlice | undefined;
                  if (!item) return null;
                  return (
                    <div className="rounded-lg border border-border bg-background/95 p-3 text-xs shadow-md">
                      <div className="flex items-center gap-2 text-foreground">
                        <span
                          className="inline-flex h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-semibold">{item.label}</span>
                      </div>
                      <div className="mt-2 grid gap-1 text-muted-foreground">
                        <div>{item.range} mmol/L</div>
                        <div>
                          {formatOptionalNumber(item.percent, 0)}% • {item.count} точек
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
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
      </CardContent>
    </Card>
  );
};
