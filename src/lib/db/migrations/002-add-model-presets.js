// Add model_presets table for Smart Presets feature.
// Migration #2: Add table for AI-driven model recommendations.
import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 2,
  name: "add-model-presets",
  up(db) {
    db.exec(buildCreateTableSql("model_presets", TABLES.model_presets));
    for (const idx of TABLES.model_presets.indexes || []) db.exec(idx);
  },
};