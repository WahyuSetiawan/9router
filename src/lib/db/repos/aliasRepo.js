import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { makeKv } from "../helpers/kvStore.js";

const aliasKv = makeKv("modelAliases");
const customKv = makeKv("customModels");
const mitmKv = makeKv("mitmAlias");

// modelAliases: key=alias, value=modelString

// Debug: optional cache logging (only when DEBUG_CACHE env is set)
const DEBUG_CACHE = typeof process !== "undefined" && process.env.DEBUG_CACHE;

// Cache for getModelAliases()
const ALIAS_CACHE_TTL = 30_000; // 30 seconds
let _aliasCache = null;
let _aliasCacheTs = 0;

function invalidateAliasCache() {
  _aliasCache = null;
  _aliasCacheTs = 0;
}

export async function getModelAliases() {
  const now = Date.now();
  if (!_aliasCache || (now - _aliasCacheTs) > ALIAS_CACHE_TTL) {
    if (DEBUG_CACHE) process.stderr.write(`[cache] getModelAliases → MISS\n`);
    _aliasCache = await aliasKv.getAll();
    _aliasCacheTs = now;
  } else {
    if (DEBUG_CACHE) process.stderr.write(`[cache] getModelAliases → HIT\n`);
  }
  return _aliasCache;
}

export async function setModelAlias(alias, model) {
  await aliasKv.set(alias, model);
  invalidateAliasCache();
}

export async function deleteModelAlias(alias) {
  await aliasKv.remove(alias);
  invalidateAliasCache();
}

// customModels: key=`${providerAlias}|${id}|${type}`, value=full model object
function customKey(providerAlias, id, type) {
  return `${providerAlias}|${id}|${type}`;
}

export async function getCustomModels() {
  const all = await customKv.getAll();
  return Object.values(all);
}

// Atomic check-then-insert inside transaction to prevent duplicate races
export async function addCustomModel({ providerAlias, id, type = "llm", name }) {
  const k = customKey(providerAlias, id, type);
  const db = await getAdapter();
  let added = false;
  db.transaction(() => {
    const row = db.get(`SELECT 1 FROM kv WHERE scope = 'customModels' AND key = ?`, [k]);
    if (row) return;
    const value = stringifyJson({ providerAlias, id, type, name: name || id });
    db.run(`INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, value]);
    added = true;
  });
  return added;
}

export async function deleteCustomModel({ providerAlias, id, type = "llm" }) {
  await customKv.remove(customKey(providerAlias, id, type));
}

// mitmAlias: key=toolName, value=mappings object
export async function getMitmAlias(toolName) {
  if (toolName) {
    const v = await mitmKv.get(toolName);
    return v || {};
  }
  return await mitmKv.getAll();
}

export async function setMitmAliasAll(toolName, mappings) {
  await mitmKv.set(toolName, mappings || {});
}
