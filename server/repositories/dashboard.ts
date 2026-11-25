import type {
  ControlSummary,
  DashboardStats,
  DocumentStats,
  UrgencyBoardItem,
} from "@shared/schema";
import { bucketUrgencyForControl, createUrgencySummary, isControlCompleted } from "../urgency";
import { auditRepository } from "./audit";
import { controlsRepository } from "./controls";
import { evidenceRepository } from "./evidence";
import { frameworksRepository } from "./frameworks";
import { governanceRepository } from "./governance";
import { workspaceRepository } from "./workspaces";

export const dashboardRepository = {
  getDocumentStats(workspaceId: number, controls?: ControlSummary[]): DocumentStats {
    const docs = evidenceRepository.listDocuments(workspaceId);
    const allControls = controls ?? controlsRepository.listControlsWithStatus(workspaceId);
    const applicable = allControls.filter((c) => c.workspaceControl.isApplicable);
    const controlsWithEvidence = applicable.filter(
      (c) => c.linkedDocumentCount > 0 || c.evidenceLinkCount > 0,
    ).length;
    const documentsByType: Record<string, number> = {};
    let totalFileSize = 0;
    for (const d of docs) {
      totalFileSize += d.fileSize;
      const key = d.evidenceType || "OTHER";
      documentsByType[key] = (documentsByType[key] || 0) + 1;
    }
    const pendingSuggestions = allControls.reduce((acc, c) => acc + c.pendingMatchCount, 0);
    return {
      totalDocuments: docs.length,
      totalFileSize,
      controlsWithEvidence,
      controlsWithGaps: Math.max(0, applicable.length - controlsWithEvidence),
      documentsByType,
      pendingSuggestions,
    };
  },

  getDashboardStats(workspaceId: number): DashboardStats {
    const controls = controlsRepository.listControlsWithStatus(workspaceId);
    const profile = workspaceRepository.getProfile(workspaceId);
    const categories = controlsRepository.listCategories();
    const recentTestRuns = auditRepository.listTestRuns(workspaceId, 12);
    const documentStats = dashboardRepository.getDocumentStats(workspaceId, controls);

    let applicableControls = 0;
    let excludedControls = 0;
    let testedControls = 0;
    let passedControls = 0;
    let failedControls = 0;
    let blockedControls = 0;
    let continualImprovementControls = 0;
    let notTestedControls = 0;

    let totalQuestions = 0;
    let answeredQuestions = 0;
    let controlsComplete = 0;
    let controlsPartial = 0;
    let controlsNotStarted = 0;

    const catMap = new Map<
      number,
      {
        categoryId: number;
        categoryName: string;
        total: number;
        passed: number;
        failed: number;
        notTested: number;
      }
    >();
    for (const cat of categories) {
      catMap.set(cat.id, {
        categoryId: cat.id,
        categoryName: cat.name,
        total: 0,
        passed: 0,
        failed: 0,
        notTested: 0,
      });
    }

    const urgencySummary = createUrgencySummary();
    const urgencyBoard: {
      now: UrgencyBoardItem[];
      next: UrgencyBoardItem[];
      later: UrgencyBoardItem[];
    } = { now: [], next: [], later: [] };

    const dueSoon: DashboardStats["dueSoon"] = [];
    const nowMs = Date.now();

    for (const c of controls) {
      const applicable = c.workspaceControl.isApplicable;
      if (!applicable) {
        excludedControls++;
        continue;
      }
      applicableControls++;

      const status = c.latestTestRun?.status ?? null;
      const completed = isControlCompleted(status);

      const catEntry = catMap.get(c.categoryId);
      if (catEntry) catEntry.total++;

      if (!status || status === "NotAttempted") {
        notTestedControls++;
        if (catEntry) catEntry.notTested++;
      } else {
        testedControls++;
        if (status === "Pass" || status === "PassPrevious") {
          passedControls++;
          if (catEntry) catEntry.passed++;
        } else if (status === "ContinualImprovement") {
          continualImprovementControls++;
          passedControls++;
          if (catEntry) catEntry.passed++;
        } else if (status === "Fail") {
          failedControls++;
          if (catEntry) catEntry.failed++;
        } else if (status === "Blocked") {
          blockedControls++;
        }
      }

      totalQuestions += c.questionnaireProgress.total;
      answeredQuestions += c.questionnaireProgress.answered;
      if (c.questionnaireProgress.total > 0) {
        if (c.questionnaireProgress.answered >= c.questionnaireProgress.total) controlsComplete++;
        else if (c.questionnaireProgress.answered > 0) controlsPartial++;
        else controlsNotStarted++;
      }

      const urg = c.workspaceControl.selectedUrgency;
      urgencySummary[urg].total++;
      if (completed) {
        urgencySummary[urg].completed++;
        urgencySummary.completed++;
      } else {
        urgencySummary[urg].open++;
      }

      let daysUntilDue: number | null = null;
      if (c.workspaceControl.nextDueDate) {
        const dueMs = new Date(`${c.workspaceControl.nextDueDate}T00:00:00Z`).getTime();
        daysUntilDue = Math.ceil((dueMs - nowMs) / (1000 * 60 * 60 * 24));
        if (daysUntilDue <= 45) {
          dueSoon.push({
            controlNumber: c.controlNumber,
            controlName: c.name,
            dueDate: c.workspaceControl.nextDueDate,
            daysUntilDue,
            lastTested: c.latestTestRun?.testDate ?? null,
          });
        }
      }

      const bucket = bucketUrgencyForControl({
        isApplicable: true,
        selectedUrgency: urg,
        isCompleted: completed,
      });
      if (bucket === "now" || bucket === "next" || bucket === "later") {
        urgencyBoard[bucket].push({
          controlNumber: c.controlNumber,
          controlName: c.name,
          categoryName: c.category.name,
          selectedUrgency: urg,
          status,
          dueDate: c.workspaceControl.nextDueDate,
          daysUntilDue,
          ownerRole: c.ownerRole,
          questionnaireProgress: c.questionnaireProgress,
        });
      }
    }

    dueSoon.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    return {
      totalControls: controls.length,
      applicableControls,
      excludedControls,
      testedControls,
      passedControls,
      failedControls,
      notTestedControls,
      blockedControls,
      continualImprovementControls,
      compliancePercentage:
        applicableControls > 0 ? Math.round((passedControls / applicableControls) * 100) : 0,
      questionnaireProgress: {
        totalQuestions,
        answeredQuestions,
        percentage: totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0,
        controlsComplete,
        controlsPartial,
        controlsNotStarted,
      },
      categoryBreakdown: Array.from(catMap.values()),
      urgencySummary,
      urgencyBoard,
      dueSoon: dueSoon.slice(0, 12),
      recentTestRuns,
      documentStats,
      onboarding: {
        hasProfile: Boolean(
          profile.industry ||
            profile.techStack ||
            profile.companySize ||
            profile.deploymentModel ||
            profile.additionalContext,
        ),
        hasScopedControls:
          excludedControls > 0 ||
          urgencySummary.now.total > 0 ||
          urgencySummary.next.total > 0 ||
          controls.some(
            (c) =>
              c.workspaceControl.inclusionJustification ||
              c.workspaceControl.implementationStatus !== "NotImplemented",
          ),
        hasDocuments: documentStats.totalDocuments > 0,
        hasResponsesOrTests: answeredQuestions > 0 || testedControls > 0,
        dismissed: profile.onboardingDismissed,
      },
      climateChangeRelevant: profile.climateChangeRelevant,
      frameworks: frameworksRepository.listFrameworks(workspaceId),
      governanceSummary: governanceRepository.getGovernanceSummary(workspaceId),
    };
  },
};
