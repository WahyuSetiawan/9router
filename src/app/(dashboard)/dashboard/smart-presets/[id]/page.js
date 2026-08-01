"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input, Select, Spinner, Modal, ConfirmModal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { useRouter, useParams } from "next/navigation";

export default function EditPresetPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id;
  const success = useNotificationStore((s) => s.success);
  const error = useNotificationStore((s) => s.error);

  const [preset, setPreset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingJudgments, setSavingJudgments] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("coding");
  const [recommendations, setRecommendations] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [loadingRecommend, setLoadingRecommend] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [nameError, setNameError] = useState("");

  // Judgment states
  const [judgments, setJudgments] = useState({});
  const [judgmentTouched, setJudgmentTouched] = useState({});
  const [judgmentErrors, setJudgmentErrors] = useState({});

  // Apply / Confirm Modal state
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [comboName, setComboName] = useState("");
  const [applying, setApplying] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  const CATEGORY_OPTIONS = [
    { value: "general", label: "General" },
    { value: "review", label: "Review" },
    { value: "coding", label: "Coding" },
    { value: "writing", label: "Writing" },
    { value: "research", label: "Research" },
    { value: "analysis", label: "Analysis" },
    { value: "creative", label: "Creative" },
    { value: "reasoning", label: "Reasoning" },
    { value: "vision", label: "Vision" },
    { value: "multimodal", label: "Multimodal" },
  ];

  const fetchPreset = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/model-presets/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPreset(data);
        setName(data.name);
        setDescription(data.description || "");
        setSelectedModels(data.models || []);
        setComboName(data.name + " (combo)");
        // Initialize judgments for selected models
        const initialJudgments = {};
        (data.models || []).forEach((modelId) => {
          initialJudgments[modelId] = "";
        });
        setJudgments(initialJudgments);
        setJudgmentTouched({});
      } else {
        error("Preset not found");
        router.push("/dashboard/smart-presets");
      }
    } catch (e) {
      console.error("Error fetching preset:", e);
      error("Failed to load preset");
      router.push("/dashboard/smart-presets");
    } finally {
      setLoading(false);
    }
  }, [id, error, router]);

  const fetchExistingJudgments = useCallback(async () => {
    try {
      const res = await fetch(`/api/model-presets/${id}/judgments`);
      if (res.ok) {
        const data = await res.json();
        const judgmentsMap = {};
        data.judgments.forEach((j) => {
          judgmentsMap[j.modelId] = j.reasoning || "";
        });
        setJudgments(judgmentsMap);
      }
    } catch (e) {
      console.error("Error fetching judgments:", e);
      // Non-critical error, don't block preset loading
    }
  }, [id]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (id) {
      fetchPreset();
      fetchExistingJudgments();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [id, fetchPreset, fetchExistingJudgments]);

  const handleRecommendClick = async () => {
    setShowRecommendModal(true);
    setLoadingRecommend(true);
    try {
      const res = await fetch("/api/model-presets/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, topN: 15 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
      }
    } catch (e) {
      console.error("Error:", e);
    } finally {
      setLoadingRecommend(false);
    }
  };

  const toggleModel = (modelId) => {
    const isSelected = selectedModels.includes(modelId);
    if (isSelected) {
      setSelectedModels((prev) => prev.filter((m) => m !== modelId));
      setJudgments((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      setJudgmentTouched((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      if (judgmentErrors[modelId]) {
        setJudgmentErrors((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }
    } else {
      setSelectedModels((prev) => [...prev, modelId]);
      setJudgments((prev) => ({ ...prev, [modelId]: "" }));
    }
  };

  const validateName = (value) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    const valid = /^[a-zA-Z0-9_\s\-]+$/.test(value);
    if (!valid) {
      setNameError("Only letters, numbers, spaces, -, and _ allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (val) validateName(val);
    else setNameError("");
  };

  const validateJudgment = (text, modelId) => {
    if (text && text.length > 500) {
      setJudgmentErrors((prev) => ({ ...prev, [modelId]: 'Maksimal 500 karakter' }));
      return false;
    }
    if (judgmentErrors[modelId]) {
      setJudgmentErrors((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
    return true;
  };

  const handleJudgmentChange = (modelId, e) => {
    const val = e.target.value;
    setJudgments((prev) => ({ ...prev, [modelId]: val }));
    setJudgmentTouched((prev) => ({ ...prev, [modelId]: true }));
    validateJudgment(val, modelId);
  };

  const handleJudgmentBlur = (modelId) => {
    const text = judgments[modelId] || "";
    setJudgmentTouched((prev) => ({ ...prev, [modelId]: true }));
    if (text.length > 500) {
      setJudgmentErrors((prev) => ({ ...prev, [modelId]: 'Maksimal 500 karakter' }));
    }
  };

  const syncJudgments = async () => {
    setSavingJudgments(true);
    try {
      // Build judgments array for API (only non-empty judgments)
      const judgmentsArray = Object.entries(judgments)
        .filter(([_, text]) => text && text.trim())
        .map(([modelId, text]) => ({
          model_id: modelId,
          reasoning: text.trim(),
        }));

      // Delete existing judgments and create new ones
      // First, get existing judgments to find their IDs
      const listRes = await fetch(`/api/model-presets/${id}/judgments`);
      if (listRes.ok) {
        const listData = await listRes.json();
        const existingJudgments = listData.judgments || [];

        // Delete all existing judgments
        for (const j of existingJudgments) {
          await fetch(`/api/model-presets/${id}/judgments/${j.id}`, {
            method: "DELETE",
          });
        }
      }

      // Create new judgments
      for (const j of judgmentsArray) {
        await fetch(`/api/model-presets/${id}/judgments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_id: j.model_id,
            reasoning: j.reasoning,
          }),
        });
      }

      success("Judgments saved", "Smart Presets");
    } catch (e) {
      console.error("Error syncing judgments:", e);
      error("Failed to sync judgments");
    } finally {
      setSavingJudgments(false);
    }
  };

  const handleSave = async () => {
    if (!validateName(name)) return;

    // Validate all judgments
    let hasJudgmentErrors = false;
    Object.entries(judgments).forEach(([modelId, text]) => {
      if (text && text.length > 500) {
        hasJudgmentErrors = true;
        setJudgmentErrors((prev) => ({ ...prev, [modelId]: 'Maksimal 500 karakter' }));
        setJudgmentTouched((prev) => ({ ...prev, [modelId]: true }));
      }
    });
    if (hasJudgmentErrors) return;

    setSaving(true);
    try {
      // First, update the preset
      const res = await fetch(`/api/model-presets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          models: selectedModels,
        }),
      });

      if (res.ok) {
        const updatedPreset = await res.json();
        setPreset(updatedPreset);
        success("Preset updated", "Smart Presets");

        // Sync judgments
        await syncJudgments();
      } else {
        const err = await res.json();
        error(err.error || "Failed to update preset");
      }
    } catch (e) {
      console.error("Error updating preset:", e);
      error("Failed to update preset");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveJudgmentsOnly = async () => {
    // Validate all judgments
    let hasJudgmentErrors = false;
    Object.entries(judgments).forEach(([modelId, text]) => {
      if (text && text.length > 500) {
        hasJudgmentErrors = true;
        setJudgmentErrors((prev) => ({ ...prev, [modelId]: 'Maksimal 500 karakter' }));
        setJudgmentTouched((prev) => ({ ...prev, [modelId]: true }));
      }
    });
    if (hasJudgmentErrors) return;

    await syncJudgments();
  };

  const handleDelete = async () => {
    setShowDeleteConfirmModal(false);
    try {
      const res = await fetch(`/api/model-presets/${id}`, { method: "DELETE" });
      if (res.ok) {
        success("Preset deleted", "Smart Presets");
        router.push("/dashboard/smart-presets");
      } else {
        const err = await res.json();
        error(err.error || "Failed to delete preset");
      }
    } catch (e) {
      console.error("Error deleting preset:", e);
      error("Failed to delete preset");
    }
  };

  // ── Issue #7: "Terapkan" — create combo from preset ──
  const handleApply = async () => {
    if (!comboName.trim()) return;
    setApplying(true);
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: comboName.trim(),
          models: selectedModels,
        }),
      });

      if (res.ok) {
        success(`Combo "${comboName.trim()}" created`, "Smart Presets");
        setShowApplyModal(false);
        router.push("/dashboard/combos");
      } else {
        const err = await res.json();
        error(err.error || "Failed to create combo");
      }
    } catch (e) {
      console.error("Error applying preset:", e);
      error("Failed to create combo");
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-black/10 dark:bg-white/10 rounded w-1/3" />
          <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/4" />
          <div className="h-40 bg-black/10 dark:bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex items-start gap-2">
        <button
          onClick={() => router.back()}
          className="material-symbols-outlined p-1 rounded text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors mt-0.5"
        >
          arrow_back
        </button>
        <div>
          <h2 className="text-xl font-semibold text-text-main">Edit Preset</h2>
          <p className="text-sm text-text-muted mt-1">
            {preset?.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex flex-col gap-4">
              {/* Name */}
              <Input
                label="Nama Preset"
                value={name}
                onChange={handleNameChange}
                placeholder="misal: Coding Assistant"
                error={nameError}
                required
              />

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-text-main mb-1.5 block">Deskripsi</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ringkas apa tujuan preset ini..."
                  rows={3}
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
                />
              </div>

              {/* Category Selector */}
              <div>
                <label className="text-sm font-medium text-text-main mb-1.5 block">Kategori Tugas</label>
                <Select
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-text-muted mt-0.5">
                  Pilih kategori untuk rekomendasi AI
                </p>
              </div>

              {/* AI Recommend Button */}
              <Button
                icon="auto_awesome"
                variant="ghost"
                onClick={handleRecommendClick}
                disabled={loadingRecommend}
                className="justify-start"
              >
                🤖 Rekomendasi dengan AI
                {loadingRecommend && <Spinner size="sm" className="ml-2" />}
              </Button>

              {/* Selected Models */}
              <div>
                <label className="text-sm font-medium text-text-main mb-1.5 block">
                  Model ({selectedModels.length})
                </label>
                {selectedModels.length === 0 ? (
                  <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                    <p className="text-xs text-text-muted">Belum ada model</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedModels.map((model) => (
                      <code
                        key={model}
                        className="inline-flex items-center gap-1.5 rounded bg-black/5 dark:bg-white/5 px-2 py-1 font-mono text-xs text-text-muted"
                      >
                        {model}
                        <button
                          onClick={() => toggleModel(model)}
                          className="hover:text-red-500 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Judgments Preview */}
        <div className="lg:col-span-1">
          <Card>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-text-main">Penilaian Model</h3>
                {Object.keys(judgments).length > 0 && (
                  <span className="text-xs text-text-muted bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                    {Object.keys(judgments).length}
                  </span>
                )}
              </div>

              {selectedModels.length === 0 ? (
                <div className="text-center py-6 text-text-muted">
                  <p className="text-xs">Pilih model untuk menambahkan penilaian</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {selectedModels.map((model) => {
                    const hasError = judgmentTouched[model] && judgmentErrors[model];
                    return (
                      <div key={model} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-text-main font-mono">{model}</code>
                          <span className={`text-[10px] ${judgments[model]?.length > 500 ? 'text-red-500' : 'text-text-muted'}`}>
                            {judgments[model]?.length || 0}&#47;500
                          </span>
                        </div>
                        <textarea
                          value={judgments[model] || ''}
                          onChange={(e) => handleJudgmentChange(model, e)}
                          onBlur={() => handleJudgmentBlur(model)}
                          placeholder="Berikan alasan memilih model ini..."
                          rows={2}
                          className={`w-full rounded-lg border bg-white dark:bg-black/20 px-3 py-2 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors ${
                            hasError ? 'border-red-400 dark:border-red-500/50' : 'border-black/10 dark:border-white/10'
                          }`}
                        />
                        {hasError && (
                          <p className="text-xs text-red-500">{judgmentErrors[model]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Save Judgments Button */}
              {selectedModels.length > 0 && (
                <Button
                  icon="save"
                  variant="primary"
                  onClick={handleSaveJudgmentsOnly}
                  disabled={savingJudgments}
                  loading={savingJudgments}
                  className="w-full"
                >
                  Simpan Penilaian
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-between">
        <Button
          variant="ghost"
          color="red"
          onClick={() => setShowDeleteConfirmModal(true)}
          className="w-full sm:w-auto"
        >
          Hapus Preset
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Batal
          </Button>
          <Button
            icon="save"
            onClick={handleSave}
            disabled={saving}
            loading={saving}
            className="w-full sm:w-auto"
          >
            Simpan
          </Button>
          <Button
            icon="play_arrow"
            variant="primary"
            onClick={() => setShowApplyModal(true)}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
            disabled={selectedModels.length === 0}
          >
            Terapkan
          </Button>
        </div>
      </div>

      {/* AI Recommendations Modal */}
      <Modal
        isOpen={showRecommendModal}
        onClose={() => setShowRecommendModal(false)}
        title={`Rekomendasi Model (${category})`}
        size="xl"
      >
        {loadingRecommend ? (
          <div className="text-center py-8">
            <Spinner />
            <p className="text-sm text-text-muted mt-2">Mencari rekomendasi...</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-text-muted">Tidak ada rekomendasi yang ditemukan</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <label
                  key={rec.modelId}
                  className="flex items-start gap-3 p-3 rounded-lg border border-black/5 dark:border-white/5 hover:bg-black/[0.02] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(rec.modelId)}
                    onChange={() => toggleModel(rec.modelId)}
                    className="mt-1 rounded border-black/20 text-primary focus:ring-brand-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="font-mono text-xs text-text-main">{rec.modelId}</code>
                      <span className="text-xs font-medium text-text-muted bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                        Skor: {rec.score}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">{rec.reasoning}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => {
                const all = recommendations.map((r) => r.modelId);
                setSelectedModels(all);
                const j = {};
                all.forEach((id) => { j[id] = judgments[id] || ""; });
                setJudgments(j);
              }}>
                Pilih Semua
              </Button>
              <Button variant="ghost" onClick={() => setSelectedModels([])}>
                Bersihkan
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Terapkan (Apply) Modal — Issue #7 */}
      <Modal
        isOpen={showApplyModal}
        onClose={() => !applying && setShowApplyModal(false)}
        title="Terapkan Preset"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Buat combo <strong>{name}</strong> dengan {selectedModels.length} model?
          </p>

          <Input
            label="Nama Combo"
            value={comboName}
            onChange={(e) => setComboName(e.target.value)}
            placeholder="Masukkan nama combo"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => setShowApplyModal(false)}
              disabled={applying}
            >
              Batal
            </Button>
            <Button
              onClick={handleApply}
              disabled={!comboName.trim() || applying}
              loading={applying}
            >
              Buat Combo
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDelete}
        title="Hapus Preset"
        message={`Apakah Anda yakin ingin menghapus preset "${name}"?`}
        variant="danger"
      />
    </div>
  );
}