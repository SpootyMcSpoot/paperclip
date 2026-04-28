import type { Goal } from "@stapleai/shared";
import { Link } from "@/lib/router";
import { StatusBadge } from "./StatusBadge";
import { Progress } from "@/components/ui/progress";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";

interface GoalTreeProps {
  goals: Goal[];
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
  progressMap?: Record<string, number>;
}

interface GoalNodeProps {
  goal: Goal;
  children: Goal[];
  allGoals: Goal[];
  depth: number;
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
  progressMap?: Record<string, number>;
}

function GoalNode({
  goal,
  children,
  allGoals,
  depth,
  goalLink,
  onSelect,
  progressMap,
}: GoalNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;
  const link = goalLink?.(goal);
  const progress = progressMap?.[goal.id];

  const inner = (
    <>
      {hasChildren ? (
        <button
          type="button"
          className="p-0.5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          aria-label={expanded ? `Collapse ${goal.title}` : `Expand ${goal.title}`}
          aria-expanded={expanded}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              expanded && "rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
      ) : (
        <span className="w-4" />
      )}
      <span className="text-xs text-muted-foreground capitalize">
        {goal.level}
      </span>
      <span className="flex-1 truncate">{goal.title}</span>
      {progress !== undefined && (
        <div className="flex items-center gap-1.5 shrink-0 w-24">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground w-8 text-right">
            {progress}%
          </span>
        </div>
      )}
      <StatusBadge status={goal.status} />
    </>
  );

  const classes = cn(
    "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors cursor-pointer hover:bg-accent/50",
  );

  return (
    <div>
      {link ? (
        <Link
          to={link}
          className={cn(classes, "no-underline text-inherit")}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          {inner}
        </Link>
      ) : (
        <div
          className={classes}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => onSelect?.(goal)}
        >
          {inner}
        </div>
      )}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <GoalNode
              key={child.id}
              goal={child}
              children={allGoals.filter((g) => g.parentId === child.id)}
              allGoals={allGoals}
              depth={depth + 1}
              goalLink={goalLink}
              onSelect={onSelect}
              progressMap={progressMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalTree({
  goals,
  goalLink,
  onSelect,
  progressMap,
}: GoalTreeProps) {
  const goalIds = new Set(goals.map((g) => g.id));
  const roots = goals.filter((g) => !g.parentId || !goalIds.has(g.parentId));

  if (goals.length === 0) {
    return <p className="text-sm text-muted-foreground">No goals.</p>;
  }

  return (
    <div className="border border-border py-1">
      {roots.map((goal) => (
        <GoalNode
          key={goal.id}
          goal={goal}
          children={goals.filter((g) => g.parentId === goal.id)}
          allGoals={goals}
          depth={0}
          goalLink={goalLink}
          onSelect={onSelect}
          progressMap={progressMap}
        />
      ))}
    </div>
  );
}
