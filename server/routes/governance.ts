import {
  createCapaSchema,
  createGovernanceReviewSchema,
  createIncidentSchema,
  createPolicySchema,
  createRiskSchema,
  createVendorSchema,
  updateCapaSchema,
  updateIncidentSchema,
  updatePolicySchema,
  updateRiskSchema,
  updateVendorSchema,
} from "@shared/schema";
import { Router } from "express";
import { escapeCsvField } from "../csv";
import { POLICY_TEMPLATES } from "../policy-templates";
import { storage } from "../storage";
import { getParam, resolveWorkspaceId, sendValidationError } from "./helpers";

export const governanceRouter = Router();

governanceRouter.get("/governance/summary", (req, res) => {
  res.json(storage.getGovernanceSummary(resolveWorkspaceId(req)));
});

// ─── Risks ───────────────────────────────────────────────────────────────────

governanceRouter.get("/governance/risks", (req, res) => {
  res.json(storage.listRisks(resolveWorkspaceId(req)));
});

governanceRouter.post("/governance/risks", (req, res) => {
  const parsed = createRiskSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid risk payload",
      parsed.error.issues,
    );
  }
  const created = storage.createRisk(resolveWorkspaceId(req), parsed.data);
  res.status(201).json(created);
});

governanceRouter.post("/governance/risks/seed-starter", (req, res) => {
  const created = storage.seedStarterRisks(resolveWorkspaceId(req));
  res
    .status(201)
    .json({ createdCount: created.length, risks: storage.listRisks(resolveWorkspaceId(req)) });
});

governanceRouter.patch("/governance/risks/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid risk id");
  const parsed = updateRiskSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid risk update",
      parsed.error.issues,
    );
  }
  const updated = storage.updateRisk(resolveWorkspaceId(req), id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Risk not found" });
  res.json(updated);
});

governanceRouter.delete("/governance/risks/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid risk id");
  if (!storage.deleteRisk(resolveWorkspaceId(req), id)) {
    return res.status(404).json({ error: "Risk not found" });
  }
  res.json({ ok: true });
});

governanceRouter.get("/exports/risks.csv", (req, res) => {
  const risks = storage.listRisks(resolveWorkspaceId(req));
  const headers = [
    "Risk Code",
    "Title",
    "Asset / Process",
    "Threat",
    "Inherent L",
    "Inherent I",
    "Inherent Score",
    "Treatment",
    "Treatment Plan",
    "Residual L",
    "Residual I",
    "Residual Score",
    "Linked ISO Controls",
    "Owner",
    "Review Date",
    "Status",
  ];
  const rows = risks.map((r) =>
    [
      r.riskCode,
      r.title,
      r.assetOrProcess || "",
      r.threat || "",
      r.likelihood,
      r.impact,
      r.inherentScore,
      r.treatment,
      r.treatmentPlan || "",
      r.residualLikelihood,
      r.residualImpact,
      r.residualScore,
      r.linkedControls.join("; "),
      r.owner || "",
      r.reviewDate || "",
      r.status,
    ]
      .map(escapeCsvField)
      .join(","),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="mount-charter-risk-register.csv"');
  res.send([headers.map(escapeCsvField).join(","), ...rows].join("\n"));
});

// ─── CAPA & Reviews ──────────────────────────────────────────────────────────

governanceRouter.get("/governance/capas", (req, res) => {
  res.json(storage.listCapas(resolveWorkspaceId(req)));
});

governanceRouter.post("/governance/capas", (req, res) => {
  const parsed = createCapaSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid CAPA payload",
      parsed.error.issues,
    );
  }
  res.status(201).json(storage.createCapa(resolveWorkspaceId(req), parsed.data));
});

governanceRouter.patch("/governance/capas/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid CAPA id");
  const parsed = updateCapaSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid CAPA update",
      parsed.error.issues,
    );
  }
  const updated = storage.updateCapa(resolveWorkspaceId(req), id, parsed.data);
  if (!updated) return res.status(404).json({ error: "CAPA item not found" });
  res.json(updated);
});

governanceRouter.delete("/governance/capas/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid CAPA id");
  if (!storage.deleteCapa(resolveWorkspaceId(req), id)) {
    return res.status(404).json({ error: "CAPA item not found" });
  }
  res.json({ ok: true });
});

governanceRouter.get("/governance/reviews", (req, res) => {
  res.json(storage.listReviews(resolveWorkspaceId(req)));
});

governanceRouter.post("/governance/reviews", (req, res) => {
  const parsed = createGovernanceReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid review payload",
      parsed.error.issues,
    );
  }
  res.status(201).json(storage.createReview(resolveWorkspaceId(req), parsed.data));
});

governanceRouter.delete("/governance/reviews/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid review id");
  if (!storage.deleteReview(resolveWorkspaceId(req), id)) {
    return res.status(404).json({ error: "Governance review not found" });
  }
  res.json({ ok: true });
});

// ─── Vendors (CPS 230 Material Service Providers) ────────────────────────────

