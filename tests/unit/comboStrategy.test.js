import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  pickSessionAffinity,
  pickLeastUsed,
  evictSessionModel,
  handleRaceChat,
} from "../../open-sse/services/combo.js";
import {
  COMBO_STRATEGIES,
  NON_CHAT_COMBO_STRATEGIES,
  normalizeComboStrategy,
} from "../../open-sse/config/comboStrategies.js";

// ---- Helpers ----

/** Minimal Response stub with a cancellable .body — mirrors real upstream responses. */
function makeResponse({ ok, status, delayMs = 0, onCancel }) {
  const json = { error: { message: "boom" } };
  if (ok) json.choices = [{ message: { role: "assistant", content: "ok" } }];
  const make = () => ({
    ok,
    status,
    body: { cancel: () => onCancel?.() },
    clone: make,
    json: async () => json,
  });
  const res = make();
  if (delayMs > 0) {
    return new Promise((r) => setTimeout(() => r(res), delayMs));
  }
  return res;
}

function makeErrorResponse(status = 500) {
  return makeResponse({ ok: false, status });
}

/** A rotated list must be a permutation of the input (same set, same length). */
function expectPermutation(actual, models) {
  expect(actual).toHaveLength(models.length);
  expect([...actual].sort()).toEqual([...models].sort());
}

// ---- session-affinity ----

