// Add model_judgments table for Smart Presets judgment form.
// Stores AI recommendation results per preset — reasoning, score, user acceptance.
// Migration #3: Add table for model recommendation judgments.
import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 3,
  name: "add-model-judgments",
  up(db) {
    db.exec(buildCreateTableSql("model_judgments", TABLES.model_judgments));
    for (const idx of TABLES.model_judgments.indexes || []) db.exec(idx);
  },
};