import { NextResponse } from "next/server";
import { recommendModels, TASK_CATEGORIES } from "@/lib/ai-recommend";

export const dynamic = "force-dynamic";

// POST /api/model-presets/recommend — get AI recommendations for a category
export async function POST(request) {
  try {
    const body = await request.json();
    const { category, topN } = body;

    if (!category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    if (!TASK_CATEGORIES.includes(category)) {
      return NextResponse.json({
        error: `Invalid category. Valid categories: ${TASK_CATEGORIES.join(", ")}`
      }, { status: 400 });
    }

    const result = await recommendModels(category, { topN });
    return NextResponse.json({ recommendations: result.recommendations });
  } catch (error) {
    console.log("Error getting recommendations:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}