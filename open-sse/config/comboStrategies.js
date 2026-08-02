export const COMBO_STRATEGIES = ["fallback", "round-robin", "session-affinity", "least-used", "race", "fusion"];
export const NON_CHAT_COMBO_STRATEGIES = ["fallback", "round-robin"]; // strategi yang dipahami handleComboChat lintas modality
export const STRATEGY_LABELS = {
  fallback: "Fallback (Default)",
  "round-robin": "Round Robin",
  "session-affinity": "Session Affinity (Sticky)",
  "least-used": "Least Used (Balanced)",
  race: "Race (Fastest First)",
  fusion: "Model Fusion",
};

/**
 * Guard normalisasi untuk handler NON-chat: strategi baru (session-affinity /
 * least-used / race) dan fusion TIDAK diimplementasikan di image/tts/search/fetch —
 * tanpa guard ini `handleComboChat` diam-diam berperilaku fallback tanpa warning.
 */
export function normalizeComboStrategy(strategy, supported = NON_CHAT_COMBO_STRATEGIES, log) {
  if (!supported.includes(strategy)) {
    log?.warn?.("COMBO", `Strategy "${strategy}" not supported in this handler — normalized to "fallback"`);
    return "fallback";
  }
  return strategy;
}
