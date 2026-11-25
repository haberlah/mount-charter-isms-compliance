import type { ControlUrgency } from "@shared/schema";

export type UrgencyBucket = ControlUrgency | "completed" | null;

const urgencySortRank: Record<ControlUrgency, number> = { now: 0, next: 1, later: 2 };

export function getUrgencySortRank(urgency: ControlUrgency | null | undefined): number {
  return urgencySortRank[urgency || "later"];
}

export function isCompletedStatus(status: string | null | undefined): boolean {
  return status === "Pass" || status === "PassPrevious" || status === "ContinualImprovement";
}

export function isControlCompleted(status: string | null | undefined): boolean {
  return isCompletedStatus(status);
}

export function bucketUrgencyForControl({
  isApplicable,
  selectedUrgency,
  isCompleted,
}: {
  isApplicable: boolean;
  selectedUrgency: ControlUrgency | null | undefined;
  isCompleted: boolean;
}): UrgencyBucket {
  if (!isApplicable) return null;
  if (isCompleted) return "completed";
  return selectedUrgency || "later";
}

export function createUrgencySummary() {
  return {
    now: { total: 0, completed: 0, open: 0 },
    next: { total: 0, completed: 0, open: 0 },
    later: { total: 0, completed: 0, open: 0 },
    completed: 0,
  };
}
