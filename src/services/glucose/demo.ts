import { GlucosePoint } from "@/types/glucose";
import { createId } from "@/utils/id";

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

export const createDemoGlucoseData = (): GlucosePoint[] => {
  const points: GlucosePoint[] = [];
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const totalPoints = 24 * 12;

  for (let i = 0; i <= totalPoints; i += 1) {
    const timestamp = new Date(start.getTime() + i * 5 * 60 * 1000);

    const hour = timestamp.getHours();
    const base =
      hour < 6 ? 5.5 : hour < 10 ? 7.8 : hour < 14 ? 8.2 : hour < 18 ? 7.2 : 6.4;

    const value = Math.max(3.5, base + randomBetween(-1.2, 1.8));

    points.push({
      id: createId(),
      datetime: timestamp,
      value: Math.round(value * 10) / 10,
      source: "excel",
    });
  }

  // искусственные пропуски
  return points.filter((point) => {
    const hours = point.datetime.getHours();
    const minutes = point.datetime.getMinutes();
    const isGapOne = hours === 9 && minutes >= 20 && minutes <= 50;
    const isGapTwo = hours === 16 && minutes >= 5 && minutes <= 35;
    return !(isGapOne || isGapTwo);
  });
};
