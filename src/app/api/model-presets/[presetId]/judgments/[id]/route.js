import { NextResponse } from "next/server";
import { updateJudgment, deleteJudgment } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/model-presets/[presetId]/judgments/[id] — single judgment
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const { getJudgmentById } = await import("@/lib/db/repos/modelJudgmentsRepo.js");
    const judgment = await getJudgmentById(id);

    if (!judgment) {
      return NextResponse.json({ error: "Judgment not found" }, { status: 404 });
    }

    return NextResponse.json(judgment);
  } catch (error) {
    console.log("Error fetching judgment:", error);
    return NextResponse.json({ error: "Failed to fetch judgment" }, { status: 500 });
  }
}

// PUT /api/model-presets/[presetId]/judgments/[id] — update judgment
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.model_id !== undefined && !body.model_id.trim()) {
      return NextResponse.json({ error: "model_id cannot be empty" }, { status: 400 });
    }

    const data = {};
    if (body.model_id !== undefined) data.model_id = body.model_id.trim();
    if (body.provider !== undefined) data.provider = body.provider;
    if (body.reasoning !== undefined) data.reasoning = body.reasoning;
    if (body.score !== undefined) data.score = body.score;
    if (body.accepted !== undefined) data.accepted = body.accepted;

    const judgment = await updateJudgment(id, data);

    if (!judgment) {
      return NextResponse.json({ error: "Judgment not found" }, { status: 404 });
    }

    return NextResponse.json(judgment);
  } catch (error) {
    console.log("Error updating judgment:", error);
    return NextResponse.json({ error: "Failed to update judgment" }, { status: 500 });
  }
}

// DELETE /api/model-presets/[presetId]/judgments/[id] — delete judgment
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const success = await deleteJudgment(id);

    if (!success) {
      return NextResponse.json({ error: "Judgment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting judgment:", error);
    return NextResponse.json({ error: "Failed to delete judgment" }, { status: 500 });
  }
}