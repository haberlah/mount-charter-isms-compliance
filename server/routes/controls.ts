import {
  type AiContextScope,
  aiContextScopeValues,
  bulkSaveQuestionResponsesSchema,
  bulkSoaUpdateSchema,
  type Persona,
  personaValues,
  saveQuestionResponseSchema,
  updateWorkspaceControlSchema,
} from "@shared/schema";
import { Router } from "express";
import { AIConfigurationError, generateControlQuestionnaire, streamControlAnalysis } from "../ai";
import { storage } from "../storage";
import { getParam, resolveWorkspaceId, sendValidationError } from "./helpers";

export const controlsRouter = Router();

function isMandatoryClause(controlNumber: string): boolean {
  return controlNumber.toUpperCase().startsWith("RQ");
}

controlsRouter.get("/categories", (_req, res) => {
  res.json(storage.listCategories());
});

controlsRouter.get("/controls", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.listControlsWithStatus(workspaceId));
});

controlsRouter.get("/controls/:controlNumber", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const detail = storage.getControlDetail(workspaceId, getParam(req.params.controlNumber));
  if (!detail) return res.status(404).json({ error: "Control not found" });
  res.json(detail);
});

controlsRouter.patch("/controls/:controlNumber", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ctrl = storage.getControlByNumber(getParam(req.params.controlNumber));
  if (!ctrl) return res.status(404).json({ error: "Control not found" });

  const parsed = updateWorkspaceControlSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid control update",
      parsed.error.issues,
    );
  }

  if (parsed.data.isApplicable === false && isMandatoryClause(ctrl.controlNumber)) {
    return sendValidationError(
      res,
      `ISO/IEC 27001:2022 Clauses 4–10 (${ctrl.controlNumber}) are mandatory and cannot be excluded from the Statement of Applicability.`,
    );
  }

  const updated = storage.updateWorkspaceControl(workspaceId, ctrl.id, parsed.data);
  res.json(updated);
});

controlsRouter.patch("/controls/:controlNumber/response", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ctrl = storage.getControlByNumber(getParam(req.params.controlNumber));
  if (!ctrl) return res.status(404).json({ error: "Control not found" });

  const parsed = saveQuestionResponseSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid question response",
      parsed.error.issues,
    );
  }

  const wc = storage.ensureWorkspaceControl(workspaceId, ctrl.id);
  const saved = storage.saveQuestionResponse({
    workspaceId,
    workspaceControlId: wc.id,
    questionId: parsed.data.questionId,
    responseText: parsed.data.responseText,
    evidenceReferences: parsed.data.evidenceReferences,
    changeSource: "manual",
  });
  res.json(saved);
});

controlsRouter.post("/controls/:controlNumber/responses/bulk", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ctrl = storage.getControlByNumber(getParam(req.params.controlNumber));
  if (!ctrl) return res.status(404).json({ error: "Control not found" });

  const parsed = bulkSaveQuestionResponsesSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid responses payload",
      parsed.error.issues,
    );
  }

  const wc = storage.ensureWorkspaceControl(workspaceId, ctrl.id);
  const saved = parsed.data.responses.map((item) =>
    storage.saveQuestionResponse({
      workspaceId,
      workspaceControlId: wc.id,
      questionId: item.questionId,
      responseText: item.responseText,
      evidenceReferences: item.evidenceReferences,
      changeSource: "manual",
    }),
  );
  res.json({ savedCount: saved.length, responses: saved });
});

controlsRouter.post("/controls/soa/bulk", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = bulkSoaUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid SoA update",
      parsed.error.issues,
    );
  }

  const forbiddenClause = parsed.data.updates.find(
    (u) => u.isApplicable === false && isMandatoryClause(u.controlNumber),
  );
  if (forbiddenClause) {
    return sendValidationError(
      res,
      `ISO/IEC 27001:2022 Clauses 4–10 (${forbiddenClause.controlNumber}) are mandatory and cannot be excluded.`,
    );
  }

  const updated = [];
  for (const item of parsed.data.updates) {
    const ctrl = storage.getControlByNumber(item.controlNumber);
    if (!ctrl) continue;
    updated.push(
      storage.updateWorkspaceControl(workspaceId, ctrl.id, {
        isApplicable: item.isApplicable,
        inclusionJustification: item.inclusionJustification,
        exclusionJustification: item.exclusionJustification,
        implementationStatus: item.implementationStatus,
        selectedUrgency: item.selectedUrgency,
        frequency: item.frequency,
        startQuarter: item.startQuarter,
      }),
    );
  }
  res.json({ updatedCount: updated.length });
});

