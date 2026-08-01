"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, ConfirmModal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import Link from "next/link";

export default function SmartPresetsPage() {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmState, setConfirmState] = useState(null);
  const success = useNotificationStore((s) => s.success);
  const error = useNotificationStore((s) => s.error);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/model-presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (err) {
      console.error("Error fetching presets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    fetchData();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchData]);

  const handleDelete = async (id, name) => {
    setConfirmState({
      title: "Delete Preset",
      message: `Delete preset "${name}"?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/model-presets/${id}`, { method: "DELETE" });
          if (res.ok) {
            setPresets(presets.filter((p) => p.id !== id));
            success("Preset deleted", "Smart Presets");
          } else {
            const err = await res.json();
            error(err.error || "Failed to delete preset");
          }
        } catch (e) {
          console.error("Error deleting preset:", e);
          error("Failed to delete preset");
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-main">Smart Presets</h2>
          <p className="text-sm text-text-muted mt-1">
            AI-powered model recommendations for your tasks.
          </p>
        </div>
        <Link href="/dashboard/smart-presets/new" className="w-full sm:w-auto">
          <Button icon="add" variant="primary" className="whitespace-nowrap">
            Buat Preset Baru
          </Button>
        </Link>
      </div>

      {/* Presets List */}
      {presets.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">smart_toy</span>
            </div>
            <p className="text-text-main font-medium mb-1">No presets yet</p>
            <p className="text-sm text-text-muted mb-4">Create AI-powered model recommendations</p>
            <Link href="/dashboard/smart-presets/new">
              <Button variant="primary">Buat Preset Pertama</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {presets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              onDelete={() => handleDelete(preset.id, preset.name)}
            />
          ))}
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}

const CardSkeleton = () => (
  <Card>
    <div className="animate-pulse">
      <div className="h-5 bg-black/10 dark:bg-white/10 rounded w-3/4 mb-3" />
      <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/2 mb-2" />
      <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/4" />
    </div>
  </Card>
);

function PresetCard({ preset, onDelete }) {
  const truncate = (text, max = 100) => {
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "..." : text;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  return (
    <Card padding="sm" className="group">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-text-main text-base truncate">{preset.name}</h3>
            {preset.description && (
              <p className="text-sm text-text-muted mt-1 line-clamp-2">{truncate(preset.description)}</p>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">count</span>
                {preset.models?.length || 0} model
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                {formatDate(preset.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/dashboard/smart-presets/${preset.id}`}
            className="p-2 rounded text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Edit"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </Link>
          <button
            onClick={() => onDelete()}
            className="p-2 rounded text-red-500 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    </Card>
  );
}