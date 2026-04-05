import { NextResponse } from "next/server";
import { importGlucoseFromFolder } from "@/services/glucose/server-import";

export async function GET() {
  try {
    const { points, filesCount } = await importGlucoseFromFolder();
    return NextResponse.json({ points, filesCount });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось прочитать папку данных.";
    return NextResponse.json({ points: [], filesCount: 0, error: message }, { status: 500 });
  }
}
