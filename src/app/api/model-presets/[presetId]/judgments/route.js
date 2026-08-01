import { NextResponse } from "next/server";
import { getJudgmentsByPreset, createJudgment, getPresetById } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/model-presets/[presetId]/judgments — list judgments for a preset
export async function GET(request, { params }) {
  try {
    const { presetId } = await params;

    const preset = await getPresetById(presetId);
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const accepted = searchParams.get("accepted");
    const provider = searchParams.get("provider");

    let judgments = await getJudgmentsByPreset(presetId);

    // Optional server-side filtering
    if (accepted !== null) {
      const val = accepted === "true" ? 1 : accepted === "false" ? 0 : null;
      if (val !== null) judgments = judgments.filter((j) => j.accepted === val);
    }
    if (provider) {
      judgments = judgments.filter((j) => j.provider === provider);
    }

    return NextResponse.json({ judgments });
  } catch (error) {
    console.log("Error fetching judgments:", error);
    return NextResponse.json({ error: "Failed to fetch judgments" }, { status: 500 });
  }
}

// POST /api/model-presets/[presetId]/judgments — create a judgment
export async function POST(request, { params }) {
  try {
    const { presetId } = await params;

    const preset = await getPresetById(presetId);
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    const body = await request.json();
    const { model_id, provider, reasoning, score, accepted } = body;

    if (!model_id || !model_id.trim()) {
      return NextResponse.json({ error: "model_id is required" }, { status: 400 });
    }

    const judgment = await createJudgment({
      preset_id: presetId,
      model_id: model_id.trim(),
      provider: provider || null,
      reasoning: reasoning || null,
      score: score != null ? score : null,
      accepted,
    });

    return NextResponse.json(judgment, { status: 201 });
  } catch (error) {
    console.log("Error creating judgment:", error);
    return NextResponse.json({ error: "Failed to create judgment" }, { status: 500 });
  }
}
