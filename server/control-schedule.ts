import type { Control, OrganisationProfile } from "@shared/schema";

export type ControlFrequency = "Annual" | "Quarterly" | "Monthly";
export type ControlStartQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export const CONTROL_FREQUENCIES: ControlFrequency[] = ["Annual", "Quarterly", "Monthly"];
export const CONTROL_START_QUARTERS: ControlStartQuarter[] = ["Q1", "Q2", "Q3", "Q4"];
export const AUSTRALIAN_FINANCIAL_YEAR_START_MONTHS: Record<ControlStartQuarter, number> = {
  Q1: 6,
  Q2: 9,
  Q3: 0,
  Q4: 3,
};

function formatCalendarDate(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0];
}

export function calculateNextDueDate(
  frequency: ControlFrequency | null | undefined,
  startQuarter: ControlStartQuarter | null | undefined,
  asOf: Date = new Date(),
): string | null {
  if (!frequency) return null;

  const now = asOf;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (frequency === "Monthly") {
    return formatCalendarDate(currentYear, currentMonth + 1);
  }

  if (!startQuarter) return null;

  const startMonth = AUSTRALIAN_FINANCIAL_YEAR_START_MONTHS[startQuarter];
  let nextDueDate: Date;

  if (frequency === "Annual") {
    nextDueDate = new Date(currentYear, startMonth, 1);
    if (nextDueDate <= now) {
      nextDueDate = new Date(currentYear + 1, startMonth, 1);
    }
    return formatCalendarDate(nextDueDate.getFullYear(), nextDueDate.getMonth());
  }

  const candidateDates: Date[] = [];
  for (const year of [currentYear - 1, currentYear, currentYear + 1]) {
    for (const monthOffset of [0, 3, 6, 9]) {
      candidateDates.push(new Date(year, startMonth + monthOffset, 1));
    }
  }

  const nextQuarter = candidateDates
    .filter((candidate) => candidate > now)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return formatCalendarDate(nextQuarter.getFullYear(), nextQuarter.getMonth());
}

export function getControlScheduleDefaults(
  profile:
    | Pick<OrganisationProfile, "defaultControlFrequency" | "defaultStartQuarter">
    | null
    | undefined,
): {
  frequency: ControlFrequency | null;
  startQuarter: ControlStartQuarter | null;
} {
  return {
    frequency: (profile?.defaultControlFrequency as ControlFrequency | null | undefined) ?? null,
    startQuarter: (profile?.defaultStartQuarter as ControlStartQuarter | null | undefined) ?? null,
  };
}

export function getEffectiveControlFrequency(
  control: Pick<Control, "defaultFrequency">,
  orgControl: { frequency: ControlFrequency | null } | null | undefined,
  defaults?: { frequency: ControlFrequency | null },
): ControlFrequency | null {
  if (orgControl) return orgControl.frequency;
  if (defaults) return defaults.frequency;
  return (control.defaultFrequency as ControlFrequency | null | undefined) ?? null;
}

export function getEffectiveStartQuarter(
  control: Pick<Control, "startQuarter">,
  orgControl: { startQuarter: ControlStartQuarter | null } | null | undefined,
  defaults?: { startQuarter: ControlStartQuarter | null },
): ControlStartQuarter | null {
  if (orgControl) return orgControl.startQuarter;
  if (defaults) return defaults.startQuarter;
  return (control.startQuarter as ControlStartQuarter | null | undefined) ?? null;
}
