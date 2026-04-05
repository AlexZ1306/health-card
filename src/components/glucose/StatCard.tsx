import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
};

export const StatCard = ({ label, value, hint }: StatCardProps) => (
  <Card className="shadow-sm">
    <CardContent className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </CardContent>
  </Card>
);
