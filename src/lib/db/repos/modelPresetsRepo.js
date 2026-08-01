import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

// Debug: optional cache logging (only when DEBUG_CACHE env is set)
const DEBUG_CACHE = typeof process !== "undefined" && process.env.DEBUG_CACHE;

const PRESETS_CACHE_TTL = 30_000;
let _presetsCache = null;
let _presetsCacheTs = 0;

function rowToPreset(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    models: parseJson(row.models, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensurePresetsCached() {
  const now = Date.now();
  if (_presetsCache && (now - _presetsCacheTs) < PRESETS_CACHE_TTL) {
    if (DEBUG_CACHE) process.stderr.write(`[cache] modelPresets → HIT\n`);
    return;
  }
  if (DEBUG_CACHE) process.stderr.write(`[cache] modelPresets → MISS\n`);
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM model_presets ORDER BY created_at DESC`);
  _presetsCache = rows.map(rowToPreset);
  _presetsCacheTs = now;
}

function invalidatePresetsCache() {
  _presetsCache = null;
  _presetsCacheTs = 0;
}

export async function getAllPresets() {
  await ensurePresetsCached();
  return _presetsCache;
}

export async function getPresetById(id) {
  await ensurePresetsCached();
  return _presetsCache.find(p => p.id === id) ?? null;
}

export async function createPreset({ name, description, models }) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const preset = {
    id: uuidv4(),
    name: name,
    description: description || null,
    models: models || [],
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO model_presets(id, name, description, models, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)`,
    [preset.id, preset.name, preset.description, stringifyJson(preset.models), preset.createdAt, preset.updatedAt]
  );
  invalidatePresetsCache();
  return preset;
}

export async function updatePreset(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM model_presets WHERE id = ?`, [id]);
    if (!row) return;
    const existing = rowToPreset(row);
    const merged = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.models !== undefined && { models: data.models }),
      updatedAt: new Date().toISOString(),
    };
    db.run(
      `UPDATE model_presets SET name = ?, description = ?, models = ?, updated_at = ? WHERE id = ?`,
      [merged.name, merged.description, stringifyJson(merged.models), merged.updatedAt, id]
    );
    result = merged;
  });
  if (result) invalidatePresetsCache();
  return result;
}

export async function deletePreset(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM model_presets WHERE id = ?`, [id]);
  if ((res?.changes ?? 0) > 0) invalidatePresetsCache();
  return (res?.changes ?? 0) > 0;
}