import { useState } from "react";
import { cn } from "../lib/utils";
import { issueStatusIcon, issueStatusIconDefault } from "../lib/status-colors";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, Loader2, Pause, Minus, Eye } from "lucide-react";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Returns the inner shape icon for a given status (WCAG 1.4.1 compliance). */
function StatusShapeIcon({ status }: { status: string }) {
  const cls = "absolute inset-0 m-auto h-2.5 w-2.5";
  switch (status) {
    case "done":
      return <Check className={cls} strokeWidth={3} />;
    case "cancelled":
      return <X className={cls} strokeWidth={3} />;
    case "backlog":
      return <Minus className={cls} strokeWidth={3} />;
    case "todo":
      return <Clock className={cls} strokeWidth={3} />;
    case "in_progress":
      return <Loader2 className={cls} strokeWidth={3} />;
    case "in_review":
      return <Eye className={cls} strokeWidth={3} />;
    case "blocked":
      return <Pause className={cls} strokeWidth={3} />;
    default:
      return null;
  }
}

interface StatusIconProps {
  status: string;
  onChange?: (status: string) => void;
  className?: string;
  showLabel?: boolean;
}

export function StatusIcon({ status, onChange, className, showLabel }: StatusIconProps) {
  const [open, setOpen] = useState(false);
  const colorClass = issueStatusIcon[status] ?? issueStatusIconDefault;

  const circle = (
    <span
      className={cn(
        "relative inline-flex h-4 w-4 rounded-full border-2 shrink-0",
        colorClass,
        onChange && !showLabel && "cursor-pointer",
        className
      )}
    >
      <StatusShapeIcon status={status} />
    </span>
  );

  if (!onChange) return showLabel ? <span className="inline-flex items-center gap-1.5">{circle}<span className="text-sm">{statusLabel(status)}</span></span> : circle;

  const trigger = showLabel ? (
    <button className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
      {circle}
      <span className="text-sm">{statusLabel(status)}</span>
    </button>
  ) : circle;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {allStatuses.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-xs", s === status && "bg-accent")}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <StatusIcon status={s} />
            {statusLabel(s)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
