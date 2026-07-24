import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

// Debug: optional cache logging (only when DEBUG_CACHE env is set)
const DEBUG_CACHE = typeof process !== "undefined" && process.env.DEBUG_CACHE;

const COMBO_CACHE_TTL = 30_000;
let _combosCache = null;
let _combosByName = null;
let _combosById = null;
let _combosCacheTs = 0;

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    models: parseJson(row.models, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ensureCombosCached() {
  const now = Date.now();
  if (_combosCache && (now - _combosCacheTs) < COMBO_CACHE_TTL) {
    if (DEBUG_CACHE) process.stderr.write(`[cache] combos → HIT\n`);
    return;
  }
  if (DEBUG_CACHE) process.stderr.write(`[cache] combos → MISS\n`);
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM combos ORDER BY createdAt ASC`);
  const combos = rows.map(rowToCombo);
  _combosCache = combos;
  _combosByName = new Map(combos.map(c => [c.name, c]));
  _combosById = new Map(combos.map(c => [c.id, c]));
  _combosCacheTs = now;
}

function invalidateCombosCache() {
  _combosCache = null;
  _combosByName = null;
  _combosById = null;
  _combosCacheTs = 0;
}

export async function getCombos() {
  await ensureCombosCached();
  return _combosCache;
}

export async function getComboById(id) {
  await ensureCombosCached();
  return _combosById.get(id) ?? null;
}

export async function getComboByName(name) {
  await ensureCombosCached();
  return _combosByName.get(name) ?? null;
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    kind: data.kind || null,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [combo.id, combo.name, combo.kind, stringifyJson(combo.models), combo.createdAt, combo.updatedAt]
  );
  invalidateCombosCache();
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    db.run(
      `UPDATE combos SET name = ?, kind = ?, models = ?, updatedAt = ? WHERE id = ?`,
      [merged.name, merged.kind, stringifyJson(merged.models || []), merged.updatedAt, id]
    );
    result = merged;
  });
  if (result) invalidateCombosCache();
  return result;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM combos WHERE id = ?`, [id]);
  if ((res?.changes ?? 0) > 0) invalidateCombosCache();
  return (res?.changes ?? 0) > 0;
}
