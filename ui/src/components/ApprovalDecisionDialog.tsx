import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type DecisionAction = "approve" | "reject" | "revision";

interface ApprovalDecisionDialogProps {
  open: boolean;
  onClose: () => void;
  action: DecisionAction;
  onSubmit: (note: string) => void;
  isLoading: boolean;
}

const actionConfig: Record<
  DecisionAction,
  {
    title: string;
    description: string;
    submitLabel: string;
    submitVariant: "default" | "destructive";
    noteHint: string;
  }
> = {
  approve: {
    title: "Approve",
    description:
      "Confirm this approval. The requesting agent will be notified.",
    submitLabel: "Approve",
    submitVariant: "default",
    noteHint: "Optional note explaining your decision...",
  },
  reject: {
    title: "Reject",
    description: "Reject this request. The requesting agent will be notified.",
    submitLabel: "Reject",
    submitVariant: "destructive",
    noteHint: "Explain why this request was rejected...",
  },
  revision: {
    title: "Request Revision",
    description: "Ask the requesting agent to revise and resubmit.",
    submitLabel: "Request Revision",
    submitVariant: "default",
    noteHint: "Describe what changes are needed...",
  },
};

export function ApprovalDecisionDialog({
  open,
  onClose,
  action,
  onSubmit,
  isLoading,
}: ApprovalDecisionDialogProps) {
  const [note, setNote] = useState("");
  const config = actionConfig[action];

  function handleSubmit() {
    onSubmit(note.trim());
    setNote("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setNote("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decision-note">Decision note</Label>
          <Textarea
            id="decision-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={config.noteHint}
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant={config.submitVariant}
            onClick={handleSubmit}
            disabled={isLoading}
            className={
              action === "approve"
                ? "bg-green-700 hover:bg-green-600 text-white"
                : undefined
            }
          >
            {isLoading ? "Submitting..." : config.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
