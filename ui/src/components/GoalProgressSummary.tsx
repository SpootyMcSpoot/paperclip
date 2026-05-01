import type { GoalProgress } from "@stapleai/shared";
import { Progress } from "@/components/ui/progress";

interface GoalProgressSummaryProps {
  progress: GoalProgress;
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <Progress value={value} aria-label={label} />
    </div>
  );
}

export function GoalProgressSummary({ progress }: GoalProgressSummaryProps) {
  return (
    <div className="border border-border rounded-md p-4 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Overall Progress</span>
          <span className="text-sm font-semibold">{progress.overallProgress}%</span>
        </div>
        <Progress value={progress.overallProgress} className="h-3" aria-label="Overall progress" />
      </div>

      <div className="grid grid-cols-3 gap-4 pt-1">
        <ProgressRow label="Key Results" value={progress.keyResultsProgress} />
        <ProgressRow label="Issues" value={progress.issueCompletionProgress} />
        <ProgressRow label="Sub-Goals" value={progress.childGoalsProgress} />
      </div>
    </div>
  );
}
