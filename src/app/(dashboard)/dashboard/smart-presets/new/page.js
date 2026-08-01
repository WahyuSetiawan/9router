"use client";

import { useState } from "react";
import { Card, Button, Input, Select, Modal, Spinner } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { useRouter } from "next/navigation";
const TASK_CATEGORIES = [
  "general", "review", "coding", "writing", "research",
  "analysis", "creative", "reasoning", "vision", "multimodal",
];

export default function NewPresetPage() {
  const router = useRouter();
  const success = useNotificationStore((s) => s.success);
  const error = useNotificationStore((s) => s.error);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("coding");
  const [recommendations, setRecommendations] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecommend, setLoadingRecommend] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [nameError, setNameError] = useState("");
  const [judgments, setJudgments] = useState({});
  const [judgmentTouched, setJudgmentTouched] = useState({});
  const [judgmentErrors, setJudgmentErrors] = useState({});

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
        const autoSelected = (data.recommendations || []).slice(0, 5).map((r) => r.modelId);
        setSelectedModels(autoSelected);
        const j = {};
        autoSelected.forEach((id) => { j[id] = ""; });
        setJudgments(j);
        setJudgmentTouched({});
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

  const handleSubmit = async () => {
    if (!validateName(name)) return;

    // Validate judgments (max 500 chars each)
    let hasJudgmentErrors = false;
    const newJudgmentErrors = {};
    Object.entries(judgments).forEach(([modelId, text]) => {
      if (text && text.length > 500) {
        hasJudgmentErrors = true;
        newJudgmentErrors[modelId] = 'Maksimal 500 karakter';
      }
    });
    if (hasJudgmentErrors) {
      setJudgmentErrors(newJudgmentErrors);
      const touched = {};
      Object.keys(judgments).forEach((id) => { touched[id] = true; });
      setJudgmentTouched(touched);
      return;
    }

    setLoading(true);
    try {
      // Build judgments array for API
      const judgmentsArray = Object.entries(judgments)
        .filter(([_, text]) => text.trim())
        .map(([modelId, text]) => ({
          model_id: modelId,
          reasoning: text.trim(),
        }));

      const res = await fetch("/api/model-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          models: selectedModels,
          judgments: judgmentsArray,
        }),
      });

      if (res.ok) {
        const newPreset = await res.json();
        success("Preset created successfully", "Smart Presets");
        router.push(`/dashboard/smart-presets/${newPreset.id}`);
      } else {
        const err = await res.json();
        error(err.error || "Failed to create preset");
      }
    } catch (e) {
      console.error("Error creating preset:", e);
      error("Failed to create preset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-text-main">Buat Preset Baru</h2>
        <p className="text-sm text-text-muted mt-1">
          Create an AI-powered model recommendation preset.
        </p>
      </div>

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
              Pilih kategori untuk AI memberikan rekomendasi model yang tepat
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

          {/* Models Preview / Selected Count */}
          <div>
            <label className="text-sm font-medium text-text-main mb-1.5 block">
              Model yang Dipilih ({selectedModels.length})
            </label>
            {selectedModels.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                <span className="material-symbols-outlined text-text-muted text-xl mb-1">checklist</span>
                <p className="text-xs text-text-muted">Belum ada model yang dipilih</p>
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

          {/* Judgment Section */}
          {selectedModels.length > 0 && (
            <div className="pt-2 border-t border-black/10 dark:border-white/10">
              <label className="text-sm font-medium text-text-main mb-2 block">
                Penilaian Model
              </label>
              <p className="text-xs text-text-muted mb-3">
                Berikan catatan atau penilaian untuk setiap model yang dipilih
              </p>
              <div className="space-y-3">
                {selectedModels.map((model) => {
                  const hasError = judgmentTouched[model] && judgmentErrors[model];
                  return (
                    <div key={model} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-text-main font-mono">{model}</code>
                        {judgments[model] && judgments[model].length > 0 && (
                          <span className={`text-[10px] ${judgments[model].length > 500 ? 'text-red-500' : 'text-text-muted'}`}>
                            {judgments[model].length}&#47;500
                          </span>
                        )}
                      </div>
                      <textarea
                        value={judgments[model] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setJudgments((prev) => ({ ...prev, [model]: val }));
                          if (val.length > 500) {
                            setJudgmentErrors((prev) => ({ ...prev, [model]: 'Maksimal 500 karakter' }));
                          } else if (judgmentErrors[model]) {
                            setJudgmentErrors((prev) => {
                              const next = { ...prev };
                              delete next[model];
                              return next;
                            });
                          }
                        }}
                        onBlur={() => {
                          setJudgmentTouched((prev) => ({ ...prev, [model]: true }));
                          const text = judgments[model] || '';
                          if (text.length > 500) {
                            setJudgmentErrors((prev) => ({ ...prev, [model]: 'Maksimal 500 karakter' }));
                          }
                        }}
                        placeholder="Alasan memilih model ini, catatan performa, atau komentar..."
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
            </div>
          )}
        </div>
      </Card>

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
              <Button
                variant="ghost"
                onClick={() => {
                  const all = recommendations.map((r) => r.modelId);
                  setSelectedModels(all);
                  const j = {};
                  all.forEach((id) => { j[id] = ""; });
                  setJudgments(j);
                  setJudgmentTouched({});
                }}
              >
                Pilih Semua
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedModels([]);
                  setJudgments({});
                  setJudgmentTouched({});
                }}
              >
                Bersihkan
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-4 sm:flex-row">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          Batal
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading || selectedModels.length === 0}
          loading={loading}
        >
          Buat Preset
        </Button>
      </div>
    </div>
  );
}