controlsRouter.post("/controls/:controlNumber/generate-questionnaire", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ctrl = storage.getControlByNumber(getParam(req.params.controlNumber));
  if (!ctrl) return res.status(404).json({ error: "Control not found" });

  try {
    const profile = storage.getProfile(workspaceId);
    const result = await generateControlQuestionnaire(
      ctrl.controlNumber,
      ctrl.name,
      ctrl.description,
      profile.aiScreeningModel,
      profile,
    );
    storage.saveControlQuestionnaire(ctrl.id, result.questionnaire);
    storage.logAiInteraction({
      workspaceId,
      interactionType: "questionnaire_generation",
      controlId: ctrl.id,
      inputSummary: `Generated questionnaire for ${ctrl.controlNumber}`,
      outputSummary: `${result.questionnaire.questions.length} questions generated`,
      modelUsed: result.model,
      tokensUsed: result.tokensUsed,
    });
    res.json(result.questionnaire);
  } catch (err) {
    if (err instanceof AIConfigurationError) {
      return res.status(503).json({ error: err.message });
    }
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Questionnaire generation failed" });
  }
});

controlsRouter.post("/controls/:controlNumber/analyse-stream", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const detail = storage.getControlDetail(workspaceId, getParam(req.params.controlNumber));
  if (!detail) return res.status(404).json({ error: "Control not found" });

  const requestedPersona = req.body?.persona;
  const persona: Persona = (personaValues as readonly string[]).includes(requestedPersona)
    ? (requestedPersona as Persona)
    : detail.workspaceControl.selectedPersona;
  const requestedScope = req.body?.aiContextScope;
  const aiContextScope: AiContextScope = (aiContextScopeValues as readonly string[]).includes(
    requestedScope,
  )
    ? (requestedScope as AiContextScope)
    : "last_3";
  const comments = typeof req.body?.comments === "string" ? req.body.comments.slice(0, 20000) : "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  const sendEvent = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const profile = storage.getProfile(workspaceId);
    const evidenceExcerpts = detail.linkedDocuments
      .slice(0, 4)
      .map((d) => {
        const chunks = storage.getDocumentChunks(workspaceId, d.id);
        if (chunks.length === 0) return null;
        return {
          title: d.title,
          evidenceType: d.evidenceType,
          documentDate: d.documentDate,
          excerpt: chunks
            .slice(0, 3)
            .map((c) => c.content)
            .join("\n\n"),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const { analysis, tokensUsed, promptTokens, completionTokens, costUsd, provider, model } =
      await streamControlAnalysis({
        persona,
        controlNumber: detail.controlNumber,
        controlName: detail.name,
        questions: detail.aiQuestionnaire?.questions || [],
        responses: detail.responses,
        comments,
        linkedDocumentTitles: [
          ...detail.linkedDocuments.map((d) => `${d.title} (${d.originalFilename})`),
          ...detail.evidenceLinks.map((e) => e.title),
        ],
        evidenceExcerpts,
        previousTests: detail.testRuns.map((t) => ({
          testDate: t.testDate,
          status: t.status,
          comments: t.comments,
        })),
        aiContextScope,
        profile,
        signal: abortController.signal,
        onPhase: (message) => sendEvent("phase", { message }),
        onToken: (text) => sendEvent("token", { text }),
      });

    storage.logAiInteraction({
      workspaceId,
      interactionType: "test_analysis",
      controlId: detail.id,
      inputSummary: `${persona} analysis for ${detail.controlNumber}${evidenceExcerpts.length ? ` (${evidenceExcerpts.length} evidence doc excerpts)` : ""}`,
      outputSummary: `${analysis.suggested_status} (${Math.round(analysis.confidence * 100)}%)`,
      modelUsed: model,
      provider,
      tokensUsed,
      promptTokens,
      completionTokens,
      costUsd,
    });

    sendEvent("complete", { analysis, tokensUsed, costUsd, model });
  } catch (err) {
    if (!abortController.signal.aborted) {
      sendEvent("error", {
        error: err instanceof Error ? err.message : "AI analysis failed",
      });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});
