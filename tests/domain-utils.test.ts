import assert from "node:assert/strict";
import test from "node:test";
import type { Control, WorkspaceProfile } from "@shared/schema";
import {
  calculateNextDueDate,
  getControlScheduleDefaults,
  getEffectiveControlFrequency,
  getEffectiveStartQuarter,
} from "../server/control-schedule";
import { escapeCsvField } from "../server/csv";
import { bucketUrgencyForControl, getUrgencySortRank, isCompletedStatus } from "../server/urgency";

test("CSV export escapes quotes/commas and neutralizes formula-leading cells", () => {
  assert.equal(escapeCsvField('hello, "world"'), '"hello, ""world"""');
  assert.equal(escapeCsvField("=1+1"), "'=1+1");
  assert.equal(escapeCsvField("+SUM(1,2)"), '"\'+SUM(1,2)"');
  assert.equal(escapeCsvField("  @malicious"), "'  @malicious");
  assert.equal(escapeCsvField("-10"), "'-10");
});

test("control scheduling follows Australian financial year quarters and handles unscheduled controls", () => {
  assert.equal(calculateNextDueDate(null, "Q1"), null);
  assert.equal(calculateNextDueDate("Annual", null), null);
  assert.match(calculateNextDueDate("Monthly", null) || "", /^\d{4}-\d{2}-01$/);

  const may = new Date("2026-05-15T00:00:00Z");
  assert.equal(calculateNextDueDate("Annual", "Q1", may), "2026-07-01");
  assert.equal(calculateNextDueDate("Annual", "Q2", may), "2026-10-01");
  assert.equal(calculateNextDueDate("Annual", "Q3", may), "2027-01-01");
  assert.equal(calculateNextDueDate("Annual", "Q4", may), "2027-04-01");

  assert.equal(
    calculateNextDueDate("Quarterly", "Q1", new Date("2026-08-15T00:00:00Z")),
    "2026-10-01",
  );

  const profileDefaults: Pick<WorkspaceProfile, "defaultControlFrequency" | "defaultStartQuarter"> =
    {
      defaultControlFrequency: "Annual",
      defaultStartQuarter: "Q2",
    };
  assert.deepEqual(getControlScheduleDefaults(null), { frequency: null, startQuarter: null });
  assert.deepEqual(getControlScheduleDefaults(profileDefaults), {
    frequency: "Annual",
    startQuarter: "Q2",
  });

  const ctrlDefaults: Pick<Control, "defaultFrequency" | "startQuarter"> = {
    defaultFrequency: "Annual",
    startQuarter: "Q1",
  };
  assert.equal(getEffectiveControlFrequency(ctrlDefaults, null), "Annual");
  assert.equal(getEffectiveStartQuarter(ctrlDefaults, null), "Q1");
  assert.equal(
    getEffectiveControlFrequency(ctrlDefaults, null, { frequency: "Monthly" }),
    "Monthly",
  );
  assert.equal(getEffectiveControlFrequency(ctrlDefaults, { frequency: null }), null);
  assert.equal(getEffectiveStartQuarter(ctrlDefaults, { startQuarter: null }), null);
});

test("urgency sorting and bucketing respect applicability and completed statuses", () => {
  assert.ok(getUrgencySortRank("now") < getUrgencySortRank("next"));
  assert.ok(getUrgencySortRank("next") < getUrgencySortRank("later"));
  assert.equal(isCompletedStatus("Pass"), true);
  assert.equal(isCompletedStatus("PassPrevious"), true);
  assert.equal(isCompletedStatus("ContinualImprovement"), true);
  assert.equal(isCompletedStatus("Fail"), false);
  assert.equal(isCompletedStatus("Blocked"), false);

  assert.equal(
    bucketUrgencyForControl({ isApplicable: false, selectedUrgency: "now", isCompleted: false }),
    null,
  );
  assert.equal(
    bucketUrgencyForControl({ isApplicable: true, selectedUrgency: "now", isCompleted: true }),
    "completed",
  );
  assert.equal(
    bucketUrgencyForControl({ isApplicable: true, selectedUrgency: "next", isCompleted: false }),
    "next",
  );
});