governanceRouter.get("/governance/vendors", (req, res) => {
  res.json(storage.listVendors(resolveWorkspaceId(req)));
});

governanceRouter.post("/governance/vendors", (req, res) => {
  const parsed = createVendorSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid vendor payload",
      parsed.error.issues,
    );
  }
  res.status(201).json(storage.createVendor(resolveWorkspaceId(req), parsed.data));
});

governanceRouter.patch("/governance/vendors/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid vendor id");
  const parsed = updateVendorSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid vendor update",
      parsed.error.issues,
    );
  }
  const updated = storage.updateVendor(resolveWorkspaceId(req), id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Vendor not found" });
  res.json(updated);
});

governanceRouter.delete("/governance/vendors/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid vendor id");
  if (!storage.deleteVendor(resolveWorkspaceId(req), id)) {
    return res.status(404).json({ error: "Vendor not found" });
  }
  res.json({ ok: true });
});

governanceRouter.get("/exports/vendors.csv", (req, res) => {
  const vendors = storage.listVendors(resolveWorkspaceId(req));
  const headers = [
    "Vendor",
    "Service",
    "Material Service Provider (CPS 230)",
    "Criticality",
    "Data Residency",
    "Data Types Shared",
    "Exit Plan Status",
    "Risk Rating",
    "Contract Expiry",
    "Last Reviewed",
    "Owner",
    "Linked Controls",
  ];
  const rows = vendors.map((v) =>
    [
      v.name,
      v.serviceDescription || "",
      v.isMaterialServiceProvider ? "Yes" : "No",
      v.criticality,
      v.dataResidency || "",
      v.dataTypesShared || "",
      v.exitPlanStatus,
      v.riskRating,
      v.contractExpiryDate || "",
      v.lastReviewedDate || "",
      v.owner || "",
      v.linkedControls.join("; "),
    ]
      .map(escapeCsvField)
      .join(","),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="mount-charter-vendors-cps230.csv"');
  res.send([headers.map(escapeCsvField).join(","), ...rows].join("\n"));
});

// ─── Policies & Starter Templates ────────────────────────────────────────────

governanceRouter.get("/governance/policy-templates", (_req, res) => {
  res.json(
    POLICY_TEMPLATES.map((t) => ({
      id: t.id,
      title: t.title,
      version: t.version,
      linkedControls: t.linkedControls,
      summary: t.summary,
    })),
  );
});

governanceRouter.get("/governance/policies", (req, res) => {
  res.json(storage.listPolicies(resolveWorkspaceId(req)));
});

governanceRouter.post("/governance/policies", (req, res) => {
  const parsed = createPolicySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid policy payload",
      parsed.error.issues,
    );
  }
  res.status(201).json(storage.createPolicy(resolveWorkspaceId(req), parsed.data));
});

governanceRouter.post("/governance/policies/from-template/:templateId", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const templateId = getParam(req.params.templateId);
  const tpl = POLICY_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return res.status(404).json({ error: "Policy template not found" });
  const profile = storage.getProfile(workspaceId);
  const orgName = profile.companyName || "My Organisation";
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const created = storage.createPolicy(workspaceId, {
    title: tpl.title,
    version: tpl.version,
    owner: "Head of Security",
    status: "Draft",
    nextReviewDate: nextYear.toISOString().slice(0, 10),
    contentMarkdown: tpl.render(orgName, profile),
    linkedControls: [...tpl.linkedControls],
  });
  res.status(201).json(created);
});

governanceRouter.patch("/governance/policies/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid policy id");
  const parsed = updatePolicySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid policy update",
      parsed.error.issues,
    );
  }
  const updated = storage.updatePolicy(resolveWorkspaceId(req), id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Policy not found" });
  res.json(updated);
});

governanceRouter.delete("/governance/policies/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid policy id");
  if (!storage.deletePolicy(resolveWorkspaceId(req), id)) {
    return res.status(404).json({ error: "Policy not found" });
  }
  res.json({ ok: true });
});

// ─── Incidents & Statutory Breach Clocks ─────────────────────────────────────

governanceRouter.get("/governance/incidents", (req, res) => {
  res.json(storage.listIncidents(resolveWorkspaceId(req)));
});

governanceRouter.post("/governance/incidents", (req, res) => {
  const parsed = createIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid incident payload",
      parsed.error.issues,
    );
  }
  res.status(201).json(storage.createIncident(resolveWorkspaceId(req), parsed.data));
});

governanceRouter.patch("/governance/incidents/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid incident id");
  const parsed = updateIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid incident update",
      parsed.error.issues,
    );
  }
  const updated = storage.updateIncident(resolveWorkspaceId(req), id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Incident not found" });
  res.json(updated);
});

governanceRouter.delete("/governance/incidents/:id", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, "Invalid incident id");
  if (!storage.deleteIncident(resolveWorkspaceId(req), id)) {
    return res.status(404).json({ error: "Incident not found" });
  }
  res.json({ ok: true });
});