describe("session-affinity strategy", () => {
  it("same sessionId returns sticky first model on second call", () => {
    const models = ["provider/a", "provider/b", "provider/c", "provider/d"];
    const comboName = "affinity-sticky-" + Date.now();
    const sessionId = "sess-sticky";

    const r1 = pickSessionAffinity(models, comboName, sessionId, {});
    const r2 = pickSessionAffinity(models, comboName, sessionId, {});

    // First model must be identical (sticky pin)
    expect(r1[0]).toBe(r2[0]);
    // Both must be valid permutations of models
    expectPermutation(r1, models);
    expectPermutation(r2, models);
  });

  it("different sessionIds can get different first models (jitter spread)", () => {
    const models = ["provider/a", "provider/b", "provider/c", "provider/d"];
    const comboName = "affinity-spread-" + Date.now();

    const picks = new Set();
    for (let i = 0; i < 30; i++) {
      const r = pickSessionAffinity(models, comboName, "sess-" + i, {});
      picks.add(r[0]);
    }

    // With 4 models and 30 sessions, jitter should spread across multiple models
    expect(picks.size).toBeGreaterThanOrEqual(2);
  });

  it("falls back to pickLeastUsed when sessionId is falsy", () => {
    const models = ["provider/a", "provider/b", "provider/c"];
    const comboName = "affinity-fallback-" + Date.now();

    const r1 = pickSessionAffinity(models, comboName, null, {});
    const r2 = pickSessionAffinity(models, comboName, undefined, {});

    // Both calls should delegate to pickLeastUsed and return valid permutations
    expectPermutation(r1, models);
    expectPermutation(r2, models);
  });

  it("evictSessionModel removes pin and forces re-pick", () => {
    const models = ["provider/a", "provider/b", "provider/c", "provider/d"];
    const comboName = "affinity-evict-" + Date.now();
    const sessionId = "sess-evict";

    // First call pins a model
    const r1 = pickSessionAffinity(models, comboName, sessionId, {});
    const pinned = r1[0];

    // Evict the pin
    evictSessionModel(comboName, sessionId);

    // Re-pick — with 4 models, probability of same pick is 25%, so 5 trials should show variation
    let changed = false;
    for (let i = 0; i < 5; i++) {
      const r2 = pickSessionAffinity(models, comboName, sessionId, {});
      if (r2[0] !== pinned) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it("eviction condition: 4xx non-408/429 triggers evict, 408/429/5xx do NOT", () => {
    // This documents the contract used by chat.js sticky wrapper.
    // The condition is: s >= 400 && s !== 408 && s !== 429 && s < 500
    const shouldEvict = (status) => status >= 400 && status !== 408 && status !== 429 && status < 500;

    // 4xx non-408/429 → evict
    expect(shouldEvict(401)).toBe(true);
    expect(shouldEvict(403)).toBe(true);
    expect(shouldEvict(404)).toBe(true);
    expect(shouldEvict(410)).toBe(true);

    // 408/429 → NO evict (transient/backoff)
    expect(shouldEvict(408)).toBe(false);
    expect(shouldEvict(429)).toBe(false);

    // 5xx → NO evict (transient)
    expect(shouldEvict(500)).toBe(false);
    expect(shouldEvict(502)).toBe(false);
    expect(shouldEvict(503)).toBe(false);
    expect(shouldEvict(504)).toBe(false);
  });

  it("does not crash on evictSessionModel with falsy sessionId", () => {
    expect(() => evictSessionModel("combo", null)).not.toThrow();
    expect(() => evictSessionModel("combo", undefined)).not.toThrow();
    expect(() => evictSessionModel("combo", "")).not.toThrow();
  });
});

// ---- least-used ----

describe("least-used strategy", () => {
  it("picks model with count 0 before count > 0", () => {
    const models = ["provider/a", "provider/b", "provider/c"];
    const usageStats = { "provider/a": 10, "provider/b": 0, "provider/c": 5 };

    const rotated = pickLeastUsed(models, usageStats);

    expect(rotated[0]).toBe("provider/b"); // count 0 first
    expect(rotated[1]).toBe("provider/c"); // count 5 second
    expect(rotated[2]).toBe("provider/a"); // count 10 last
  });

  it("cold start (all counts 0) spreads picks — does NOT always return models[0]", () => {
    const models = ["provider/a", "provider/b", "provider/c", "provider/d"];
    const usageStats = {};

    const firstPicks = new Set();
    for (let i = 0; i < 50; i++) {
      const rotated = pickLeastUsed(models, usageStats);
      firstPicks.add(rotated[0]);
    }

    // With Fisher-Yates jitter across 4 models, 50 runs should hit at least 2 different first picks
    expect(firstPicks.size).toBeGreaterThanOrEqual(2);
  });

  it("respects provider/model key format matching getProviderUsage output", () => {
    const models = ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-1.5-pro"];
    const usageStats = {
      "openai/gpt-4o": 100,
      "anthropic/claude-3.5-sonnet": 10,
      "google/gemini-1.5-pro": 50,
    };

    const rotated = pickLeastUsed(models, usageStats);

    expect(rotated[0]).toBe("anthropic/claude-3.5-sonnet");
    expect(rotated[1]).toBe("google/gemini-1.5-pro");
    expect(rotated[2]).toBe("openai/gpt-4o");
  });

  it("returns input as-is for empty or single-element arrays", () => {
    expect(pickLeastUsed([])).toEqual([]);
    expect(pickLeastUsed(["single"])).toEqual(["single"]);
    expect(pickLeastUsed(null)).toEqual([]);
    expect(pickLeastUsed(undefined)).toEqual([]);
  });
});

// ---- race strategy (handleRaceChat) ----

describe("race strategy (handleRaceChat)", () => {
  const log = { info: () => {}, warn: () => {}, debug: () => {} };

  it("returns first successful (.ok) response", async () => {
    let callCount = 0;
    const handleSingleModel = vi.fn(async () => {
      callCount++;
      // Model "fast" always wins quickly; "slow" delays but still succeeds
      const model = callCount === 1 ? "slow" : "fast";
      return makeResponse({ ok: true, status: 200, delayMs: model === "slow" ? 100 : 5 });
    });

    const res = await handleRaceChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["provider/slow", "provider/fast"],
      handleSingleModel,
      log,
      comboName: "race-ok",
      raceTimeoutMs: 2000,
    });

    expect(res.ok).toBe(true);
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
  });

  it("cancels losers via res.body.cancel", async () => {
    const cancelCalls = [];
    const handleSingleModel = vi.fn(async (_, model) => {
      // Model "fast" wins; "slow" and "slow2" are losers
      const isWinner = model === "provider/fast";
      // Return a promise that resolves after a delay, during which the race can determine the winner
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(makeResponse({
            ok: true,
            status: 200,
            delayMs: 0,
            onCancel: () => cancelCalls.push(model),
          }));
        }, isWinner ? 5 : 50);
      });
    });

    await handleRaceChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["provider/slow", "provider/fast", "provider/slow2"],
      handleSingleModel,
      log,
      comboName: "race-cancel",
      raceTimeoutMs: 2000,
    });

    // Losers resolve ~50ms after the winner — wait for their cancel handlers to fire
    await new Promise((r) => setTimeout(r, 80));

    // Fast model should not be cancelled (winner)
    expect(cancelCalls).not.toContain("provider/fast");
    // Both slow models should be cancelled (losers)
    expect(cancelCalls).toContain("provider/slow");
    expect(cancelCalls).toContain("provider/slow2");
  });

  it("returns 503 when all candidates fail", async () => {
    const handleSingleModel = vi.fn(async () => makeErrorResponse(500));

    const res = await handleRaceChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["provider/a", "provider/b"],
      handleSingleModel,
      log,
      comboName: "race-allfail",
      raceTimeoutMs: 2000,
    });

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.message).toContain("All race models failed");
  });

  it("strips tools/tool_choice and forces stream:false in raceBody", async () => {
    const seenBodies = [];
    const handleSingleModel = vi.fn(async (body) => {
      seenBodies.push({ ...body });
      return makeResponse({ ok: true, status: 200 });
    });

    await handleRaceChat({
      body: {
        messages: [{ role: "user", content: "hi" }],
        tools: [{ name: "search" }],
        tool_choice: "auto",
        stream: true,
      },
      models: ["provider/a", "provider/b"],
      handleSingleModel,
      log,
      comboName: "race-strip",
      raceTimeoutMs: 2000,
    });

    for (const body of seenBodies) {
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
      expect(body.stream).toBe(false);
    }
  });

  it("single candidate also uses raceBody (no tools, non-streaming)", async () => {
    const seenBodies = [];
    const handleSingleModel = vi.fn(async (body) => {
      seenBodies.push({ ...body });
      return makeResponse({ ok: true, status: 200 });
    });

    await handleRaceChat({
      body: {
        messages: [{ role: "user", content: "hi" }],
        tools: [{ name: "search" }],
        tool_choice: "auto",
        stream: true,
      },
      models: ["provider/solo"],
      handleSingleModel,
      log,
      comboName: "race-solo",
      raceTimeoutMs: 2000,
    });

    expect(seenBodies.length).toBe(1);
    expect(seenBodies[0].tools).toBeUndefined();
    expect(seenBodies[0].tool_choice).toBeUndefined();
    expect(seenBodies[0].stream).toBe(false);
  });

  it("timeout: returns 503 and late bodies are cancelled", async () => {
    const lateCancelCalls = [];
    const handleSingleModel = vi.fn(async () => {
      // Simulate slow upstreams that resolve after the race timeout
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(makeResponse({
            ok: true,
            status: 200,
            onCancel: () => { lateCancelCalls.push("late"); },
          }));
        }, 100);
      });
    });

    // Use ≥2 candidates so it goes through withTimeout path (not single-candidate shortcut)
    const res = await handleRaceChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["provider/slow1", "provider/slow2"],
      handleSingleModel,
      log,
      comboName: "race-timeout",
      raceTimeoutMs: 10, // Very short timeout
    });

    // Race times out → 503
    expect(res.status).toBe(503);

    // Wait for late raw promises to resolve and trigger their .then(cancel) handlers
    await new Promise((r) => setTimeout(r, 150));
    expect(lateCancelCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 400 when candidates array is empty", async () => {
    const handleSingleModel = vi.fn(async () => makeResponse({ ok: true, status: 200 }));

    const res = await handleRaceChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: [],
      handleSingleModel,
      log,
      comboName: "race-empty",
      raceTimeoutMs: 2000,
    });

    expect(res.status).toBe(400);
    expect(handleSingleModel).not.toHaveBeenCalled();
  });
});

