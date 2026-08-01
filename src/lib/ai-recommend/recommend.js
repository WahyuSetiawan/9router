// AI Recommendation Engine — suggests models for a given task category.
//
// Primary path: builds a structured prompt → calls a configurable LLM endpoint
// to get ranked recommendations with reasoning.
// Fallback path (fail-open): rule-based sorting by capability match → cheapest → highest context.
//
// Usage:
//   import { recommendModels } from "@/lib/ai-recommend/recommend.js";
//   const result = await recommendModels("coding");
//   // → { recommendations: [{ modelId, reasoning, score }] }
//
// Only reads from open-sse/ — never modifies it.

import { PROVIDER_MODELS } from "../../../open-sse/providers/index.js";
import { getCapabilitiesForModel } from "../../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../../open-sse/providers/pricing.js";
import { matchPattern } from "../../../open-sse/providers/pricing.js";

// ── Task categories ──────────────────────────────────────────────────────────

export const TASK_CATEGORIES = [
  "general",
  "review",
  "coding",
  "writing",
  "research",
  "analysis",
  "creative",
  "reasoning",
  "vision",
  "multimodal",
];

// Capability requirements per category (used by rule-based fallback scoring).
// Each entry lists capability checks that contribute to the score.
const CATEGORY_CAP_MAP = {
  general:     { vision: false, reasoning: false, search: false, tools: true },
  review:      { reasoning: true, tools: true, contextWindow: 100000 },
  coding:      { reasoning: true, tools: true, contextWindow: 200000 },
  writing:     { reasoning: true, maxOutput: 32000 },
  research:    { search: true, contextWindow: 200000 },
  analysis:    { reasoning: true, vision: true },
  creative:    { reasoning: true, imageOutput: false, audioOutput: false },
  reasoning:   { reasoning: true, tools: false },
  vision:      { vision: true, imageOutput: false },
  multimodal:  { vision: true, audioInput: true, videoInput: false },
};

// ── Model collector ──────────────────────────────────────────────────────────

/**
 * Collect all available models with their capabilities, pricing, and provider info.
 * Deduplicates by model id (first occurrence wins).
 * @returns {{ id, provider, providerName, capabilities, pricing }[]}
 */
export function collectAllModels() {
  const seen = new Set();
  const models = [];

  for (const [providerAlias, modelList] of Object.entries(PROVIDER_MODELS)) {
    if (!Array.isArray(modelList)) continue;

    for (const model of modelList) {
      const modelId = typeof model === "string" ? model : model.id;
      if (!modelId || seen.has(modelId)) continue;
      seen.add(modelId);

      const capabilities = getCapabilitiesForModel(providerAlias, modelId);
      const pricing = getPricingForModel(providerAlias, modelId);

      models.push({
        id: modelId,
        provider: providerAlias,
        providerName: providerAlias,
        capabilities,
        pricing,
      });
    }
  }

  return models;
}

// ── Rule-based fallback scorer ───────────────────────────────────────────────

/**
 * Score a model for a given category using its capabilities.
 * Higher = better match. Based on how well the model's capabilities
 * match the category's requirements.
 */
function scoreModelForCategory(model, category) {
  const caps = CATEGORY_CAP_MAP[category] || CATEGORY_CAP_MAP.general;
  const mcap = model.capabilities || {};
  let score = 0;

  // Capability matches (higher weight)
  if (caps.reasoning !== undefined) {
    if (mcap.reasoning === caps.reasoning) score += 30;
    else if (caps.reasoning) score -= 20; // penalty for missing required capability
  }
  if (caps.vision !== undefined) {
    if (mcap.vision === caps.vision) score += 20;
    else if (caps.vision) score -= 15;
  }
  if (caps.search !== undefined) {
    if (mcap.search === caps.search) score += 15;
    else if (caps.search) score -= 10;
  }
  if (caps.tools !== undefined) {
    if (mcap.tools === caps.tools) score += 10;
    else if (caps.tools) score -= 10;
  }
  if (caps.audioInput !== undefined) {
    if (mcap.audioInput === caps.audioInput) score += 10;
    else if (caps.audioInput) score -= 10;
  }
  if (caps.videoInput !== undefined) {
    if (mcap.videoInput === caps.videoInput) score += 10;
    else if (caps.videoInput) score -= 10;
  }

  // Context window bonus (above the minimum requirement)
  const reqCtx = caps.contextWindow || 0;
  if (mcap.contextWindow >= reqCtx) {
    score += 5;
    // Extra bonus for larger context
    if (mcap.contextWindow >= 500000) score += 5;
    else if (mcap.contextWindow >= 200000) score += 3;
  } else {
    score -= 10;
  }

  // Max output bonus
  const reqOut = caps.maxOutput || 0;
  if (mcap.maxOutput >= reqOut) {
    score += 5;
  }

  return score;
}

/**
 * Rule-based fallback: sort models by category match, then cheapest, then largest context.
 * Returns top N recommendations with auto-generated reasoning.
 */
