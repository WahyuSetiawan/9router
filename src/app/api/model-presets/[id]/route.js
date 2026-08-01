import { NextResponse } from "next/server";
import { getPresetById, updatePreset, deletePreset } from "@/lib/db";

// GET /api/model-presets/[id] — single preset
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const preset = await getPresetById(id);

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    return NextResponse.json(preset);
  } catch (error) {
    console.log("Error fetching preset:", error);
    return NextResponse.json({ error: "Failed to fetch preset" }, { status: 500 });
  }
}

// PUT /api/model-presets/[id] — update preset
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (body.models !== undefined && !Array.isArray(body.models)) {
      return NextResponse.json({ error: "Models must be an array of strings" }, { status: 400 });
    }

    const data = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description;
    if (body.models !== undefined) data.models = body.models;

    const preset = await updatePreset(id, data);

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    return NextResponse.json(preset);
  } catch (error) {
    console.log("Error updating preset:", error);
    return NextResponse.json({ error: "Failed to update preset" }, { status: 500 });
  }
}

// DELETE /api/model-presets/[id] — delete preset
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const success = await deletePreset(id);

    if (!success) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting preset:", error);
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 });
  }
}