// ---- normalizeComboStrategy ----

describe("normalizeComboStrategy", () => {
  const log = { warn: vi.fn() };

  beforeEach(() => {
    log.warn.mockClear();
  });

  it("maps unsupported strategies to fallback with warning", () => {
    const unsupported = ["session-affinity", "least-used", "race", "fusion"];
    for (const s of unsupported) {
      expect(normalizeComboStrategy(s, NON_CHAT_COMBO_STRATEGIES, log)).toBe("fallback");
      expect(log.warn).toHaveBeenCalledWith("COMBO", `Strategy "${s}" not supported in this handler — normalized to "fallback"`);
      log.warn.mockClear();
    }
  });

  it("passes fallback/round-robin through unchanged", () => {
    expect(normalizeComboStrategy("fallback", NON_CHAT_COMBO_STRATEGIES, log)).toBe("fallback");
    expect(log.warn).not.toHaveBeenCalled();

    expect(normalizeComboStrategy("round-robin", NON_CHAT_COMBO_STRATEGIES, log)).toBe("round-robin");
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("does not throw when log is undefined", () => {
    expect(() => normalizeComboStrategy("race")).not.toThrow();
    expect(normalizeComboStrategy("race")).toBe("fallback");
  });
});

// ---- COMBO_STRATEGIES enum ----

describe("COMBO_STRATEGIES enum", () => {
  it("contains exactly 6 strategies", () => {
    expect(COMBO_STRATEGIES).toHaveLength(6);
    expect(COMBO_STRATEGIES).toEqual([
      "fallback",
      "round-robin",
      "session-affinity",
      "least-used",
      "race",
      "fusion",
    ]);
  });

  it("NON_CHAT_COMBO_STRATEGIES is subset of COMBO_STRATEGIES", () => {
    for (const s of NON_CHAT_COMBO_STRATEGIES) {
      expect(COMBO_STRATEGIES).toContain(s);
    }
  });
});