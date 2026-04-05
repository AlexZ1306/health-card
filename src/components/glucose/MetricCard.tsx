"use client";

import { Card, CardContent } from "@/components/ui/card";

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  tooltip: string;
};

export const MetricCard = ({ label, value, hint, tooltip }: MetricCardProps) => {
  return (
    <Card className="shadow-sm overflow-visible">
      <CardContent className="relative flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <div className="group relative">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
              i
            </span>
            <div className="pointer-events-none absolute right-0 top-6 z-20 w-56 rounded-lg border border-border bg-background p-2 text-xs text-muted-foreground opacity-0 shadow-md transition group-hover:opacity-100">
              {tooltip}
            </div>
          </div>
        </div>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
};
