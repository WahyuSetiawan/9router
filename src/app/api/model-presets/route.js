import { NextResponse } from "next/server";
import { getAllPresets, createPreset, upsertJudgmentsForPreset } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/model-presets — list semua preset
export async function GET() {
  try {
    const presets = await getAllPresets();
    return NextResponse.json({ presets });
  } catch (error) {
    console.log("Error fetching presets:", error);
    return NextResponse.json({ error: "Failed to fetch presets" }, { status: 500 });
  }
}

// POST /api/model-presets — create preset
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, description, models, judgments } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (models !== undefined && !Array.isArray(models)) {
      return NextResponse.json({ error: "Models must be an array of strings" }, { status: 400 });
    }

    const preset = await createPreset({ name: name.trim(), description, models });

    // Create judgments for each model if provided
    if (judgments && Array.isArray(judgments) && judgments.length > 0) {
      await upsertJudgmentsForPreset(preset.id, judgments);
    }

    return NextResponse.json(preset, { status: 201 });
  } catch (error) {
    console.log("Error creating preset:", error);
    return NextResponse.json({ error: "Failed to create preset" }, { status: 500 });
  }
}