function fallbackRecommend(models, category, topN = 10) {
  const scored = models
    .map((m) => ({
      modelId: m.id,
      score: scoreModelForCategory(m, category),
      pricing: m.pricing,
      contextWindow: m.capabilities?.contextWindow || 0,
    }))
    .sort((a, b) => {
      // Descending score
      if (b.score !== a.score) return b.score - a.score;
      // By cheapest (input + output average)
      const aPrice = (a.pricing?.input || 0) + (a.pricing?.output || 0);
      const bPrice = (b.pricing?.input || 0) + (b.pricing?.output || 0);
      if (aPrice !== bPrice) return aPrice - bPrice;
      // By largest context
      return b.contextWindow - a.contextWindow;
    })
    .slice(0, topN);

  return scored.map((s) => ({
    modelId: s.modelId,
    score: s.score,
    reasoning: generateFallbackReasoning(s.modelId, s.score, category),
  }));
}

function generateFallbackReasoning(modelId, score, category) {
  if (score >= 70) return `Excellent match for ${category} tasks — strong capability alignment.`;
  if (score >= 50) return `Good fit for ${category} tasks — covers core requirements.`;
  if (score >= 30) return `Adequate for ${category} tasks — may lack some capabilities.`;
  return `Basic model — consider only for simple ${category} tasks.`;
}

// ── Prompt builder (for LLM primary path) ───────────────────────────────────

/**
 * Build a structured prompt for the LLM to generate recommendations.
 */
export function buildRecommendPrompt(category, models, options = {}) {
  const topN = options.topN || 20;
  // Send a representative sample (avoid blowing the context)
  const sample = models.slice(0, 50).map((m) => {
    const c = m.capabilities || {};
    const p = m.pricing || {};
    return {
      id: m.id,
      provider: m.provider,
      vision: c.vision,
      reasoning: c.reasoning,
      search: c.search,
      tools: c.tools,
      contextWindow: c.contextWindow,
      maxOutput: c.maxOutput,
      priceInput: p.input,
      priceOutput: p.output,
    };
  });

  return {
    model: options.model || "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an AI model recommendation engine. Given a task category and a list of available AI models with their capabilities and pricing, recommend the best models for that category.

Rules:
- Return exactly a valid JSON object with a "recommendations" array
- Each recommendation: { modelId: string, reasoning: string, score: number (0-100) }
- Score reflects how well the model fits the task category
- Prioritize capability fit over price, but consider cost-effectiveness
- Return exactly ${topN} recommendations
- Only include models from the provided list`,
      },
      {
        role: "user",
        content: `Task category: "${category}"

Available models (id, capabilities, pricing in $/1M tokens):
${JSON.stringify(sample, null, 2)}

Return a JSON object: { "recommendations": [{ "modelId": "...", "reasoning": "...", "score": 0-100 }] }`,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  };
}

// ── LLM caller ──────────────────────────────────────────────────────────────

/**
 * Call an LLM endpoint with the recommendation prompt.
 * @param {object} prompt — result of buildRecommendPrompt()
 * @param {object} options
 * @param {string} [options.apiEndpoint] — OpenAI-compatible chat completions URL
 * @param {string} [options.apiKey] — API key for the endpoint
 * @returns {Promise<{ recommendations: { modelId, reasoning, score }[] }|null>}
 */
export async function callRecommendLLM(prompt, options = {}) {
  const endpoint =
    options.apiEndpoint ||
    process.env.AI_RECOMMEND_ENDPOINT ||
    "http://localhost:20128/v1/chat/completions";

  const apiKey =
    options.apiKey ||
    process.env.AI_RECOMMEND_API_KEY ||
    "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(prompt),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed?.recommendations)) {
      return parsed;
    }

    return null;
  } catch {
    return null; // fail-open: fallback will handle it
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Recommend models for a task category.
 *
 * @param {string} category — from TASK_CATEGORIES
 * @param {object} [options]
 * @param {number} [options.topN=10] — max recommendations to return
 * @param {string} [options.apiEndpoint] — LLM endpoint (default: localhost:20128)
 * @param {string} [options.apiKey] — API key for LLM endpoint
 * @param {boolean} [options.skipLLM=false] — skip LLM call, use rule-based only
 * @returns {Promise<{ recommendations: { modelId, reasoning, score }[] }>}
 */
export async function recommendModels(category, options = {}) {
  if (!TASK_CATEGORIES.includes(category)) {
    throw new Error(
      `Unknown category "${category}". Valid: ${TASK_CATEGORIES.join(", ")}`
    );
  }

  const topN = options.topN || 10;
  const allModels = collectAllModels();

  if (allModels.length === 0) {
    return { recommendations: [] };
  }

  // Primary: try LLM call
  if (!options.skipLLM) {
    const prompt = buildRecommendPrompt(category, allModels, { topN });
    const llmResult = await callRecommendLLM(prompt, {
      apiEndpoint: options.apiEndpoint,
      apiKey: options.apiKey,
    });

    if (llmResult?.recommendations?.length) {
      // Validate returned modelIds exist in our list
      const validIds = new Set(allModels.map((m) => m.id));
      const valid = llmResult.recommendations.filter((r) => validIds.has(r.modelId));
      if (valid.length) {
        return { recommendations: valid.slice(0, topN) };
      }
    }
  }

  // Fallback: rule-based sorting
  return { recommendations: fallbackRecommend(allModels, category, topN) };
}
