// Test for modelPresetsRepo CRUD operations
import { describe, it, expect, beforeEach } from "vitest";
import { getAllPresets, getPresetById, createPreset, updatePreset, deletePreset } from "@/lib/db/repos/modelPresetsRepo.js";
import { exportDb, importDb } from "@/lib/db/index.js";

// Helper to clear all presets
async function clearAll() {
  const all = await getAllPresets();
  for (const p of all) await deletePreset(p.id);
}

describe("modelPresetsRepo", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("createPreset creates a preset and returns it", async () => {
    const p = await createPreset({ name: "Test Preset", description: "A test", models: ["gpt-4", "claude-3"] });
    expect(p.name).toBe("Test Preset");
    expect(p.description).toBe("A test");
    expect(p.models).toEqual(["gpt-4", "claude-3"]);
    expect(p.id).toBeDefined();
    expect(p.createdAt).toBe(p.updatedAt);
  });

  it("createPreset defaults models to empty array", async () => {
    const p = await createPreset({ name: "Empty Models" });
    expect(p.models).toEqual([]);
  });

  it("createPreset defaults description to null", async () => {
    const p = await createPreset({ name: "No Desc" });
    expect(p.description).toBeNull();
  });

  it("getPresetById returns the preset or null", async () => {
    const created = await createPreset({ name: "Find Me" });
    const found = await getPresetById(created.id);
    expect(found).not.toBeNull();
    expect(found.id).toBe(created.id);

    const notFound = await getPresetById("nonexistent-id");
    expect(notFound).toBeNull();
  });

  it("getAllPresets returns all presets sorted by created_at DESC", async () => {
    // Create with small delay to ensure distinct timestamps
    const p1 = await createPreset({ name: "First" });
    await new Promise(r => setTimeout(r, 5));
    const p2 = await createPreset({ name: "Second" });
    const list = await getAllPresets();
    expect(list.length).toBe(2);
    // p2 was created after p1, so it should be first
    expect(list[0].id).toBe(p2.id);
    expect(list[1].id).toBe(p1.id);
    // Also verify timestamps are in DESC order
    expect(list[0].createdAt >= list[1].createdAt).toBe(true);
  });

  it("updatePreset updates fields and bumps updatedAt", async () => {
    const created = await createPreset({ name: "Original", models: ["a"] });
    const oldUpdatedAt = created.updatedAt;

    // Wait a bit to ensure timestamp difference
    await new Promise(r => setTimeout(r, 10));

    const updated = await updatePreset(created.id, { name: "Updated", models: ["b", "c"] });
    expect(updated.name).toBe("Updated");
    expect(updated.models).toEqual(["b", "c"]);
    // ISO strings compare lexicographically
    expect(updated.updatedAt > oldUpdatedAt).toBe(true);
  });

  it("updatePreset partial update preserves other fields", async () => {
    const created = await createPreset({ name: "Original", description: "Old desc", models: ["a"] });
    const updated = await updatePreset(created.id, { description: "New desc" });
    expect(updated.name).toBe("Original");
    expect(updated.description).toBe("New desc");
    expect(updated.models).toEqual(["a"]);
  });

  it("updatePreset invalidates cache", async () => {
    const p = await createPreset({ name: "Before" });
    const updated = await updatePreset(p.id, { name: "After" });
    const list = await getAllPresets();
    expect(list.find(x => x.id === p.id).name).toBe("After");
  });

  it("deletePreset removes and returns true", async () => {
    const created = await createPreset({ name: "Delete Me" });
    const deleted = await deletePreset(created.id);
    expect(deleted).toBe(true);
    expect(await getPresetById(created.id)).toBeNull();
  });

  it("deletePreset returns false for nonexistent id", async () => {
    const deleted = await deletePreset("nonexistent-id");
    expect(deleted).toBe(false);
  });

  it("invalidate cache on delete", async () => {
    const p1 = await createPreset({ name: "Keep" });
    const p2 = await createPreset({ name: "Delete" });
    await deletePreset(p2.id);
    const list = await getAllPresets();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(p1.id);
  });

  it("exportDb includes modelPresets", async () => {
    const p = await createPreset({ name: "Export Test", models: ["gpt-4"] });
    const data = await exportDb();
    expect(Array.isArray(data.modelPresets)).toBe(true);
    expect(data.modelPresets.some(x => x.id === p.id)).toBe(true);
  });

  it("importDb restores modelPresets", async () => {
    // Export current state
    const data = await exportDb();
    // Add a preset
    const p = await createPreset({ name: "Import Test", models: ["claude-3"] });
    // Re-import old data (should remove the new one)
    const restored = await importDb(data);
    expect(restored.modelPresets.some(x => x.id === p.id)).toBe(false);
  });
});
