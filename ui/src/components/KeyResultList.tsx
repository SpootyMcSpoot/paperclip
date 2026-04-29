import { useState } from "react";
import type { GoalKeyResult, GoalProgress } from "@stapleai/shared";
import { KEY_RESULT_METRIC_TYPES, KEY_RESULT_STATUSES } from "@stapleai/shared";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./StatusBadge";
import { Plus, Trash2, Check, X } from "lucide-react";

interface KeyResultListProps {
  keyResults: GoalKeyResult[];
  progress: GoalProgress | undefined;
  onCreate: (data: Record<string, unknown>) => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  isCreating: boolean;
}

function KeyResultRow({
  kr,
  krProgress,
  onUpdate,
  onRemove,
}: {
  kr: GoalKeyResult;
  krProgress: number;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(kr.currentValue);

  const handleSaveValue = () => {
    if (currentValue !== kr.currentValue) {
      onUpdate(kr.id, { currentValue });
    }
    setEditing(false);
  };

  const handleStatusChange = (status: string) => {
    onUpdate(kr.id, { status });
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{kr.title}</span>
          <select
            className="text-xs bg-transparent border border-border rounded px-1.5 py-0.5 cursor-pointer"
            value={kr.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            aria-label={`Status for ${kr.title}`}
          >
            {KEY_RESULT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Progress value={krProgress} className="flex-1 h-1.5" />
          <span className="text-xs text-muted-foreground shrink-0">
            {krProgress}%
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {editing ? (
            <span className="flex items-center gap-1">
              <Input
                type="text"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                className="h-6 w-20 text-xs px-1"
                autoFocus
                aria-label="Current value"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveValue();
                  if (e.key === "Escape") {
                    setCurrentValue(kr.currentValue);
                    setEditing(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSaveValue}
                className="p-0.5 hover:text-foreground"
                aria-label="Save value"
                title="Save"
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentValue(kr.currentValue);
                  setEditing(false);
                }}
                className="p-0.5 hover:text-foreground"
                aria-label="Cancel edit"
                title="Cancel"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label={`Edit current value for ${kr.title}`}
              className="hover:text-foreground cursor-pointer"
              onClick={() => setEditing(true)}
            >
              {kr.currentValue} / {kr.targetValue}
              {kr.unit ? ` ${kr.unit}` : ""}
            </button>
          )}
          <span className="text-muted-foreground/60">
            (start: {kr.startValue})
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(kr.id)}
        className="p-1 text-muted-foreground hover:text-destructive shrink-0"
        aria-label={`Remove key result ${kr.title}`}
        title="Remove key result"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function AddKeyResultForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [startValue, setStartValue] = useState("0");
  const [unit, setUnit] = useState("");
  const [metricType, setMetricType] = useState("number");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetValue.trim()) return;
    onSubmit({
      title: title.trim(),
      targetValue: targetValue.trim(),
      startValue: startValue.trim() || "0",
      unit: unit.trim() || undefined,
      metricType,
    });
    setTitle("");
    setTargetValue("");
    setStartValue("0");
    setUnit("");
    setMetricType("number");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-border rounded-md p-3 space-y-2"
    >
      <Input
        placeholder="Key result title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 text-sm"
        autoFocus
        aria-label="Key result title"
      />
      <div className="flex gap-2">
        <Input
          placeholder="Target"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          className="h-8 text-sm flex-1"
          aria-label="Target value"
        />
        <Input
          placeholder="Start (0)"
          value={startValue}
          onChange={(e) => setStartValue(e.target.value)}
          className="h-8 text-sm w-24"
          aria-label="Start value"
        />
        <Input
          placeholder="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="h-8 text-sm w-24"
          aria-label="Unit"
        />
        <select
          className="h-8 text-sm bg-transparent border border-border rounded px-2"
          value={metricType}
          onChange={(e) => setMetricType(e.target.value)}
          aria-label="Metric type"
        >
          {KEY_RESULT_METRIC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || !targetValue.trim() || isSubmitting}
        >
          Add
        </Button>
      </div>
    </form>
  );
}

export function KeyResultList({
  keyResults,
  progress,
  onCreate,
  onUpdate,
  onRemove,
  isCreating,
}: KeyResultListProps) {
  const [showForm, setShowForm] = useState(false);

  const getKrProgress = (krId: string): number => {
    const match = progress?.keyResults.find((kr) => kr.id === krId);
    return match?.progress ?? 0;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-start">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(true)}
          disabled={showForm}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Key Result
        </Button>
      </div>

      {showForm && (
        <AddKeyResultForm
          onSubmit={(data) => {
            onCreate(data);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
          isSubmitting={isCreating}
        />
      )}

      {keyResults.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">No key results.</p>
      ) : (
        keyResults.length > 0 && (
          <div className="border border-border rounded-md">
            {keyResults.map((kr) => (
              <KeyResultRow
                key={kr.id}
                kr={kr}
                krProgress={getKrProgress(kr.id)}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
