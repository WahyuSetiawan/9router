import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToJudgment(row) {
  if (!row) return null;
  return {
    id: row.id,
    presetId: row.preset_id,
    modelId: row.model_id,
    provider: row.provider,
    reasoning: row.reasoning,
    score: row.score,
    accepted: row.accepted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getJudgmentsByPreset(presetId) {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT * FROM model_judgments WHERE preset_id = ? ORDER BY score DESC`,
    [presetId]
  );
  return rows.map(rowToJudgment);
}

export async function getJudgmentById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM model_judgments WHERE id = ?`, [id]);
  return rowToJudgment(row);
}

export async function createJudgment({ preset_id, model_id, provider, reasoning, score, accepted }) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const judgment = {
    id: uuidv4(),
    preset_id,
    model_id,
    provider: provider || null,
    reasoning: reasoning || null,
    score: score != null ? score : null,
    accepted: accepted != null ? (accepted ? 1 : 0) : 0,
    created_at: now,
    updated_at: now,
  };
  db.run(
    `INSERT INTO model_judgments(id, preset_id, model_id, provider, reasoning, score, accepted, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      judgment.id,
      judgment.preset_id,
      judgment.model_id,
      judgment.provider,
      judgment.reasoning,
      judgment.score,
      judgment.accepted,
      judgment.created_at,
      judgment.updated_at,
    ]
  );
  return rowToJudgment(judgment);
}

export async function updateJudgment(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM model_judgments WHERE id = ?`, [id]);
    if (!row) return;
    const existing = rowToJudgment(row);
    // Accept both camelCase (internal) and snake_case (from API) keys
    const merged = {
      ...existing,
      ...(data.modelId !== undefined && { modelId: data.modelId }),
      ...(data.model_id !== undefined && { modelId: data.model_id }),
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.reasoning !== undefined && { reasoning: data.reasoning }),
      ...(data.score !== undefined && { score: data.score }),
      ...(data.accepted !== undefined && { accepted: data.accepted ? 1 : 0 }),
      updatedAt: new Date().toISOString(),
    };
    db.run(
      `UPDATE model_judgments SET model_id = ?, provider = ?, reasoning = ?, score = ?, accepted = ?, updated_at = ? WHERE id = ?`,
      [
        merged.modelId,
        merged.provider,
        merged.reasoning,
        merged.score,
        merged.accepted,
        merged.updatedAt,
        id,
      ]
    );
    result = merged;
  });
  return result;
}

export async function deleteJudgment(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM model_judgments WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function upsertJudgmentsForPreset(presetId, judgments) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const created = [];
  db.transaction(() => {
    // Replace all judgments for this preset atomically
    db.run(`DELETE FROM model_judgments WHERE preset_id = ?`, [presetId]);
    for (const j of judgments) {
      const judgment = {
        id: uuidv4(),
        preset_id: presetId,
        model_id: j.model_id,
        provider: j.provider || null,
        reasoning: j.reasoning || null,
        score: j.score != null ? j.score : null,
        accepted: j.accepted != null ? (j.accepted ? 1 : 0) : 0,
        created_at: now,
        updated_at: now,
      };
      db.run(
        `INSERT INTO model_judgments(id, preset_id, model_id, provider, reasoning, score, accepted, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          judgment.id,
          judgment.preset_id,
          judgment.model_id,
          judgment.provider,
          judgment.reasoning,
          judgment.score,
          judgment.accepted,
          judgment.created_at,
          judgment.updated_at,
        ]
      );
      created.push(rowToJudgment(judgment));
    }
  });
  return created;
}