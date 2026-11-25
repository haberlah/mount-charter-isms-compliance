import type { ControlFrequency, ControlStartQuarter, WorkspaceProfile } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface ScheduleTabProps {
  profile: WorkspaceProfile | undefined;
}

export function ScheduleTab({ profile }: ScheduleTabProps) {
  const [defaultFreq, setDefaultFreq] = useState<ControlFrequency>("Annual");
  const [defaultQuarter, setDefaultQuarter] = useState<ControlStartQuarter>("Q1");
  const [hideExcluded, setHideExcluded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDefaultFreq(profile.defaultControlFrequency || "Annual");
    setDefaultQuarter(profile.defaultStartQuarter || "Q1");
    setHideExcluded(Boolean(profile.hideNonApplicableControls));
  }, [profile]);

  const savePrefs = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/settings/profile", {
        defaultControlFrequency: defaultFreq,
        defaultStartQuarter: defaultQuarter,
        hideNonApplicableControls: hideExcluded,
      }),
    onSuccess: () => {
      invalidateWorkspaceQueries();
      showToast("Schedule & display preferences saved", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const applyDefaultsToControls = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/profile", {
        defaultControlFrequency: defaultFreq,
        defaultStartQuarter: defaultQuarter,
      });
      return apiRequest<{ updatedCount: number }>("POST", "/api/settings/apply-schedule-defaults");
    },
    onSuccess: (res) => {
      invalidateWorkspaceQueries();
      showToast(
        `Applied ${defaultFreq} / ${defaultQuarter} schedule to ${res.updatedCount} controls`,
        {
          tone: "ok",
        },
      );
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  return (
    <div className="pp-card">
      <div className="pp-card__body mw-stack">
        <div className="mw-form-grid">
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="sched-freq">
              Default Control Review Frequency
            </label>
            <select
              id="sched-freq"
              className="pp-select"
              value={defaultFreq}
              onChange={(e) => setDefaultFreq(e.target.value as ControlFrequency)}
            >
              <option value="Annual">Annual</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="sched-q">
              Default Australian Financial Year Quarter
            </label>
            <select
              id="sched-q"
              className="pp-select"
              value={defaultQuarter}
              onChange={(e) => setDefaultQuarter(e.target.value as ControlStartQuarter)}
            >
              <option value="Q1">Q1 (Jul–Sep)</option>
              <option value="Q2">Q2 (Oct–Dec)</option>
              <option value="Q3">Q3 (Jan–Mar)</option>
              <option value="Q4">Q4 (Apr–Jun)</option>
            </select>
          </div>
        </div>

        <div className="pp-setting">
          <div className="pp-setting__main">
            <div className="pp-setting__label">Hide non-applicable controls by default</div>
            <div className="pp-setting__text">
              Filters excluded Annex A controls out of the Controls workbench (can still be revealed
              anytime).
            </div>
          </div>
          <div className="pp-setting__control">
            <input
              type="checkbox"
              className="pp-switch"
              role="switch"
              aria-checked={hideExcluded}
              aria-label="Hide non-applicable controls by default"
              checked={hideExcluded}
              onChange={(e) => setHideExcluded(e.target.checked)}
            />
          </div>
        </div>

        <div className="mw-row mw-row--wrap">
          <button
            type="button"
            className="pp-button pp-button--primary"
            disabled={savePrefs.isPending}
            onClick={() => savePrefs.mutate()}
          >
            Save Preferences
          </button>
          <button
            type="button"
            className="pp-button"
            disabled={applyDefaultsToControls.isPending}
            onClick={() => applyDefaultsToControls.mutate()}
          >
            {applyDefaultsToControls.isPending
              ? "Applying…"
              : `Apply ${defaultFreq} / ${defaultQuarter} to All Controls`}
          </button>
        </div>
      </div>
    </div>
  );
}
